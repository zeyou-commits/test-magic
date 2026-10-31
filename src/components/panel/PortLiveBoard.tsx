import { useQuery } from "@tanstack/react-query";
import { Anchor, ChevronRight, Radio, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { alertLabel, communityQuery, isPublicAlert, useSignalCatalog, type TravelAlert } from "@/lib/ferry/community";
import type { FleetShip } from "@/lib/ferry/fleet";
import { dockedShipsOf, fleetShortcutInfo } from "@/lib/ferry/mapPresentation";
import { presenceQuery } from "@/lib/ferry/presence";
import { companiesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { useFleet } from "@/lib/ferry/useFleet";
import type { Departure, Port, RouteLine, Selection } from "@/lib/ferry/types";
import { SeaPhotoBadge, useSeaPeak } from "./SeaForecast";
import { VesselMiniCard } from "./VesselMiniCard";

// L'état le plus parlant d'abord : ce qui se passe maintenant prime sur « à quai ».
const STATE_ORDER = ["boarding", "disembarking", "delay", "state"];

/** Un bateau du port : la même carte que sur une traversée, puis son état et son prochain départ. */
function PortLiveShip({
  ship,
  info,
  departure,
  from,
  to,
  signal,
  travellers,
  onSelect,
}: {
  ship: FleetShip;
  info: ReturnType<typeof fleetShortcutInfo>;
  departure: Departure | undefined;
  from: Port | undefined;
  to: Port | undefined;
  signal: TravelAlert | undefined;
  travellers: number;
  onSelect: (selection: Selection) => void;
}) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const vessel = vessels.find((item) => item.id === ship.vesselId);
  const company = companies.find((item) => item.id === (departure?.company_id ?? vessel?.company_id));
  const peak = useSeaPeak(
    departure?.id ?? ship.id,
    from,
    to,
    departure?.departure_at,
    departure?.arrival_at ?? null,
  );
  return (
    <li>
      <div className="bw-recap__vessel-summary">
        {peak != null && vessel ? <SeaPhotoBadge peak={peak} /> : null}
        {vessel ? (
          <VesselMiniCard
            vessel={vessel}
            company={company}
            onOpen={() => onSelect({ type: "vessel", id: vessel.id })}
            onCompanyOpen={company ? () => onSelect({ type: "company", id: company.id }) : undefined}
          />
        ) : (
          <strong>{ship.name}</strong>
        )}
      </div>
      <button
        type="button"
        className="bw-port-live__trip"
        disabled={!info.departureId}
        onClick={() => info.departureId && onSelect({ type: "departure", id: info.departureId })}
      >
        <span className="bw-port-live__main">
          {signal ? <em data-tone="signal">{alertLabel(signal)}</em> : <em>État non signalé</em>}
          <small>
            Vers {info.destination} · {info.status}
          </small>
          <small className="bw-port-live__meta">
            <span>
              <Radio size={11} aria-hidden />
              {ship.source === "live" ? "Position réelle" : "D’après l’horaire"}
            </span>
            {travellers ? (
              <span>
                <Users size={11} aria-hidden />
                {travellers} voyageur{travellers > 1 ? "s" : ""}
              </span>
            ) : null}
          </small>
        </span>
        {info.departureId ? <ChevronRight size={16} aria-hidden /> : null}
      </button>
    </li>
  );
}

/** Fiche port : les bateaux présents, leur état signalé et les voyageurs de chaque traversée. */
export function PortLiveBoard({
  portId,
  departures,
  routes,
  ports,
  onSelect,
}: {
  portId: string;
  departures: Departure[];
  routes: RouteLine[];
  ports: Port[];
  onSelect: (selection: Selection) => void;
}) {
  const { user } = useAuth();
  useSignalCatalog();
  const fleet = useFleet();
  const feed = useQuery(communityQuery(undefined, undefined, false, user?.id)).data;
  const presence = useQuery(presenceQuery).data;
  const ships = dockedShipsOf(portId, fleet, departures, routes, ports, Date.now());
  const seen = ships.filter(({ ship }) => ship.source === "live").length;
  const expected = ships.length - seen;
  const rows = ships.map(({ ship, info }) => {
    const signal = (feed?.alerts ?? [])
      .filter(
        (alert) =>
          alert.target_kind === "vessel" &&
          alert.target_id === ship.vesselId &&
          alert.departure_id === info.departureId &&
          STATE_ORDER.includes(alert.category) &&
          isPublicAlert(alert),
      )
      .sort(
        (a, b) => STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category),
      )[0];
    const count = presence?.find((row) => row.departure_id === info.departureId);
    const departure = departures.find((item) => item.id === info.departureId);
    const route = routes.find((item) => item.id === departure?.route_id);
    return {
      ship,
      info,
      signal,
      departure,
      from: ports.find((item) => item.id === route?.departure_port_id),
      to: ports.find((item) => item.id === route?.arrival_port_id),
      travellers: count ? count.en_route + count.at_port + count.onboard : 0,
    };
  });
  const boarding = rows.filter((row) => row.signal?.category === "boarding").length;
  const travellers = rows.reduce((sum, row) => sum + row.travellers, 0);
  return (
    <section className="bw-port-live" aria-label="Bateaux au port en ce moment">
      <h3>
        <Anchor size={15} aria-hidden /> Bateaux au port
      </h3>
      {ships.length ? (
        <p className="bw-port-live__summary">
          {[
            seen ? `${seen} vu${seen > 1 ? "s" : ""} à quai` : null,
            expected ? `${expected} attendu${expected > 1 ? "s" : ""} d’après l’horaire` : null,
            boarding ? `${boarding} en embarquement` : null,
            travellers ? `${travellers} voyageur${travellers > 1 ? "s" : ""} BledWay` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : (
        <p className="bw-port-live__summary">Aucun bateau à quai ni attendu dans les 48 h.</p>
      )}
      <ul>
        {rows.map((row) => (
          <PortLiveShip key={row.ship.id} {...row} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}
