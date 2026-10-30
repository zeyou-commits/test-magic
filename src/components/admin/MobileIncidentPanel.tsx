import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { planningDeparturesQuery } from "@/lib/admin/planning";
import { adminPortsQuery, adminRoutesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";

const HOURS = 72;

/**
 * Sur téléphone, un soir d'incident : les trois gestes utiles en haut, puis les départs des
 * 72 prochaines heures en liste verticale. Le planning complet reste réservé à l'ordinateur.
 */
export function MobileIncidentPanel({
  onNavigate,
  renderEditor,
}: {
  onNavigate: (tab: string) => void;
  renderEditor: (departureId: string, onDone: () => void) => ReactNode;
}) {
  const client = useQueryClient();
  const { data: departures = [] } = useQuery(planningDeparturesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [editing, setEditing] = useState<string | null>(null);
  const now = Date.now();
  const soon = departures
    .filter((d) => {
      const at = Date.parse(d.departure_at);
      return at >= now - 3_600_000 && at <= now + HOURS * 3_600_000;
    })
    .sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at));
  const status = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: "scheduled" | "cancelled" }) => {
      const { error } = await supabase.from("departures").update({ status: next }).eq("id", id);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => {
      void client.invalidateQueries({ queryKey: ["departures"] });
      if (next === "cancelled")
        toast.success("Départ annulé.", {
          duration: 15_000,
          description: "Les voyageurs ne sont pas encore prévenus.",
          action: { label: "Prévenir", onClick: () => onNavigate("notifications") },
        });
      else toast.success("Départ rétabli.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const portOf = (id?: string) => ports.find((port) => port.id === id);
  return (
    <section className="bw-admin-incident-mobile" aria-label="Incident en cours">
      <div className="grid grid-cols-3 gap-2">
        <Button className="h-auto min-h-16 flex-col gap-1 whitespace-normal p-2 text-xs" onClick={() => onNavigate("incidents")}>
          <TriangleAlert className="size-5" aria-hidden /> Navire immobilisé
        </Button>
        <Button
          variant="outline"
          className="h-auto min-h-16 flex-col gap-1 whitespace-normal p-2 text-xs"
          onClick={() => onNavigate("notifications")}
        >
          <Bell className="size-5" aria-hidden /> Prévenir les voyageurs
        </Button>
        <Button
          variant="outline"
          className="h-auto min-h-16 flex-col gap-1 whitespace-normal p-2 text-xs"
          onClick={() => onNavigate("flash")}
        >
          <CalendarDays className="size-5" aria-hidden /> Publier un Flash
        </Button>
      </div>
      <h2 className="mt-4 text-sm font-semibold">Départs des {HOURS} prochaines heures</h2>
      {soon.length ? (
        <ul className="mt-2 grid gap-2">
          {soon.map((d) => {
            const route = routes.find((item) => item.id === d.route_id);
            const from = portOf(route?.departure_port_id);
            const cancelled = d.status === "cancelled";
            return (
              <li key={d.id} className="rounded-xl border border-border bg-white p-3 text-sm">
                <p className="font-semibold">
                  {from?.name ?? "?"} → {portOf(route?.arrival_port_id)?.name ?? "?"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(d.departure_at, portTimeZone(from))} ·{" "}
                  {vessels.find((vessel) => vessel.id === d.vessel_id)?.name ?? "Navire à affecter"}
                  {cancelled ? " · Annulé" : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 flex-1"
                    onClick={() => setEditing(editing === d.id ? null : d.id)}
                  >
                    {editing === d.id ? "Fermer" : "Modifier"}
                  </Button>
                  <Button
                    size="sm"
                    variant={cancelled ? "outline" : "ghost"}
                    className="min-h-10 flex-1"
                    disabled={status.isPending}
                    onClick={() => {
                      if (cancelled) status.mutate({ id: d.id, next: "scheduled" });
                      else if (window.confirm("Marquer ce départ comme annulé ? Il sera affiché « Annulé » sur le site."))
                        status.mutate({ id: d.id, next: "cancelled" });
                    }}
                  >
                    {cancelled ? "Rétablir" : "Annuler"}
                  </Button>
                </div>
                {editing === d.id ? renderEditor(d.id, () => setEditing(null)) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Aucun départ dans les {HOURS} heures.</p>
      )}
    </section>
  );
}
