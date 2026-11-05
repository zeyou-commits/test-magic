import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Building2, Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Fonctions du script « billets », absentes des types générés.
const db = typedSupabase as unknown as SupabaseClient;
const KEY = ["admin", "ticket-insights"];

type ScheduleInsight = {
  id: string;
  departure_id: string;
  company: string | null;
  route: string | null;
  ticket_departure_at: string | null;
  bledway_departure_at: string | null;
  current_departure_at: string;
  ticket_vessel: string | null;
  vessel: string | null;
  created_at: string;
};
type Agency = { agency: string; count: number; companies: string[]; last_seen: string };

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      })
    : "—";

/**
 * Ce que les billets des voyageurs apprennent à BledWay, sans aucune donnée personnelle :
 * horaires ou navires différents à vérifier (rien n'est corrigé automatiquement), et agences
 * émettrices repérées (pour d'éventuels partenariats).
 */
export function TicketInsightsAdmin({
  onOpenPlanning,
}: {
  onOpenPlanning?: (date: string) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_ticket_insights_staff");
      if (error) return null;
      return data as { schedules: ScheduleInsight[]; agencies: Agency[] };
    },
  });
  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "done" | "dismissed" }) => {
      const { error } = await db.rpc("bw_ticket_insight_decide", { p_id: id, p_status: status });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (query.data === null)
    return (
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>Billets des voyageurs</strong> : exécutez le script <code>billets</code> dans
        Supabase.
      </section>
    );
  const schedules = query.data?.schedules ?? [];
  const agencies = query.data?.agencies ?? [];
  return (
    <section className="mb-8 grid gap-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Clock className="size-4" /> Écarts relevés sur des billets ({schedules.length})
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Un billet n’est pas une source officielle : vérifiez auprès de la compagnie avant de
          corriger. Rien n’est modifié automatiquement.
        </p>
        {!schedules.length ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun écart en attente.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {schedules.map((item) => (
              <li key={item.id} className="rounded-xl border bg-white p-3 text-sm">
                <strong>
                  {item.route ?? "Traversée"} · {item.company ?? "compagnie ?"}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  Billet : {when(item.ticket_departure_at)}
                  {item.ticket_vessel ? ` · ${item.ticket_vessel}` : ""} — BledWay au moment de
                  l’import : {when(item.bledway_departure_at)}
                  {item.vessel ? ` · ${item.vessel}` : ""}
                  {item.current_departure_at !== item.bledway_departure_at
                    ? ` (aujourd’hui : ${when(item.current_departure_at)})`
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {onOpenPlanning ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenPlanning(item.current_departure_at.slice(0, 10))}
                    >
                      Ouvrir le planning du jour
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => decide.mutate({ id: item.id, status: "done" })}>
                    <Check className="size-4" /> Traité
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decide.mutate({ id: item.id, status: "dismissed" })}
                  >
                    <X className="size-4" /> Écarter
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Building2 className="size-4" /> Agences émettrices repérées ({agencies.length})
        </h3>
        {!agencies.length ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune agence repérée pour l’instant.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Agence</th>
                <th>Billets</th>
                <th>Compagnies</th>
                <th>Dernier</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.agency} className="border-t">
                  <td className="py-1.5 font-medium">{a.agency}</td>
                  <td>{a.count}</td>
                  <td className="text-xs">{a.companies.join(", ") || "—"}</td>
                  <td className="text-xs">{new Date(a.last_seen).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
