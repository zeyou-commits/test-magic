import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as typedDb } from "@/integrations/supabase/client.server";

// Tables communautaires pas encore présentes dans les types générés.
const db = typedDb as unknown as SupabaseClient;
import { portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";
import { presentationLeadMinutes } from "@/lib/ferry/boarding";
import {
  notificationAllowed,
  openingApproved,
  type NotificationCategory,
  type NotificationPreferences,
} from "./policy";
import { queueAdminMessages } from "./messages.server";

type Notice = {
  key: string;
  title: string;
  body: string;
  url: string;
  category: NotificationCategory;
};
const HOUR = 3_600_000;
/** Rattrapage : une information publiée avant le suivi, encore d'actualité, est envoyée avec sa date. */
const CATCH_UP_WINDOW = 7 * 24 * HOUR;
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
function ago(iso: string, now: number) {
  const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `il y a ${minutes} min` : `il y a ${Math.round(minutes / 60)} h`;
}
/** Le plus récent de chaque groupe (même sujet) : un nouvel abonné reçoit l'état actuel, pas tout l'historique. */
function latestBy<T extends { created_at: string }>(items: T[], group: (item: T) => string) {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(group(item));
    if (!current || item.created_at > current.created_at) latest.set(group(item), item);
  }
  return [...latest.values()];
}
/** « départ dans 30 h », « départ dans 5 jours » : le vrai délai, même pour un suivi tardif. */
function remainingLabel(remaining: number) {
  return remaining < 48 * HOUR
    ? `${Math.max(1, Math.round(remaining / HOUR))} h`
    : `${Math.round(remaining / (24 * HOUR))} jours`;
}
async function collect<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await page(offset, offset + 499);
    if (response.error) throw response.error;
    result.push(...(response.data ?? []));
    if (!response.data || response.data.length < 500) return result;
  }
}

