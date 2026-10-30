import { useQuery } from "@tanstack/react-query";
import type { Departure } from "@/lib/ferry/types";
import { formatAge, vesselElsewhere } from "@/lib/ferry/tracking";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { vesselPositionsQuery } from "@/lib/ferry/useLiveShips";

/**
 * « Le navire est encore à Marseille » : le dernier signal AIS (moins de 6 h) le place à quai
 * dans un autre port que celui de ce départ. Rien ne s'affiche sinon.
 */
export function VesselElsewhereNotice({ departure }: { departure: Departure }) {
  const { data: positions = [] } = useQuery(vesselPositionsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const vessel = vessels.find((v) => v.id === departure.vessel_id);
  const position = vessel?.mmsi ? positions.find((p) => p.mmsi === vessel.mmsi) : undefined;
  if (!vessel || !position) return null;
  const now = Date.now();
  const elsewhere = vesselElsewhere(departure, position, routes, now);
  if (!elsewhere) return null;
  const port = ports.find((p) => p.id === elsewhere.portId)?.name ?? "un autre port";
  const started = now >= Date.parse(departure.departure_at);
  return (
    <p
      role="status"
      className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
    >
      <strong>
        {vessel.name} est encore à {port}
      </strong>{" "}
      (signal {formatAge((now - Date.parse(elsewhere.reportedAt)) / 60_000)}).{" "}
      {started
        ? "Départ probablement retardé ou bateau remplacé : renseignez-vous auprès de la compagnie."
        : "Si le bateau ne change pas, ce départ risque d'être retardé."}
    </p>
  );
}
