import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as typedDb } from "@/integrations/supabase/client.server";
import { portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";
import type { Audience, AudienceContext, AudiencePreview, AudienceRecipient } from "./messages";
import {
  notificationAllowed,
  type NotificationCategory,
  type NotificationPreferences,
} from "./policy";

// Tables pas encore présentes dans les types générés.
const db = typedDb as unknown as SupabaseClient;
const DAY = 86_400_000;
/** Fenêtre des traversées à venir prises en compte pour un bateau ou une ligne. */
const HORIZON = 60 * DAY;

type Port = { id: string; name: string; country_code: string };
type Departure = { id: string; route_id: string; vessel_id: string | null; departure_at: string };
type Follow = {
  id: string;
  user_id: string;
  target_kind: string;
  target_id: string;
  traveller?: boolean;
};
export type Recipient = {
  followId: string | null;
  traveller: boolean | null;
  via: "departure" | "vessel" | "watch" | "account";
};
export type ResolvedAudience = {
  label: string;
  context: AudienceContext;
  category: NotificationCategory;
  recipients: Map<string, Recipient>;
  travellerKnown: boolean;
  /** Fin de l'actualité de la cible (départ passé, jour terminé) ; null si elle n'en a pas. */
  relevantUntil: string | null;
};

const missing = (error: { code?: string } | null) =>
  Boolean(error && ["PGRST205", "42P01", "PGRST202"].includes(error.code ?? ""));
function chunks<T>(items: T[], size = 200) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}
async function single<T>(table: string, columns: string, id: string): Promise<T | null> {
  const { data, error } = await db.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as T | null;
}
function whenLabel(iso: string, timeZone: string, withTime = true) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
  if (!withTime) return `le ${day}`;
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `le ${day} à ${time}`;
}

