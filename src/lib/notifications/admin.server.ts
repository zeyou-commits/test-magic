import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as typedDb } from "@/integrations/supabase/client.server";

// Tables communautaires pas encore présentes dans les types générés.
const db = typedDb as unknown as SupabaseClient;

export async function notificationOverview() {
  const [campaigns, routes, ports, follows, watchesCount, queue, failed, recent] =
    await Promise.all([
      db
        .from("bw_notification_campaigns")
        .select("id,route_id,period_month,status,created_at,sent_at,last_error")
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("routes").select("id,departure_port_id,arrival_port_id"),
      db.from("ports").select("id,name"),
      db.from("bw_follows").select("id", { count: "exact", head: true }).eq("active", true),
      db
        .from("bw_itinerary_watches")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      db
        .from("bw_push_deliveries")
        .select("notification_id", { count: "exact", head: true })
        .is("sent_at", null)
        .lt("attempts", 5),
      db
        .from("bw_push_deliveries")
        .select("notification_id", { count: "exact", head: true })
        .is("sent_at", null)
        .gte("attempts", 5),
      db
        .from("bw_notifications")
        .select("id,title,created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
  const error = [campaigns, routes, ports, follows, watchesCount, queue, failed, recent].find(
    (item) => item.error,
  )?.error;
  if (error) throw error;
  const routeById = new Map((routes.data ?? []).map((route) => [route.id, route]));
  const portById = new Map((ports.data ?? []).map((port) => [port.id, port.name]));
  const rows = [];
  for (const campaign of campaigns.data ?? []) {
    const route = routeById.get(campaign.route_id);
    // Les destinataires ne quittent jamais le serveur. L'admin reçoit un nombre, pas leurs e-mails.
    let audience = 0;
    for (let offset = 0; ["pending", "approved"].includes(campaign.status); offset += 500) {
      const watches = await db
        .from("bw_itinerary_watches")
        .select("id,user_id")
        .eq("route_id", campaign.route_id)
        .eq("period_month", campaign.period_month)
        .eq("active", true)
        .order("id")
        .range(offset, offset + 499);
      if (watches.error) throw watches.error;
      const userIds = [...new Set((watches.data ?? []).map((watch) => watch.user_id))];
      if (userIds.length) {
        const [optOuts, notified] = await Promise.all([
          db
            .from("bw_notification_preferences")
            .select("user_id")
            .in("user_id", userIds)
            .eq("openings", false),
          db
            .from("bw_notifications")
            .select("event_key")
            .in(
              "event_key",
              (watches.data ?? []).map((watch) => `opening:${watch.id}`),
            ),
        ]);
        if (optOuts.error || notified.error) throw optOuts.error ?? notified.error;
        const disabled = new Set((optOuts.data ?? []).map((row) => row.user_id));
        const delivered = new Set((notified.data ?? []).map((row) => row.event_key));
        audience += (watches.data ?? []).filter(
          (watch) => !disabled.has(watch.user_id) && !delivered.has(`opening:${watch.id}`),
        ).length;
      }
      if (!watches.data || watches.data.length < 500) break;
    }
    rows.push({
      ...campaign,
      from: route ? (portById.get(route.departure_port_id) ?? "Départ") : "Départ",
      to: route ? (portById.get(route.arrival_port_id) ?? "Arrivée") : "Arrivée",
      audience,
    });
  }
  return {
    metrics: {
      follows: follows.count ?? 0,
      watches: watchesCount.count ?? 0,
      pending: queue.count ?? 0,
      failed: failed.count ?? 0,
    },
    campaigns: rows,
    recent: recent.data ?? [],
  };
}
