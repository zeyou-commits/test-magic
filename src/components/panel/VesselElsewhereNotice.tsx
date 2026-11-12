import { VesselStateAsk } from "./VesselStateAsk";
import { useQuery } from "@tanstack/react-query";
import type { Departure } from "@/lib/ferry/types";
import { departureHold, formatAge, vesselElsewhere } from "@/lib/ferry/tracking";
import { formatDateParts } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { vesselPositionsQuery } from "@/lib/ferry/useLiveShips";
import { tr } from "@/lib/i18n";

/**
 * « Le navire est encore à Marseille » : le dernier signal AIS (moins de 6 h) le place à quai
 * dans un autre port que celui de ce départ, ou encore à son port de départ après l'heure prévue.
 * Rien ne s'affiche sinon.
 */
export function VesselElsewhereNotice({ departure }: { departure: Departure }) {
  const { data: positions = [] } = useQuery(vesselPositionsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const vessel = vessels.find((v) => v.id === departure.vessel_id);
  const position = vessel?.mmsi ? positions.find((p) => p.mmsi === vessel.mmsi) : undefined;
  if (!vessel) return null;
  const now = Date.now();
  const sinceStart = now - Date.parse(departure.departure_at);
  const reportedAt = position?.reportedAt ? Date.parse(position.reportedAt) : NaN;
  // Départ non vu par le signal (3 premières heures) : seuls les voyageurs peuvent le dire.
  const unseenDeparture =
    departure.status !== "cancelled" &&
    sinceStart > 0 &&
    sinceStart < 3 * 3600_000 &&
    !(position?.atdAt && position.eventDepartureId === departure.id) &&
    !(Number.isFinite(reportedAt) && reportedAt > Date.parse(departure.departure_at));
  const ask = unseenDeparture ? (
    <VesselStateAsk vesselId={vessel.id} vesselName={vessel.name} departureId={departure.id} />
  ) : null;
  if (!position) return ask;
  const elsewhere = vesselElsewhere(departure, position, routes, now, ports);
  if (!elsewhere) {
    const from = ports.find(
      (p) => p.id === routes.find((r) => r.id === departure.route_id)?.departure_port_id,
    );
    const hold = departureHold(departure, position, from, now);
    if (!hold || !from) return ask;
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
        <p role="status">
          {hold.fresh ? (
            <>
              <strong>
                {tr("ui.vesselElsewhereNotice.encoreAQuaiA")}{formatDateParts(hold.reportedAt, portTimeZone(from)).time}
              </strong>{" "}
              {tr("ui.vesselElsewhereNotice.selonLeSignalDuNavire")}
            </>
          ) : (
            <>
              <strong>
                {tr("ui.vesselElsewhereNotice.dernierSignalAQuai")}{formatAge((now - Date.parse(hold.reportedAt)) / 60_000)}
              </strong>
              {tr("ui.vesselElsewhereNotice.apresLHeurePrevueAucun")}
            </>
          )}
        </p>
        <VesselStateAsk vesselId={vessel.id} vesselName={vessel.name} departureId={departure.id} />
      </div>
    );
  }
  const port = ports.find((p) => p.id === elsewhere.portId)?.name ?? "un autre port";
  const started = now >= Date.parse(departure.departure_at);
  return (
    <p
      role="status"
      className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
    >
      <strong>
        {vessel.name}{tr("ui.vesselElsewhereNotice.estEncoreA")}{port}
      </strong>{" "}
      {tr("ui.vesselElsewhereNotice.signal")}{formatAge((now - Date.parse(elsewhere.reportedAt)) / 60_000)}).{" "}
      {started
        ? tr("ui.vesselElsewhereNotice.departProbablementRetardeOuNavire")
        : tr("ui.vesselElsewhereNotice.siLeNavireNeChange")}
    </p>
  );
}
