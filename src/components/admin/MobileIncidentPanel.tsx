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

/** Départs visibles avant « Voir les autres ». */
const VISIBLE = 5;
const HOURS = 72;

/**
 * Sur téléphone, un soir d'incident : les trois gestes utiles en haut, puis les départs des
 * 72 prochaines heures en liste verticale. Le planning complet reste réservé à l'ordinateur.
 */
export function MobileIncidentPanel({
  onNavigate,
  renderEditor,
  part = "all",
  max = VISIBLE,
}: {
  onNavigate: (tab: string) => void;
  renderEditor: (departureId: string, onDone: () => void) => ReactNode;
  /** Téléphone : les actions rapides en tête, les départs à venir après les points à régler. */
  part?: "all" | "actions" | "departures";
  /** Départs visibles avant « Voir les autres ». */
  max?: number;
}) {
  const client = useQueryClient();
  const { data: departures = [] } = useQuery(planningDeparturesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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
  const shown = showAll ? soon : soon.slice(0, max);
  return (
    <section
      className="bw-admin-incident-mobile"
      data-part={part}
      aria-label={part === "departures" ? "Départs à venir" : "Actions rapides"}
    >
      {part === "departures" ? null : (
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
      )}
      {part === "actions" ? null : (
      <>
      <h2 className="mt-4 text-sm font-semibold">
        Départs des {HOURS} prochaines heures
        {soon.length ? <span className="ml-1 font-normal text-muted-foreground">· {soon.length}</span> : null}
      </h2>
      {soon.length ? (
        <ul className="bw-admin-soon">
          {shown.map((d) => {
            const route = routes.find((item) => item.id === d.route_id);
            const from = portOf(route?.departure_port_id);
            const cancelled = d.status === "cancelled";
            const vessel = vessels.find((item) => item.id === d.vessel_id)?.name;
            const open = editing === d.id;
            return (
              <li key={d.id} data-open={open || undefined} data-cancelled={cancelled || undefined}>
                {/* Une ligne par départ ; le toucher la déplie avec ses actions. */}
                <button
                  type="button"
                  className="bw-admin-soon__row"
                  aria-expanded={open}
                  onClick={() => setEditing(open ? null : d.id)}
                >
                  <time>{formatDateTime(d.departure_at, portTimeZone(from))}</time>
                  <strong>
                    {from?.name ?? "?"} → {portOf(route?.arrival_port_id)?.name ?? "?"}
                  </strong>
                  <small>
                    {vessel ?? "Navire à affecter"}
                    {cancelled ? " · Annulé" : ""}
                  </small>
                </button>
                {open ? (
                <div className="mt-2 flex gap-2">
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
                ) : null}
                {open ? renderEditor(d.id, () => setEditing(null)) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Aucun départ dans les {HOURS} heures.</p>
      )}
      {soon.length > max ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "Réduire" : `Voir les ${soon.length - max} autres départs`}
        </Button>
      ) : null}
      </>
      )}
    </section>
  );
}
