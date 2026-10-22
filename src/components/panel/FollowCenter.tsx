import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Ship, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerPush } from "./FollowButton";

export function FollowCenter({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [pushStatus, setPushStatus] = useState("");
  const { data: follows = [] } = useQuery({ queryKey: ["my-follows", userId], queryFn: async () => {
    const { data, error } = await supabase.from("bw_follows").select("id,target_kind,target_id,created_at").eq("user_id", userId).eq("active", true).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
  const { data: watches = [] } = useQuery({ queryKey: ["my-itinerary-watches", userId], queryFn: async () => {
    const { data, error } = await supabase.from("bw_itinerary_watches").select("id,period_month,origin_label,destination_label").eq("user_id", userId).eq("active", true).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
  const targetIds = follows.map((follow) => follow.target_id).join(",");
  const { data: labels = {} } = useQuery({ queryKey: ["follow-labels", targetIds], enabled: Boolean(targetIds), queryFn: async () => {
    const vesselIds = follows.filter((follow) => follow.target_kind === "vessel").map((follow) => follow.target_id);
    const departureIds = follows.filter((follow) => follow.target_kind === "departure").map((follow) => follow.target_id);
    const [vessels, departures, routes, ports] = await Promise.all([
      vesselIds.length ? supabase.from("vessels").select("id,name").in("id", vesselIds) : Promise.resolve({ data: [] }),
      departureIds.length ? supabase.from("departures").select("id,route_id,departure_at").in("id", departureIds) : Promise.resolve({ data: [] }),
      supabase.from("routes").select("id,departure_port_id,arrival_port_id"),
      supabase.from("ports").select("id,name"),
    ]);
    const routeById = new Map((routes.data ?? []).map((route) => [route.id, route]));
    const portById = new Map((ports.data ?? []).map((port) => [port.id, port.name]));
    const result: Record<string, string> = {};
    for (const vessel of vessels.data ?? []) result[vessel.id] = vessel.name;
    for (const departure of departures.data ?? []) {
      const route = routeById.get(departure.route_id);
      result[departure.id] = route ? `${portById.get(route.departure_port_id) ?? "Départ"} → ${portById.get(route.arrival_port_id) ?? "arrivée"} · ${new Date(departure.departure_at).toLocaleDateString("fr-FR")}` : "Traversée suivie";
    }
    return result;
  } });
  const { data: notices = [] } = useQuery({ queryKey: ["my-notifications", userId], queryFn: async () => {
    const { data, error } = await supabase.from("bw_notifications").select("id,title,body,created_at,read_at,url").eq("user_id", userId).order("created_at", { ascending: false }).limit(40);
    if (error) throw error;
    return data ?? [];
  }, refetchInterval: 60_000 });
  async function enablePush() {
    try {
      const result = await registerPush(userId);
      setPushStatus(result === "enabled" ? "Notifications activées sur cet appareil." : result === "denied" ? "Autorisez les notifications dans les réglages du navigateur." : "Push indisponible sur cet appareil ou pas encore configuré.");
    } catch { setPushStatus("Activation impossible. Vérifiez les réglages du navigateur."); }
  }
  return <section id="notifications" className="mt-8 scroll-mt-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Mes voyages suivis</h2><p className="text-sm text-muted-foreground">Rappels, préparatifs et informations des voyageurs au même endroit.</p></div><button type="button" onClick={() => void enablePush()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Bell className="size-4" />Activer les notifications</button></div>
    {pushStatus && <p role="status" className="text-xs text-muted-foreground">{pushStatus}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{follows.map((follow) => <div key={follow.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-2 text-sm font-semibold"><Ship className="size-4 shrink-0 text-primary" /><a href={`/?select=${follow.target_kind}&id=${follow.target_id}`} className="hover:underline">{labels[follow.target_id] ?? (follow.target_kind === "vessel" ? "Bateau suivi" : "Traversée suivie")}</a></div><button type="button" aria-label="Arrêter le suivi" onClick={async () => { await supabase.from("bw_follows").update({ active: false }).eq("id", follow.id); void queryClient.invalidateQueries({ queryKey: ["my-follows", userId] }); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="size-4" /></button></div>)}{watches.map((watch) => <div key={watch.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"><div><strong className="text-sm">Ouverture · {watch.period_month.slice(0, 7)}</strong><p className="text-xs text-muted-foreground">{watch.origin_label} → {watch.destination_label}</p><a href="/horaires" className="mt-1 inline-block text-xs font-semibold text-primary underline">Voir les traversées</a></div><button type="button" aria-label="Arrêter cette alerte" onClick={async () => { await supabase.from("bw_itinerary_watches").update({ active: false }).eq("id", watch.id); void queryClient.invalidateQueries({ queryKey: ["my-itinerary-watches", userId] }); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="size-4" /></button></div>)}{!follows.length && !watches.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">Ouvrez une fiche bateau ou traversée puis choisissez « Suivre ».</p>}</div>
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><h3 className="font-semibold">Avant le départ</h3><p className="mt-1 text-xs text-muted-foreground">Repère indicatif : présentez-vous au port 4 h avant le départ avec billets, pièces d’identité, documents du véhicule et bagages. Vérifiez l’heure limite auprès de la compagnie.</p></div>
    <div><h3 className="font-semibold">Notifications récentes</h3><div className="mt-2 space-y-2">{notices.length ? notices.map((notice) => <article key={notice.id} className={`rounded-xl border p-3 ${notice.read_at ? "border-border bg-card" : "border-primary/30 bg-primary/5"}`}><div className="flex items-start justify-between gap-2"><strong className="text-sm">{notice.title}</strong><time className="shrink-0 text-[11px] text-muted-foreground">{new Date(notice.created_at).toLocaleDateString("fr-FR")}</time></div><p className="mt-1 text-xs text-muted-foreground">{notice.body}</p><div className="mt-2 flex flex-wrap items-center gap-3"><a href={notice.url} className="text-xs font-semibold text-primary underline underline-offset-2">{notice.url.startsWith("/compte") ? "Voir mon alerte" : "Voir la fiche"}</a>{!notice.read_at && <button type="button" onClick={async () => { await supabase.from("bw_notifications").update({ read_at: new Date().toISOString() }).eq("id", notice.id); void queryClient.invalidateQueries({ queryKey: ["my-notifications", userId] }); }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><Check className="size-3.5" />Marquer comme lu</button>}</div></article>) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucune notification pour le moment.</p>}</div></div>
  </section>;
}