/** Suivis actifs des traversées ou bateaux donnés (la colonne « voyageur » existe depuis le 02/11/2026). */
let travellerColumn = true;
async function followsOf(kind: "departure" | "vessel", ids: string[]): Promise<Follow[]> {
  const rows: Follow[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const run = (columns: string) =>
      db
        .from("bw_follows")
        .select(columns)
        .eq("active", true)
        .eq("target_kind", kind)
        .in("target_id", part);
    let result = await run(
      `id,user_id,target_kind,target_id${travellerColumn ? ",traveller" : ""}`,
    );
    if (result.error?.code === "42703" && travellerColumn) {
      travellerColumn = false;
      result = await run("id,user_id,target_kind,target_id");
    }
    if (result.error) throw result.error;
    rows.push(...((result.data ?? []) as unknown as Follow[]));
  }
  return rows;
}
async function upcomingDepartures(
  filter:
    | { column: "vessel_id" | "route_id"; value: string }
    | { routeIds: string[]; from: string; to: string },
) {
  let query = db
    .from("departures")
    .select("id,route_id,vessel_id,departure_at")
    .neq("status", "cancelled")
    .eq("is_demo", false)
    .order("departure_at")
    .limit(2000);
  if ("column" in filter)
    query = query
      .eq(filter.column, filter.value)
      .gte("departure_at", new Date().toISOString())
      .lt("departure_at", new Date(Date.now() + HORIZON).toISOString());
  else
    query = query
      .in("route_id", filter.routeIds)
      .gte("departure_at", filter.from)
      .lt("departure_at", filter.to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Departure[];
}
async function routeEnds(routeId: string) {
  const route = await single<{ id: string; departure_port_id: string; arrival_port_id: string }>(
    "routes",
    "id,departure_port_id,arrival_port_id",
    routeId,
  );
  if (!route) throw new Error("Ligne introuvable.");
  const [from, to] = await Promise.all([
    single<Port>("ports", "id,name,country_code", route.departure_port_id),
    single<Port>("ports", "id,name,country_code", route.arrival_port_id),
  ]);
  return { route, from, to };
}

/** Comptes à prévenir pour une cible : les voyageurs d'abord, puis les proches qui suivent. */
export async function resolveAudience(audience: Audience): Promise<ResolvedAudience> {
  const recipients = new Map<string, Recipient>();
  const add = (follows: Follow[]) => {
    // Un compte reçoit un seul message, rattaché de préférence à son suivi « je voyage ».
    for (const follow of follows) {
      const current = recipients.get(follow.user_id);
      const traveller = travellerColumn ? Boolean(follow.traveller) : null;
      if (!current || (traveller && !current.traveller))
        recipients.set(follow.user_id, {
          followId: follow.id,
          traveller,
          via: follow.target_kind === "vessel" ? "vessel" : "departure",
        });
    }
  };
  if (audience.kind === "departure") {
    const departure = await single<Departure>(
      "departures",
      "id,route_id,vessel_id,departure_at",
      audience.departureId,
    );
    if (!departure) throw new Error("Traversée introuvable.");
    const [{ from, to }, vessel] = await Promise.all([
      routeEnds(departure.route_id),
      departure.vessel_id
        ? single<{ name: string }>("vessels", "name", departure.vessel_id)
        : Promise.resolve(null),
    ]);
    const follows = await followsOf("departure", [departure.id]);
    add(
      audience.who === "travellers" && travellerColumn
        ? follows.filter((f) => f.traveller)
        : follows,
    );
    const subject = `${from?.name ?? "Départ"} → ${to?.name ?? "arrivée"}`;
    const when = whenLabel(departure.departure_at, portTimeZone(from));
    return {
      label: `${subject}, ${when}${audience.who === "travellers" ? " · voyageurs" : ""}`,
      context: {
        subject,
        ...(from ? { from: from.name, port: from.name } : {}),
        ...(to ? { to: to.name } : {}),
        ...(vessel ? { vessel: vessel.name } : {}),
        when,
        url: `/?select=departure&id=${departure.id}`,
        urlLabel: "la fiche de la traversée",
      },
      category: "reminders",
      recipients,
      travellerKnown: travellerColumn,
      relevantUntil: new Date(Date.parse(departure.departure_at) + 2 * 3_600_000).toISOString(),
    };
  }
  if (audience.kind === "vessel_followers") {
    const vessel = await single<{ id: string; name: string }>(
      "vessels",
      "id,name",
      audience.vesselId,
    );
    if (!vessel) throw new Error("Bateau introuvable.");
    add(await followsOf("vessel", [vessel.id]));
    return {
      label: `Personnes qui suivent ${vessel.name}`,
      context: {
        subject: vessel.name,
        vessel: vessel.name,
        url: `/?select=vessel&id=${vessel.id}`,
        urlLabel: "la fiche du bateau",
      },
      category: "reminders",
      recipients,
      travellerKnown: false,
      relevantUntil: null,
    };
  }
  if (audience.kind === "vessel") {
    const vessel = await single<{ id: string; name: string }>(
      "vessels",
      "id,name",
      audience.vesselId,
    );
    if (!vessel) throw new Error("Bateau introuvable.");
    const departures = await upcomingDepartures({ column: "vessel_id", value: vessel.id });
    add(
      await followsOf(
        "departure",
        departures.map((d) => d.id),
      ),
    );
    add(await followsOf("vessel", [vessel.id]));
    return {
      label: `${vessel.name} · suivis et traversées des 60 prochains jours`,
      context: {
        subject: vessel.name,
        vessel: vessel.name,
        url: `/?select=vessel&id=${vessel.id}`,
        urlLabel: "la fiche du bateau",
      },
      category: "reminders",
      recipients,
      travellerKnown: travellerColumn,
      relevantUntil: null,
    };
  }
  if (audience.kind === "port_day") {
    const port = await single<Port>("ports", "id,name,country_code", audience.portId);
    if (!port) throw new Error("Port introuvable.");
    const zone = portTimeZone(port);
    const start = zonedTimeToUtc(audience.date, "00:00", zone);
    const next = new Date(start.getTime() + 36 * 3_600_000).toISOString().slice(0, 10);
    const end = zonedTimeToUtc(next, "00:00", zone);
    const { data: routes, error } = await db
      .from("routes")
      .select("id")
      .eq("departure_port_id", port.id);
    if (error) throw error;
    const routeIds = (routes ?? []).map((route) => route.id as string);
    const departures = routeIds.length
      ? await upcomingDepartures({ routeIds, from: start.toISOString(), to: end.toISOString() })
      : [];
    add(
      await followsOf(
        "departure",
        departures.map((d) => d.id),
      ),
    );
    const vesselIds = departures.flatMap((d) => (d.vessel_id ? [d.vessel_id] : []));
    if (vesselIds.length) add(await followsOf("vessel", vesselIds));
    const day = whenLabel(start.toISOString(), zone, false);
    return {
      label: `Départs de ${port.name} ${day} (${departures.length} traversée${departures.length > 1 ? "s" : ""})`,
      context: {
        subject: port.name,
        port: port.name,
        when: day,
        url: `/?select=port&id=${port.id}`,
        urlLabel: "la fiche du port",
      },
      category: "reminders",
      recipients,
      travellerKnown: travellerColumn,
      relevantUntil: end.toISOString(),
    };
  }
  if (audience.kind === "route") {
    const { route, from, to } = await routeEnds(audience.routeId);
    const departures = await upcomingDepartures({ column: "route_id", value: route.id });
    add(
      await followsOf(
        "departure",
        departures.map((d) => d.id),
      ),
    );
    // Les alertes « prévenez-moi quand les traversées ouvrent » sur cette ligne, à partir de ce mois-ci.
    const month = `${new Date().toISOString().slice(0, 7)}-01`;
    const watches = await db
      .from("bw_itinerary_watches")
      .select("user_id")
      .eq("route_id", route.id)
      .eq("active", true)
      .gte("period_month", month)
      .limit(5000);
    if (watches.error) throw watches.error;
    for (const watch of watches.data ?? [])
      if (!recipients.has(watch.user_id as string))
        recipients.set(watch.user_id as string, { followId: null, traveller: null, via: "watch" });
    const subject = `${from?.name ?? "Départ"} → ${to?.name ?? "arrivée"}`;
    return {
      label: `Ligne ${subject} · suivis et alertes`,
      context: {
        subject,
        ...(from ? { from: from.name, port: from.name } : {}),
        ...(to ? { to: to.name } : {}),
        url: `/horaires?from=${route.departure_port_id}&to=${route.arrival_port_id}`,
        urlLabel: "les horaires de la ligne",
      },
      category: "reminders",
      recipients,
      travellerKnown: false,
      relevantUntil: null,
    };
  }
  if (audience.kind === "port") {
    // Toutes les traversées à venir qui partent de ce port ou y arrivent.
    const port = await single<Port>("ports", "id,name,country_code", audience.portId);
    if (!port) throw new Error("Port introuvable.");
    const { data: routes, error } = await db
      .from("routes")
      .select("id")
      .or(`departure_port_id.eq.${port.id},arrival_port_id.eq.${port.id}`);
    if (error) throw error;
    const routeIds = (routes ?? []).map((route) => route.id as string);
    const departures = routeIds.length
      ? await upcomingDepartures({
          routeIds,
          from: new Date().toISOString(),
          to: new Date(Date.now() + HORIZON).toISOString(),
        })
      : [];
    add(
      await followsOf(
        "departure",
        departures.map((d) => d.id),
      ),
    );
    return {
      label: `${port.name} · traversées des 60 prochains jours (${departures.length})`,
      context: {
        subject: port.name,
        port: port.name,
        url: `/?select=port&id=${port.id}`,
        urlLabel: "la fiche du port",
      },
      category: "reminders",
      recipients,
      travellerKnown: travellerColumn,
      relevantUntil: null,
    };
  }
  // Tout le monde : chaque compte, qu'il suive ou non une traversée.
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users)
      if (!user.banned_until || Date.parse(user.banned_until) <= Date.now())
        recipients.set(user.id, { followId: null, traveller: null, via: "account" });
    if (data.users.length < 1000) break;
  }
  return {
    label: "Tous les comptes BledWay",
    context: { subject: "BledWay", url: "/", urlLabel: "l’accueil de BledWay" },
    category: "community",
    recipients,
    travellerKnown: false,
    relevantUntil: null,
  };
}