export async function dispatchPush(
  options: {
    openingCampaignId?: string;
    onlyOpenings?: boolean;
    messageId?: string;
    /** Rattrapage d'un seul compte : juste après un suivi ou l'activation d'un téléphone. */
    userId?: string;
  } = {},
) {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  const pushConfigured = Boolean(publicKey && privateKey && subject);
  // Mode « un seul compte » : les requêtes de suivis et d'alertes sont limitées à lui.
  const onlyUser = options.userId ? [options.userId] : undefined;
  if (pushConfigured) webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  const now = Date.now();
  // La préparation est sans effet externe ; seules les campagnes validées seront diffusées.
  const prepared = await db.rpc("bw_prepare_opening_campaigns", {});
  if (prepared.error) throw prepared.error;
  const [follows, routes, ports, vessels] = await Promise.all([
    options.onlyOpenings || options.messageId
      ? Promise.resolve([])
      : collect((from, to) => {
          const query = db
            .from("bw_follows")
            .select("id,user_id,target_kind,target_id,created_at,traveller,follow_purpose")
            .eq("active", true);
          return (onlyUser ? query.in("user_id", onlyUser) : query).order("id").range(from, to);
        }),
    collect((from, to) =>
      db
        .from("routes")
        .select("id,departure_port_id,arrival_port_id,status")
        .order("id")
        .range(from, to),
    ),
    collect((from, to) =>
      db.from("ports").select("id,name,country_code,status").order("id").range(from, to),
    ),
    collect((from, to) => db.from("vessels").select("id,name").order("id").range(from, to)),
  ]);
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const portById = new Map(ports.map((port) => [port.id, port]));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const preferenceCache = new Map<string, NotificationPreferences | undefined>();
  async function preferences(userId: string) {
    if (!preferenceCache.has(userId)) {
      const { data, error } = await db
        .from("bw_notification_preferences")
        .select("reminders,community,openings,push_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      preferenceCache.set(userId, data ?? undefined);
    }
    return preferenceCache.get(userId);
  }
  let created = 0;
  let pushed = 0;
  let publishedCampaigns = 0;
  // Notifications à envoyer en priorité (campagne validée ou message de l'équipe envoyé tout de suite).
  const focusIds = new Set<string>();
  async function deliver(userId: string, followId: string | null, notice: Notice) {
    const prefs = await preferences(userId);
    if (!notificationAllowed(prefs, notice.category)) return;
    const inserted = await db
      .from("bw_notifications")
      .upsert(
        {
          user_id: userId,
          follow_id: followId,
          event_key: notice.key,
          title: notice.title,
          body: notice.body,
          url: notice.url,
        },
        { onConflict: "user_id,event_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    let id = inserted.data?.id;
    if (id) created++;
    else {
      const existing = await db
        .from("bw_notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("event_key", notice.key)
        .single();
      if (existing.error) throw existing.error;
      id = existing.data.id;
    }
    if (notice.category === "openings" || options.userId) focusIds.add(id);
    if (prefs?.push_enabled === false) return;
    const subscriptions = await db.from("bw_push_subscriptions").select("id").eq("user_id", userId);
    if (subscriptions.error) throw subscriptions.error;
    for (const subscription of subscriptions.data ?? []) {
      const queued = await db
        .from("bw_push_deliveries")
        .upsert(
          { notification_id: id, subscription_id: subscription.id },
          { onConflict: "notification_id,subscription_id", ignoreDuplicates: true },
        );
      if (queued.error) throw queued.error;
    }
  }
  if (follows.length) {
    const since = new Date(now - 26 * HOUR).toISOString();
    const catchUpSince = new Date(now - CATCH_UP_WINDOW).toISOString();
    const [departures, signals, reviews, updates] = await Promise.all([
      collect((from, to) =>
        db
          .from("departures")
          .select("id,route_id,vessel_id,departure_at,status,presentation_minutes")
          .gte("departure_at", new Date(now).toISOString())
          .lte("departure_at", new Date(now + 8 * 24 * HOUR).toISOString())
          .neq("status", "cancelled")
          .eq("is_demo", false)
          .order("id")
          .range(from, to),
      ),
      collect((from, to) =>
        db
          .from("bw_travel_alerts")
          .select("id,target_kind,target_id,category,delay_minutes,detail,created_at")
          .eq("resolved", false)
          .gte("created_at", since)
          .gt("expires_at", new Date(now).toISOString())
          .order("id")
          .range(from, to),
      ),
      collect((from, to) =>
        db
          .from("bw_vessel_reviews")
          .select("id,vessel_id,comment,updated_at")
          .eq("status", "published")
          .gte("updated_at", since)
          .order("id")
          .range(from, to),
      ),
      collect((from, to) =>
        db
          .from("bw_voyage_events")
          .select("id,departure_id,vessel_id,previous_vessel_id,title,body,created_at")
          .gte("created_at", catchUpSince)
          .order("id")
          .range(from, to),
      ),
    ]);
    // Date des traversées concernées par une mise à jour : le rattrapage s'arrête au départ.
    const eventDepartureIds = [...new Set(updates.map((update) => update.departure_id))];
    const eventDepartureAt = new Map<string, string>();
    for (let index = 0; index < eventDepartureIds.length; index += 200) {
      const part = await db
        .from("departures")
        .select("id,departure_at")
        .in("id", eventDepartureIds.slice(index, index + 200));
      if (part.error) throw part.error;
      for (const row of part.data ?? []) eventDepartureAt.set(row.id, row.departure_at);
    }
    for (const follow of follows) {
      const followUpdates = updates.filter((update) =>
        follow.target_kind === "departure"
          ? update.departure_id === follow.target_id
          : update.vessel_id === follow.target_id || update.previous_vessel_id === follow.target_id,
      );
      for (const update of followUpdates)
        if (update.created_at >= follow.created_at && update.created_at >= since)
          await deliver(follow.user_id, follow.id, {
            key: `voyage-update:${follow.id}:${update.id}`,
            category: "reminders",
            title: update.title,
            body: update.body,
            url: `/?select=departure&id=${update.departure_id}`,
          });
      // Suivi (ou « Ma traversée ») déclaré après coup : la dernière mise à jour, si le départ est à venir.
      const earlier =
        follow.target_kind === "departure"
          ? latestBy(
              followUpdates.filter((update) => update.created_at < follow.created_at),
              () => "departure",
            )[0]
          : undefined;
      const earlierAt = earlier ? eventDepartureAt.get(earlier.departure_id) : undefined;
      if (earlier && earlierAt && Date.parse(earlierAt) > now)
        await deliver(follow.user_id, follow.id, {
          key: `voyage-update:${follow.id}:${earlier.id}`,
          category: "reminders",
          title: earlier.title,
          body: `Mise à jour du ${stamp(earlier.created_at)} · ${earlier.body}`,
          url: `/?select=departure&id=${earlier.departure_id}`,
        });
      const next = departures
        .filter((departure) =>
          follow.target_kind === "departure"
            ? departure.id === follow.target_id
            : departure.vessel_id === follow.target_id,
        )
        .sort((a, b) => a.departure_at.localeCompare(b.departure_at))[0];
      if (next) {
        const remaining = Date.parse(next.departure_at) - now;
        const stage =
          remaining <= 24 * HOUR
            ? "24h"
            : remaining <= 48 * HOUR
              ? "48h"
              : remaining <= 7 * 24 * HOUR
                ? "7j"
                : null;
        const personalTrip = follow.target_kind === "departure" && follow.traveller === true;
        // Le suivi d'un navire associé à « je voyage » ne double pas les rappels de la traversée.
        if (stage && remaining > 0 && (personalTrip || (stage === "24h" && follow.follow_purpose !== "voyageur"))) {
          const route = routeById.get(next.route_id);
          const from = route ? portById.get(route.departure_port_id) : undefined;
          const to = route ? portById.get(route.arrival_port_id) : undefined;
          const presentation = new Date(Date.parse(next.departure_at) - presentationLeadMinutes(next.presentation_minutes) * 60_000);
          const portTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: portTimeZone(from) }).format(presentation);
          await deliver(follow.user_id, follow.id, {
            key: `departure:${follow.id}:${next.id}:${stage}`,
            category: "reminders",
            title: `${from?.name ?? "Départ"} → ${to?.name ?? "arrivée"} · départ dans ${remainingLabel(remaining)}`,
            body: personalTrip
              ? `Présentation à ${from?.name ?? "votre port"} : ${portTime}${next.presentation_minutes == null ? " (repère indicatif : 4 h avant)" : " (consigne renseignée)"}. Vérifiez votre billet et vos préparatifs encore ouverts.`
              : "Retrouvez les horaires et les changements publiés pour cette traversée.",
            url: `/?select=departure&id=${next.id}`,
          });
        }
      }
      // Accès au port de départ fermé ou dévié, signalé moins de 24 h avant sa traversée.
      if (next && Date.parse(next.departure_at) - now <= 24 * HOUR) {
        const route = routeById.get(next.route_id);
        const port = route ? portById.get(route.departure_port_id) : undefined;
        const access = signals.filter(
          (signal) =>
            port &&
            signal.target_kind === "port" &&
            signal.target_id === port.id &&
            signal.detail === "access_closed",
        );
        const fresh = access.filter((signal) => signal.created_at >= follow.created_at);
        // Avant le suivi : seul le plus récent, toujours actif (non résolu, non expiré).
        const late = fresh.length
          ? []
          : latestBy(
              access.filter((signal) => signal.created_at < follow.created_at),
              () => "access",
            );
        for (const signal of [...fresh, ...late])
          await deliver(follow.user_id, follow.id, {
            key: `port-access:${follow.id}:${signal.id}`,
            category: "community",
            title: `${port!.name} · accès au port fermé ou dévié`,
            body: `Signalé sur place par des voyageurs${late.includes(signal) ? ` ${ago(signal.created_at, now)}` : ""}. Prévoyez de la marge et vérifiez auprès de la compagnie.`,
            url: `/?select=port&id=${port!.id}`,
          });
      }
      const vesselId = follow.target_kind === "vessel" ? follow.target_id : next?.vessel_id;
      if (!vesselId) continue;
      const vesselName = vesselById.get(vesselId)?.name ?? "Votre bateau";
      const vesselSignals = signals.filter(
        (signal) => signal.target_kind === "vessel" && signal.target_id === vesselId,
      );
      // Signalements encore actifs publiés avant le suivi : le plus récent de chaque sujet.
      const lateSignals = latestBy(
        vesselSignals.filter((signal) => signal.created_at < follow.created_at),
        (signal) => `${signal.category}:${signal.detail ?? ""}`,
      ).filter(
        (late) =>
          !vesselSignals.some(
            (signal) =>
              signal.created_at >= follow.created_at &&
              signal.category === late.category &&
              (signal.detail ?? "") === (late.detail ?? ""),
          ),
      );
      for (const signal of [
        ...vesselSignals.filter((signal) => signal.created_at >= follow.created_at),
        ...lateSignals,
      ]) {
        {
          const topic =
            signal.category === "delay"
              ? `Retard signalé${signal.delay_minutes ? ` · environ ${signal.delay_minutes} min` : ""}`
              : signal.category === "boarding"
                ? "Information d’embarquement"
                : "Information voyageurs";
          await deliver(follow.user_id, follow.id, {
            key: `signal:${follow.id}:${signal.id}`,
            category: "community",
            title: `${vesselName} · ${topic}`,
            body: lateSignals.includes(signal)
              ? `Signalé par un voyageur ${ago(signal.created_at, now)}, toujours d’actualité. Consultez la fiche et vérifiez auprès de la compagnie.`
              : "Un voyageur a publié un signalement. Consultez la fiche et vérifiez auprès de la compagnie.",
            url: `/?select=vessel&id=${vesselId}`,
          });
        }
      }
      for (const review of reviews)
        if (
          review.vessel_id === vesselId &&
          review.updated_at >= follow.created_at &&
          review.comment.trim()
        )
          await deliver(follow.user_id, follow.id, {
            key: `review:${follow.id}:${review.id}`,
            category: "community",
            title: `${vesselName} · nouvel avis`,
            body: review.comment.slice(0, 160),
            url: `/?select=vessel&id=${vesselId}`,
          });
    }
  }

  const campaigns =
    options.messageId || options.userId
      ? { data: [], error: null }
      : await db
          .from("bw_notification_campaigns")
          .select("id,route_id,period_month,status")
          .eq("status", "approved");
  if (campaigns.error) throw campaigns.error;
  for (const campaign of campaigns.data ?? []) {
    if (
      !openingApproved(campaign.status) ||
      (options.openingCampaignId && campaign.id !== options.openingCampaignId)
    )
      continue;
    const route = routeById.get(campaign.route_id);
    const from = route ? portById.get(route.departure_port_id) : undefined;
    const to = route ? portById.get(route.arrival_port_id) : undefined;
    const end = new Date(`${campaign.period_month}T12:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const zone = portTimeZone(from);
    const first = await db
      .from("departures")
      .select("id")
      .eq("route_id", campaign.route_id)
      .gte(
        "departure_at",
        new Date(
          Math.max(now, zonedTimeToUtc(campaign.period_month, "00:00", zone).getTime()),
        ).toISOString(),
      )
      .lt(
        "departure_at",
        zonedTimeToUtc(end.toISOString().slice(0, 10), "00:00", zone).toISOString(),
      )
      .neq("status", "cancelled")
      .eq("is_demo", false)
      .limit(1);
    if (first.error) throw first.error;
    if (
      !first.data.length ||
      route?.status !== "active" ||
      from?.status !== "active" ||
      to?.status !== "active"
    ) {
      const dismissed = await db
        .from("bw_notification_campaigns")
        .update({
          status: "dismissed",
          last_error: "Aucun départ publié actif ne correspond encore à cette période.",
        })
        .eq("id", campaign.id);
      if (dismissed.error) throw dismissed.error;
      continue;
    }
    const watches = await collect((start, stop) =>
      db
        .from("bw_itinerary_watches")
        .select("id,user_id,origin_label,destination_label")
        .eq("route_id", campaign.route_id)
        .eq("period_month", campaign.period_month)
        .eq("active", true)
        .order("id")
        .range(start, stop),
    );
    const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
      new Date(`${campaign.period_month}T12:00:00Z`),
    );
    for (const watch of watches)
      await deliver(watch.user_id, null, {
        key: `opening:${watch.id}`,
        category: "openings",
        title: `${from.name} → ${to.name} : les traversées sont publiées`,
        body: `Des départs sont disponibles en ${month}. Retrouvez votre parcours ${watch.origin_label} → ${watch.destination_label} et comparez les traversées.`,
        url: `/horaires?from=${route.departure_port_id}&to=${route.arrival_port_id}&month=${campaign.period_month.slice(0, 7)}`,
      });
    const updated = await db
      .from("bw_notification_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", campaign.id)
      .eq("status", "approved");
    if (updated.error) throw updated.error;
    publishedCampaigns++;
  }
  // Alerte « prévenez-moi » créée après l'annonce d'ouverture : on l'annonce aussi, une fois.
  if (!options.messageId && !options.onlyOpenings) {
    const opened = await db
      .from("bw_notification_campaigns")
      .select("route_id,period_month,sent_at")
      .eq("status", "sent")
      .gte("period_month", `${new Date(now).toISOString().slice(0, 7)}-01`);
    if (opened.error) throw opened.error;
    for (const campaign of opened.data ?? []) {
      if (!campaign.sent_at) continue;
      const route = routeById.get(campaign.route_id);
      const from = route ? portById.get(route.departure_port_id) : undefined;
      const to = route ? portById.get(route.arrival_port_id) : undefined;
      if (!route || route.status !== "active" || !from || !to) continue;
      const watchQuery = db
        .from("bw_itinerary_watches")
        .select("id,user_id,origin_label,destination_label")
        .eq("route_id", campaign.route_id)
        .eq("period_month", campaign.period_month)
        .eq("active", true)
        .gt("created_at", campaign.sent_at);
      const watches = await (onlyUser ? watchQuery.in("user_id", onlyUser) : watchQuery).limit(
        2000,
      );
      if (watches.error) throw watches.error;
      const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
        new Date(`${campaign.period_month}T12:00:00Z`),
      );
      for (const watch of watches.data ?? [])
        await deliver(watch.user_id, null, {
          key: `opening:${watch.id}`,
          category: "openings",
          title: `${from.name} → ${to.name} : les traversées sont déjà publiées`,
          body: `Des départs sont disponibles en ${month}. Retrouvez votre parcours ${watch.origin_label} → ${watch.destination_label} et comparez les traversées.`,
          url: `/horaires?from=${route.departure_port_id}&to=${route.arrival_port_id}&month=${String(campaign.period_month).slice(0, 7)}`,
        });
    }
  }
  // « Merci » reçus : l'auteur d'un signalement ou d'un avis est prévenu, une fois par jour au plus
  // (« Jeddi 1934 et 2 autres vous remercient »). Ses réglages « actualités » sont respectés.
  if (!options.onlyOpenings && !options.messageId && !options.userId) {
    const thanks = await db
      .from("bw_reactions")
      .select("target_kind,target_id,user_id")
      .eq("code", "merci")
      .gte("created_at", new Date(now - 26 * HOUR).toISOString())
      .limit(2000);
    // Script communauté pas encore exécuté : rien à faire.
    if (thanks.error && !["PGRST205", "42P01"].includes(thanks.error.code ?? ""))
      throw thanks.error;
    const rows = (thanks.data ?? []) as {
      target_kind: string;
      target_id: string;
      user_id: string;
    }[];
    if (rows.length) {
      const authorOf = new Map<string, string>();
      for (const [kind, table] of [
        ["alert", "bw_travel_alerts"],
        ["port_review", "port_reviews"],
        ["vessel_review", "bw_vessel_reviews"],
      ] as const) {
        const ids = [
          ...new Set(rows.filter((row) => row.target_kind === kind).map((row) => row.target_id)),
        ];
        for (let index = 0; index < ids.length; index += 200) {
          const part = await db
            .from(table)
            .select("id,user_id")
            .in("id", ids.slice(index, index + 200));
          if (part.error) throw part.error;
          for (const row of part.data ?? [])
            authorOf.set(`${kind}:${row.id}`, row.user_id as string);
        }
      }
      const thankers = new Map<string, Set<string>>();
      for (const row of rows) {
        const author = authorOf.get(`${row.target_kind}:${row.target_id}`);
        if (!author || author === row.user_id) continue;
        if (!thankers.has(author)) thankers.set(author, new Set());
        thankers.get(author)!.add(row.user_id);
      }
      const everyone = [...new Set([...thankers.values()].flatMap((set) => [...set]))];
      const pseudo = new Map<string, string>();
      for (let index = 0; index < everyone.length; index += 200) {
        const part = await db
          .from("bw_traveller_profiles")
          .select("user_id,pseudo")
          .in("user_id", everyone.slice(index, index + 200));
        if (part.error) throw part.error;
        for (const row of part.data ?? []) pseudo.set(row.user_id as string, row.pseudo as string);
      }
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
        new Date(now),
      );
      for (const [author, set] of thankers) {
        const names = [...set].map((id) => pseudo.get(id) ?? "Un voyageur");
        const others = names.length - 1;
        await deliver(author, null, {
          key: `thanks:${author}:${day}`,
          category: "community",
          title: "Merci pour vos infos ❤",
          body: others
            ? `${names[0]} et ${others} autre${others > 1 ? "s" : ""} vous remercient pour votre aide.`
            : `${names[0]} vous remercie pour votre aide.`,
          url: "/compte#contributions",
        });
      }
    }
  }
  // Messages de l'équipe : celui envoyé tout de suite, ou ceux planifiés arrivés à échéance.
  const adminMessages = options.onlyOpenings
    ? { messages: 0, notificationIds: [] }
    : await queueAdminMessages(
        options.messageId
          ? { messageId: options.messageId }
          : options.userId
            ? { userId: options.userId }
            : {},
      );
  for (const id of adminMessages.notificationIds) focusIds.add(id);
  // Téléphone activé après coup : ses notifications récentes non lues (24 h, 3 au plus) partent
  // aussi sur ce téléphone. Celles déjà envoyées à un appareil ne sont pas renvoyées à cet appareil.
  if (options.userId) {
    const [recent, devices] = await Promise.all([
      db
        .from("bw_notifications")
        .select("id")
        .eq("user_id", options.userId)
        .is("read_at", null)
        .gte("created_at", new Date(now - 24 * HOUR).toISOString())
        .order("created_at", { ascending: false })
        .limit(3),
      db.from("bw_push_subscriptions").select("id").eq("user_id", options.userId),
    ]);
    if (recent.error) throw recent.error;
    if (devices.error) throw devices.error;
    const rows = (recent.data ?? []).flatMap((notice) =>
      (devices.data ?? []).map((device) => ({
        notification_id: notice.id,
        subscription_id: device.id,
      })),
    );
    if (rows.length) {
      const queued = await db
        .from("bw_push_deliveries")
        .upsert(rows, { onConflict: "notification_id,subscription_id", ignoreDuplicates: true });
      if (queued.error) throw queued.error;
    }
    for (const notice of recent.data ?? []) focusIds.add(notice.id);
  }
  // Les messages sont toujours créés dans le compte, même sans configuration VAPID.
  const pendingRows = (ids?: string[]) => {
    const query = db
      .from("bw_push_deliveries")
      .select("notification_id,subscription_id,attempts")
      .is("sent_at", null)
      .lt("attempts", 5)
      .order("notification_id")
      .limit(500);
    return ids ? query.in("notification_id", ids) : query;
  };
  const queuedRows: { notification_id: string; subscription_id: string; attempts: number }[] = [];
  // D'abord les envois prioritaires (par lots, pour garder des requêtes courtes), puis le reste.
  const focus = [...focusIds];
  for (let index = 0; index < focus.length; index += 100) {
    const part = await pendingRows(focus.slice(index, index + 100));
    if (part.error) throw part.error;
    queuedRows.push(...part.data);
  }
  if (!options.onlyOpenings && !options.userId) {
    const rest = await pendingRows();
    if (rest.error) throw rest.error;
    const seen = new Set(queuedRows.map((row) => `${row.notification_id}:${row.subscription_id}`));
    queuedRows.push(
      ...rest.data.filter((row) => !seen.has(`${row.notification_id}:${row.subscription_id}`)),
    );
  }
  if (pushConfigured)
    for (const row of queuedRows) {
      const [notice, subscription] = await Promise.all([
        db
          .from("bw_notifications")
          .select("id,user_id,follow_id,title,body,url,event_key")
          .eq("id", row.notification_id)
          .single(),
        db
          .from("bw_push_subscriptions")
          .select("id,user_id,endpoint,p256dh,auth_key")
          .eq("id", row.subscription_id)
          .single(),
      ]);
      if (notice.error || subscription.error) continue;
      const prefs = await preferences(notice.data.user_id);
      const adminCategory = /^admin-msg:(reminders|community):/.exec(notice.data.event_key)?.[1] as
        "reminders" | "community" | undefined;
      const category = notice.data.event_key.startsWith("opening:")
        ? "openings"
        : adminCategory
          ? adminCategory
          : /^(departure|voyage-update):/.test(notice.data.event_key)
            ? "reminders"
            : "community";
      const follow = notice.data.follow_id
        ? await db.from("bw_follows").select("active").eq("id", notice.data.follow_id).maybeSingle()
        : null;
      if (follow?.error) throw follow.error;
      if (
        prefs?.push_enabled === false ||
        !notificationAllowed(prefs, category) ||
        (notice.data.follow_id && !follow?.data?.active) ||
        notice.data.user_id !== subscription.data.user_id
      ) {
        const removed = await db
          .from("bw_push_deliveries")
          .delete()
          .eq("notification_id", row.notification_id)
          .eq("subscription_id", row.subscription_id);
        if (removed.error) throw removed.error;
        continue;
      }
      const lease = new Date(Date.now() + 2 * 60_000).toISOString();
      const claim = await db
        .from("bw_push_deliveries")
        .update({ attempts: row.attempts + 1, leased_until: lease })
        .eq("notification_id", row.notification_id)
        .eq("subscription_id", row.subscription_id)
        .eq("attempts", row.attempts)
        .is("sent_at", null)
        .or(`leased_until.is.null,leased_until.lt.${new Date().toISOString()}`)
        .select("notification_id")
        .maybeSingle();
      if (claim.error) throw claim.error;
      if (!claim.data) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.data.endpoint,
            keys: { p256dh: subscription.data.p256dh, auth: subscription.data.auth_key },
          },
          JSON.stringify({
            title: notice.data.title,
            body: notice.data.body,
            url: notice.data.url,
            tag: notice.data.event_key,
          }),
          { TTL: 24 * 3600, timeout: 15_000 },
        );
        pushed++;
        const delivered = await db
          .from("bw_push_deliveries")
          .update({ sent_at: new Date().toISOString(), last_error: null, leased_until: null })
          .eq("notification_id", row.notification_id)
          .eq("subscription_id", row.subscription_id);
        if (delivered.error) throw delivered.error;
        await db
          .from("bw_push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", subscription.data.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db.from("bw_push_subscriptions").delete().eq("id", subscription.data.id);
        else
          await db
            .from("bw_push_deliveries")
            .update({
              last_error: String(status ?? "Échec de livraison Web Push"),
              leased_until: null,
            })
            .eq("notification_id", row.notification_id)
            .eq("subscription_id", row.subscription_id);
      }
    }
  const outstanding = await db
    .from("bw_push_deliveries")
    .select("notification_id", { count: "exact", head: true })
    .is("sent_at", null);
  if (outstanding.error) throw outstanding.error;
  return {
    followed: follows.length,
    created,
    pushed,
    publishedCampaigns,
    adminMessages: adminMessages.messages,
    pending: outstanding.count ?? 0,
    pushConfigured,
  };
}
