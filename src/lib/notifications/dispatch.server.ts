import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/integrations/supabase/types";

type Notice = { key: string; title: string; body: string; url: string };
const HOUR = 3_600_000;

export async function dispatchPush() {
  const url = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'];
  if (!url || !serviceKey || !publicKey || !privateKey || !subject) throw new Error("Push configuration missing");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  const now = Date.now();
  const horizon = new Date(now + 8 * 24 * HOUR).toISOString();
  const since = new Date(now - 26 * HOUR).toISOString();
  const [followsResult, watchesResult, departuresResult, routesResult, portsResult, vesselsResult, signalsResult, reviewsResult] = await Promise.all([
    db.from("bw_follows").select("id,user_id,target_kind,target_id,created_at").eq("active", true).limit(2000),
    db.from("bw_itinerary_watches").select("id,user_id,route_id,period_month,origin_label,destination_label").eq("active", true).limit(2000),
    db.from("departures").select("id,route_id,vessel_id,departure_at,status").gte("departure_at", new Date(now - HOUR).toISOString()).lte("departure_at", horizon).neq("status", "cancelled").eq("is_demo", false).limit(3000),
    db.from("routes").select("id,departure_port_id,arrival_port_id").limit(500),
    db.from("ports").select("id,name,country_code").limit(200),
    db.from("vessels").select("id,name").limit(500),
    db.from("bw_travel_alerts").select("id,target_kind,target_id,category,delay_minutes,created_at,expires_at").eq("resolved", false).gte("created_at", since).gt("expires_at", new Date(now).toISOString()).limit(500),
    db.from("bw_vessel_reviews").select("id,vessel_id,comment,updated_at").eq("status", "published").gte("updated_at", since).limit(500),
  ]);
  const firstError = [followsResult, watchesResult, departuresResult, routesResult, portsResult, vesselsResult, signalsResult, reviewsResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const follows = followsResult.data ?? [];
  const watches = watchesResult.data ?? [];
  const departures = departuresResult.data ?? [];
  const routeById = new Map((routesResult.data ?? []).map((route) => [route.id, route]));
  const portById = new Map((portsResult.data ?? []).map((port) => [port.id, port]));
  const vesselById = new Map((vesselsResult.data ?? []).map((vessel) => [vessel.id, vessel]));
  const subscriptions = await db.from("bw_push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key").in("user_id", [...new Set([...follows.map((follow) => follow.user_id), ...watches.map((watch) => watch.user_id)]), "00000000-0000-0000-0000-000000000000"]);
  if (subscriptions.error) throw subscriptions.error;
  const subscriptionsByUser = new Map<string, NonNullable<typeof subscriptions.data>>();
  for (const subscription of subscriptions.data ?? []) subscriptionsByUser.set(subscription.user_id, [...(subscriptionsByUser.get(subscription.user_id) ?? []), subscription]);
  let created = 0;
  let pushed = 0;
  async function deliver(userId: string, followId: string | null, notice: Notice) {
    const inserted = await db.from("bw_notifications").upsert({ user_id: userId, follow_id: followId, event_key: notice.key, title: notice.title, body: notice.body, url: notice.url }, { onConflict: "user_id,event_key", ignoreDuplicates: true }).select("id").maybeSingle();
    if (inserted.error) throw inserted.error;
    if (!inserted.data) return;
    created++;
    for (const subscription of subscriptionsByUser.get(userId) ?? []) {
      const { error } = await db.from("bw_push_deliveries").upsert({ notification_id: inserted.data.id, subscription_id: subscription.id }, { onConflict: "notification_id,subscription_id", ignoreDuplicates: true });
      if (error) throw error;
    }
  }
  for (const follow of follows) {
    const matches = departures.filter((departure) => follow.target_kind === "departure" ? departure.id === follow.target_id : departure.vessel_id === follow.target_id);
    const next = matches.sort((a, b) => a.departure_at.localeCompare(b.departure_at))[0];
    const notices: Notice[] = [];
    if (next) {
      const remaining = Date.parse(next.departure_at) - now;
      const stage = remaining <= 24 * HOUR ? "24h" : remaining <= 48 * HOUR ? "48h" : remaining <= 7 * 24 * HOUR ? "7j" : null;
      if (stage && remaining > 0) {
        const route = routeById.get(next.route_id);
        const from = route ? portById.get(route.departure_port_id) : undefined;
        const to = route ? portById.get(route.arrival_port_id) : undefined;
        const portName = from?.name ?? "le port";
        const crossing = `${from?.name ?? "Départ"} → ${to?.name ?? "arrivée"}`;
        const portTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: from?.country_code === "DZ" ? "Africa/Algiers" : "Europe/Paris" }).format(new Date(Date.parse(next.departure_at) - 4 * HOUR));
        const checklist = stage === "24h" ? " Checklist : billets, pièces d’identité, documents du véhicule et bagages." : " Préparez vos billets et documents de voyage.";
        notices.push({ key: `departure:${follow.id}:${next.id}:${stage}`, title: `${crossing} · départ dans ${stage}`, body: `Arrivée conseillée à ${portName} le ${portTime} (4 h avant, à confirmer auprès de la compagnie).${checklist}`, url: `/?select=departure&id=${next.id}` });
      }
    }
    const vesselId = follow.target_kind === "vessel" ? follow.target_id : next?.vessel_id;
    if (vesselId) {
      const vesselName = vesselById.get(vesselId)?.name ?? "Votre bateau";
      for (const signal of signalsResult.data ?? []) if (signal.target_kind === "vessel" && signal.target_id === vesselId && signal.created_at >= follow.created_at) {
        const topic = signal.category === "delay" ? `Retard signalé${signal.delay_minutes ? ` · environ ${signal.delay_minutes} min` : ""}` : signal.category === "boarding" ? "Information d’embarquement" : "Information voyageurs";
        notices.push({ key: `signal:${follow.id}:${signal.id}`, title: `${vesselName} · ${topic}`, body: "Un voyageur a publié un signalement. Consultez la fiche du bateau et vérifiez auprès de la compagnie.", url: `/?select=vessel&id=${vesselId}` });
      }
      for (const review of reviewsResult.data ?? []) if (review.vessel_id === vesselId && review.updated_at >= follow.created_at && review.comment.trim()) {
        notices.push({ key: `review:${follow.id}:${review.id}`, title: `${vesselName} · nouvel avis`, body: review.comment.slice(0, 160), url: `/?select=vessel&id=${vesselId}` });
      }
    }
    for (const notice of notices) await deliver(follow.user_id, follow.id, notice);
  }
  // Vérifie toutes les traversées publiées de la période, même au-delà de l'horizon des rappels.
  for (const watch of watches) {
    const monthEnd = new Date(`${watch.period_month}T00:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const periodStart = Math.max(Date.parse(`${watch.period_month}T00:00:00Z`), now);
    const { data: published, error } = await db.from("departures").select("id,departure_at").eq("route_id", watch.route_id).gte("departure_at", new Date(periodStart).toISOString()).lt("departure_at", monthEnd.toISOString()).neq("status", "cancelled").eq("is_demo", false).order("departure_at").limit(1);
    if (error) throw error;
    const first = published?.[0];
    if (!first) continue;
    const route = routeById.get(watch.route_id);
    const from = route ? portById.get(route.departure_port_id)?.name : "Départ";
    const to = route ? portById.get(route.arrival_port_id)?.name : "arrivée";
    await deliver(watch.user_id, null, { key: `opening:${watch.id}`, title: `Traversées publiées : ${from} → ${to}`, body: `Un départ est disponible pour ${watch.period_month.slice(0, 7)}. Parcours suivi : ${watch.origin_label} → ${watch.destination_label}.`, url: "/compte#notifications" });
  }
  const pending = await db.from("bw_push_deliveries").select("notification_id,subscription_id,attempts").is("sent_at", null).lt("attempts", 5).limit(500);
  if (pending.error) throw pending.error;
  const pendingRows = pending.data ?? [];
  if (pendingRows.length) {
    const [noticeRows, subscriptionRows] = await Promise.all([
      db.from("bw_notifications").select("id,title,body,url,event_key").in("id", [...new Set(pendingRows.map((row) => row.notification_id))]),
      db.from("bw_push_subscriptions").select("id,endpoint,p256dh,auth_key").in("id", [...new Set(pendingRows.map((row) => row.subscription_id))]),
    ]);
    if (noticeRows.error ?? subscriptionRows.error) throw noticeRows.error ?? subscriptionRows.error;
    const noticesById = new Map((noticeRows.data ?? []).map((notice) => [notice.id, notice]));
    const subscriptionsById = new Map((subscriptionRows.data ?? []).map((subscription) => [subscription.id, subscription]));
    for (const row of pendingRows) {
      const notice = noticesById.get(row.notification_id);
      const subscription = subscriptionsById.get(row.subscription_id);
      if (!notice || !subscription) continue;
      const claim = await db.from("bw_push_deliveries").update({ attempts: row.attempts + 1 }).eq("notification_id", row.notification_id).eq("subscription_id", row.subscription_id).eq("attempts", row.attempts).is("sent_at", null).select("notification_id").maybeSingle();
      if (claim.error) throw claim.error;
      if (!claim.data) continue;
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, tag: notice.event_key }), { TTL: 24 * 3600 });
        pushed++;
        await db.from("bw_push_deliveries").update({ sent_at: new Date().toISOString(), last_error: null }).eq("notification_id", row.notification_id).eq("subscription_id", row.subscription_id);
        await db.from("bw_push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", subscription.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("bw_push_subscriptions").delete().eq("id", subscription.id);
        else await db.from("bw_push_deliveries").update({ last_error: String(status ?? error).slice(0, 300) }).eq("notification_id", row.notification_id).eq("subscription_id", row.subscription_id);
      }
    }
  }
  return { followed: follows.length, itineraryWatches: watches.length, created, pushed, pending: pendingRows.length - pushed };
}
