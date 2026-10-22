import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function NotificationOverview() {
  const { data, isPending, error } = useQuery({ queryKey: ["admin", "notification-overview"], staleTime: 60_000, queryFn: async () => {
    const [follows, watches, notices, pending] = await Promise.all([
      supabase.from("bw_follows").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("bw_itinerary_watches").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("bw_notifications").select("id,title,created_at").order("created_at", { ascending: false }).limit(12),
      supabase.from("bw_push_deliveries").select("notification_id", { count: "exact", head: true }).is("sent_at", null),
    ]);
    const issue = follows.error ?? watches.error ?? notices.error ?? pending.error;
    if (issue) throw issue;
    return { follows: follows.count ?? 0, watches: watches.count ?? 0, notices: notices.data ?? [], pending: pending.count ?? 0 };
  } });
  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Chargement des suivis…</p>;
  if (error) return <p role="alert" className="p-4 text-sm text-destructive">Impossible de charger les notifications. Vérifiez la migration et les droits d’accès.</p>;
  return <section className="space-y-4 py-3"><div className="grid gap-3 sm:grid-cols-4"><Metric icon={Ship} label="Suivis actifs" value={data.follows} /><Metric icon={CalendarClock} label="Alertes de période" value={data.watches} /><Metric icon={Bell} label="Notifications récentes" value={data.notices.length} /><Metric icon={Bell} label="Push en attente" value={data.pending} /></div><div className="rounded-2xl border border-border bg-card p-4"><h3 className="font-semibold">Derniers envois préparés</h3><p className="mt-1 text-xs text-muted-foreground">Le traitement dépose chaque message dans le compte et l’envoie en push aux appareils abonnés. Les heures d’arrivée au port restent indicatives.</p><div className="mt-3 divide-y divide-border">{data.notices.map((notice) => <div key={notice.id} className="flex justify-between gap-3 py-2 text-sm"><span>{notice.title}</span><time className="shrink-0 text-xs text-muted-foreground">{new Date(notice.created_at).toLocaleDateString("fr-FR")}</time></div>)}{!data.notices.length && <p className="py-3 text-sm text-muted-foreground">Aucune notification émise.</p>}</div></div></section>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><Icon className="size-5 text-primary" aria-hidden /><strong className="mt-2 block text-2xl">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>;
}
