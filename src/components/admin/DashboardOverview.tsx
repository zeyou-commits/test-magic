import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, MessageSquare, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function useAdminCounts() {
  return useQuery({
    queryKey: ["admin", "counts"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const [today, reports, reviews, unlinked] = await Promise.all([
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .gte("departure_at", start.toISOString())
          .lt("departure_at", end.toISOString()),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("port_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .is("vessel_id", null)
          .gte("departure_at", start.toISOString()),
      ]);
      return {
        today: today.count ?? 0,
        reports: reports.count ?? 0,
        reviews: reviews.count ?? 0,
        unlinked: unlinked.count ?? 0,
      };
    },
  });
}

export function DashboardOverview({ onNavigate, can }: { onNavigate: (id: string) => void; can: (id: string) => boolean }) {
  const { data } = useAdminCounts();
  const cards = [
    { id: "departures", label: "Départs aujourd'hui", value: data?.today, icon: CalendarClock },
    { id: "departures", label: "Départs à venir sans navire", value: data?.unlinked, icon: Ship, warn: true },
    { id: "reports", label: "Signalements à traiter", value: data?.reports, icon: AlertTriangle, warn: true },
    { id: "reviews", label: "Avis ports en attente", value: data?.reviews, icon: MessageSquare, warn: true },
  ].filter((c) => can(c.id));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onNavigate(c.id)}
          className="rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary hover:shadow-md"
        >
          <c.icon className={`h-5 w-5 ${c.warn && (c.value ?? 0) > 0 ? "text-destructive" : "text-primary"}`} />
          <p className="mt-3 text-3xl font-semibold tabular-nums">{c.value ?? "–"}</p>
          <p className="text-sm text-muted-foreground">{c.label}</p>
        </button>
      ))}
    </div>
  );
}
