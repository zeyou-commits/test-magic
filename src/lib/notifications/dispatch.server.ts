import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as typedDb } from "@/integrations/supabase/client.server";

// Tables communautaires pas encore présentes dans les types générés.
const db = typedDb as unknown as SupabaseClient;
import { portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";
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
  options: { openingCampaignId?: string; onlyOpenings?: boolean; messageId?: string } = {},
) {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  const pushConfigured = Boolean(publicKey && privateKey && subject);
  if (pushConfigured) webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  const now = Date.now();
  // La préparation est sans effet externe ; seules les campagnes validées seront diffusées.
  const prepared = await db.rpc("bw_prepare_opening_campaigns", {});
  if (prepared.error) throw prepared.error;
  const [follows, routes, ports, vessels] = await Promise.all([
    options.onlyOpenings || options.messageId
      ? Promise.resolve([])
      : collect((from, to) =>
          db
            .from("bw_follows")
            .select("id,user_id,target_kind,target_id,created_at")
            .eq("active", true)
            .order("id")
            .range(from, to),
        ),
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
    if (notice.category === "openings") focusIds.add(id);
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
    const [departures, signals, reviews, updates] = await Promise.all([
      collect((from, to) =>
        db
          .from("departures")
          .select("id,route_id,vessel_id,departure_at,status")
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
          .gte("created_at", since)
          .order("id")
          .range(from, to),
      ),
    ]);
    for (const follow of follows) {
      for (const update of updates)
        if (
          update.created_at >= follow.created_at &&
          (follow.target_kind === "departure"
            ? update.departure_id === follow.target_id
            : update.vessel_id === follow.target_id ||
              update.previous_vessel_id === follow.target_id)
        ) {
          await deliver(follow.user_id, follow.id, {
            key: `voyage-update:${follow.id}:${update.id}`,
            category: "reminders",
            title: update.title,
            body: update.body,
            url: `/?select=departure&id=${update.departure_id}`,
          });
        }
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
        if (stage && remaining > 0) {
          const route = routeById.get(next.route_id);
          const from = route ? portById.get(route.departure_port_id) : undefined;
          const to = route ? portById.get(route.arrival_port_id) : undefined;
          const portTime = new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: portTimeZone(from),
          }).format(new Date(Date.parse(next.departure_at) - 4 * HOUR));
          await deliver(follow.user_id, follow.id, {
            key: `departure:${follow.id}:${next.id}:${stage}`,
            category: "reminders",
            title: `${from?.name ?? "Départ"} → ${to?.name ?? "arrivée"} · départ dans ${stage}`,
            body: `Présentez-vous à ${from?.name ?? "votre port"} le ${portTime} (4 h avant, à confirmer auprès de la compagnie). Checklist : billets, pièces d’identité, documents du véhicule et essentiels à bord.`,
            url: `/?select=departure&id=${next.id}`,
          });
        }
      }
      // Accès au port de départ fermé ou dévié, signalé moins de 24 h avant sa traversée.
      if (next && Date.parse(next.departure_at) - now <= 24 * HOUR) {
        const route = routeById.get(next.route_id);
        const port = route ? portById.get(route.departure_port_id) : undefined;
        for (const signal of signals)
          if (
            port &&
            signal.target_kind === "port" &&
            signal.target_id === port.id &&
            signal.detail === "access_closed" &&
            signal.created_at >= follow.created_at
          )
            await deliver(follow.user_id, follow.id, {
              key: `port-access:${follow.id}:${signal.id}`,
              category: "community",
              title: `${port.name} · accès au port fermé ou dévié`,
              body: "Signalé sur place par des voyageurs. Prévoyez de la marge et vérifiez auprès de la compagnie.",
              url: `/?select=port&id=${port.id}`,
            });
      }
      const vesselId = follow.target_kind === "vessel" ? follow.target_id : next?.vessel_id;
      if (!vesselId) continue;
      const vesselName = vesselById.get(vesselId)?.name ?? "Votre bateau";
      for (const signal of signals)
        if (
          signal.target_kind === "vessel" &&
          signal.target_id === vesselId &&
          signal.created_at >= follow.created_at
        ) {
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
            body: "Un voyageur a publié un signalement. Consultez la fiche et vérifiez auprès de la compagnie.",
            url: `/?select=vessel&id=${vesselId}`,
          });
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

  const campaigns = options.messageId
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
  // Messages de l'équipe : celui envoyé tout de suite, ou ceux planifiés arrivés à échéance.
  const adminMessages = options.onlyOpenings
    ? { messages: 0, notificationIds: [] }
    : await queueAdminMessages(options.messageId ? { messageId: options.messageId } : {});
  for (const id of adminMessages.notificationIds) focusIds.add(id);
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
  if (!options.onlyOpenings) {
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