/** Préférences des comptes : ceux qui refusent ce type de message ne sont pas comptés. */
export async function preferencesOf(userIds: string[]) {
  const result = new Map<string, NotificationPreferences>();
  for (const part of chunks(userIds)) {
    const { data, error } = await db
      .from("bw_notification_preferences")
      .select("user_id,reminders,community,openings,push_enabled")
      .in("user_id", part);
    if (error) throw error;
    for (const row of data ?? []) result.set(row.user_id as string, row as NotificationPreferences);
  }
  return result;
}

export async function previewAudience(audience: Audience): Promise<AudiencePreview> {
  const resolved = await resolveAudience(audience);
  const ids = [...resolved.recipients.keys()];
  const prefs = await preferencesOf(ids);
  const reachable = ids.filter((id) => notificationAllowed(prefs.get(id), resolved.category));
  let devices = 0;
  for (const part of chunks(reachable.filter((id) => prefs.get(id)?.push_enabled !== false))) {
    const { count, error } = await db
      .from("bw_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .in("user_id", part);
    if (error) throw error;
    devices += count ?? 0;
  }
  const travellers = resolved.travellerKnown
    ? [...resolved.recipients.values()].filter((r) => r.traveller).length
    : null;
  // Messages déjà envoyés ou prévus pour la même cible depuis 12 h : évite les doublons.
  const recent = await db
    .from("bw_admin_messages")
    .select("title,status,scheduled_at,audience")
    .in("status", ["scheduled", "sending", "sent"])
    .gte("scheduled_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order("scheduled_at", { ascending: false })
    .limit(50);
  if (recent.error && !missing(recent.error)) throw recent.error;
  const same = (value: unknown) =>
    JSON.stringify(sortKeys(value)) === JSON.stringify(sortKeys(audience));
  const scheduler = await db.rpc("bw_push_scheduler_active");
  return {
    label: resolved.label,
    context: resolved.context,
    relevantUntil: resolved.relevantUntil,
    accounts: ids.length,
    reachable: reachable.length,
    devices,
    travellers,
    relatives: travellers === null ? null : ids.length - travellers,
    duplicates: (recent.data ?? [])
      .filter((row) => same(row.audience))
      .map((row) => ({
        title: row.title as string,
        status: row.status,
        at: row.scheduled_at as string,
      })),
    schedulerActive: !scheduler.error && scheduler.data === true,
    ready: !recent.error,
  };
}
function sortKeys(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

type MessageRow = {
  id: string;
  audience: Audience;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string;
  sent_at?: string | null;
  late_recipients?: number | null;
};
const parisStamp = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

/**
 * Crée le message dans les comptes qui ne l'ont pas encore, puis le met en file pour leurs
 * téléphones. Sans doublon : la clé du message est unique par compte. `late` : compte arrivé
 * après l'envoi (suivi tardif), le texte rappelle alors la date de l'information.
 */
async function deliverAdminMessage(message: MessageRow, late: boolean, onlyUser?: string) {
  const resolved = await resolveAudience(message.audience);
  const key = `admin-msg:${message.category}:${message.id}`;
  const already = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const page = await db
      .from("bw_notifications")
      .select("user_id")
      .eq("event_key", key)
      .order("user_id")
      .range(offset, offset + 999);
    if (page.error) throw page.error;
    for (const row of page.data ?? []) already.add(row.user_id as string);
    if ((page.data ?? []).length < 1000) break;
  }
  const ids = [...resolved.recipients.keys()].filter(
    (id) => !already.has(id) && (!onlyUser || id === onlyUser),
  );
  const prefs = await preferencesOf(ids);
  const allowed = ids.filter((id) => notificationAllowed(prefs.get(id), message.category));
  const body =
    late && message.sent_at
      ? `Info du ${parisStamp(message.sent_at)} · ${message.body}`
      : message.body;
  const created: { id: string; user_id: string }[] = [];
  for (const part of chunks(allowed, 300)) {
    const inserted = await db
      .from("bw_notifications")
      .upsert(
        part.map((userId) => ({
          user_id: userId,
          follow_id: resolved.recipients.get(userId)?.followId ?? null,
          event_key: key,
          title: message.title,
          body,
          url: message.url,
        })),
        { onConflict: "user_id,event_key", ignoreDuplicates: true },
      )
      .select("id,user_id");
    if (inserted.error) throw inserted.error;
    created.push(...((inserted.data ?? []) as { id: string; user_id: string }[]));
  }
  const noticeOf = new Map(created.map((notice) => [notice.user_id, notice.id]));
  const pushUsers = created
    .map((notice) => notice.user_id)
    .filter((id) => prefs.get(id)?.push_enabled !== false);
  for (const part of chunks(pushUsers)) {
    const devices = await db.from("bw_push_subscriptions").select("id,user_id").in("user_id", part);
    if (devices.error) throw devices.error;
    const rows = (devices.data ?? []).flatMap((device) => {
      const id = noticeOf.get(device.user_id as string);
      return id ? [{ notification_id: id, subscription_id: device.id }] : [];
    });
    if (!rows.length) continue;
    const queued = await db
      .from("bw_push_deliveries")
      .upsert(rows, { onConflict: "notification_id,subscription_id", ignoreDuplicates: true });
    if (queued.error) throw queued.error;
  }
  return { created, total: already.size + created.length };
}

/**
 * Messages de l'équipe arrivés à échéance (ou celui qu'on envoie tout de suite), puis rattrapage :
 * un message encore d'actualité part aussi vers ceux qui ont rejoint la cible après l'envoi.
 * Renvoie les notifications créées, pour que l'envoi les traite en priorité.
 */
export async function queueAdminMessages(options: { messageId?: string; userId?: string } = {}) {
  // Un seul compte : uniquement le rattrapage des messages encore valables, pour lui.
  if (options.userId)
    return { messages: 0, notificationIds: await catchUpAdminMessages(options.userId) };
  let due = db
    .from("bw_admin_messages")
    .select("id,audience,category,title,body,url")
    .eq("status", "scheduled")
    .order("scheduled_at")
    .limit(20);
  due = options.messageId
    ? due.eq("id", options.messageId)
    : due.lte("scheduled_at", new Date().toISOString());
  const { data, error } = await due;
  if (error) {
    if (missing(error)) return { messages: 0, notificationIds: [] as string[] };
    throw error;
  }
  const notificationIds: string[] = [];
  let messages = 0;
  for (const message of (data ?? []) as MessageRow[]) {
    // Un seul envoi par message, même si deux passages tombent en même temps.
    const claim = await db
      .from("bw_admin_messages")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) continue;
    try {
      const result = await deliverAdminMessage(message, false);
      notificationIds.push(...result.created.map((notice) => notice.id));
      const done = await db
        .from("bw_admin_messages")
        .update({
          status: "sent",
          recipients: result.total,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", message.id);
      if (done.error) throw done.error;
      messages++;
    } catch (failure) {
      await db
        .from("bw_admin_messages")
        .update({
          status: "failed",
          last_error: String(
            (failure as { message?: unknown }).message ?? "Envoi impossible.",
          ).slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", message.id);
    }
  }
  if (!options.messageId) notificationIds.push(...(await catchUpAdminMessages()));
  return { messages, notificationIds };
}

/** Rattrapage des messages envoyés encore valables (colonne valid_until, script du 04/11/2026). */
async function catchUpAdminMessages(onlyUser?: string) {
  const live = await db
    .from("bw_admin_messages")
    .select("id,audience,category,title,body,url,sent_at,late_recipients")
    .eq("status", "sent")
    .gt("valid_until", new Date().toISOString())
    .order("sent_at", { ascending: false })
    .limit(30);
  // Script de rattrapage pas encore exécuté : rien à rattraper, sans erreur.
  if (live.error) {
    if (missing(live.error) || live.error.code === "42703") return [];
    throw live.error;
  }
  const ids: string[] = [];
  for (const message of (live.data ?? []) as MessageRow[]) {
    if (message.audience.kind === "all") continue;
    try {
      const result = await deliverAdminMessage(message, true, onlyUser);
      if (!result.created.length) continue;
      ids.push(...result.created.map((notice) => notice.id));
      await db
        .from("bw_admin_messages")
        .update({
          recipients: result.total,
          late_recipients: (message.late_recipients ?? 0) + result.created.length,
        })
        .eq("id", message.id);
    } catch (failure) {
      // Un message en erreur ne bloque pas les autres ; il sera retenté au passage suivant.
      console.error("[admin-msg catch-up]", message.id, failure);
    }
  }
  return ids;
}

/** La liste des comptes prévenus (300 au plus), avec la raison et leurs téléphones. */
export async function listAudience(audience: Audience) {
  const resolved = await resolveAudience(audience);
  const ids = [...resolved.recipients.keys()];
  const prefs = await preferencesOf(ids);
  const shown = ids.slice(0, 300);
  const devices = new Map<string, number>();
  const names = new Map<string, string>();
  for (const part of chunks(shown)) {
    const [subs, profiles] = await Promise.all([
      db.from("bw_push_subscriptions").select("user_id").in("user_id", part),
      db.from("profiles").select("id,display_name").in("id", part),
    ]);
    if (subs.error) throw subs.error;
    if (profiles.error) throw profiles.error;
    for (const row of subs.data ?? [])
      devices.set(row.user_id as string, (devices.get(row.user_id as string) ?? 0) + 1);
    for (const row of profiles.data ?? [])
      if (row.display_name) names.set(row.id as string, String(row.display_name));
  }
  // Adresses e-mail : lues dans les comptes, seulement pour les comptes affichés.
  const emails = new Map<string, string>();
  const wanted = new Set(shown);
  for (let page = 1; wanted.size; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users)
      if (wanted.has(user.id)) {
        emails.set(user.id, user.email ?? "");
        wanted.delete(user.id);
      }
    if (data.users.length < 1000) break;
  }
  const recipients: AudienceRecipient[] = shown.map((id) => {
    const recipient = resolved.recipients.get(id)!;
    const pref = prefs.get(id);
    return {
      id,
      name: names.get(id) ?? "",
      email: emails.get(id) ?? "",
      via:
        recipient.via === "departure" && recipient.traveller !== null
          ? recipient.traveller
            ? "traveller"
            : "relative"
          : recipient.via,
      devices: pref?.push_enabled === false ? 0 : (devices.get(id) ?? 0),
      excluded: !notificationAllowed(pref, resolved.category),
    };
  });
  // Les voyageurs d'abord, puis ceux qui ont un téléphone, les exclus à la fin.
  const rank = (r: AudienceRecipient) =>
    (r.excluded ? 100 : 0) + (r.via === "traveller" ? 0 : 10) + (r.devices ? 0 : 1);
  recipients.sort(
    (a, b) => rank(a) - rank(b) || (a.name || a.email).localeCompare(b.name || b.email, "fr"),
  );
  return { recipients, total: ids.length };
}
