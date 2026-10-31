import { useQuery } from "@tanstack/react-query";
import { Anchor, ChevronRight, Radio, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { alertLabel, communityQuery, isPublicAlert, useSignalCatalog } from "@/lib/ferry/community";
import { dockedShipsOf } from "@/lib/ferry/mapPresentation";
import { presenceQuery } from "@/lib/ferry/presence";
import { useFleet } from "@/lib/ferry/useFleet";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
import type { Departure, Port, RouteLine, Selection } from "@/lib/ferry/types";

// L'état le plus parlant d'abord : ce qui se passe maintenant prime sur « à quai ».
const STATE_ORDER = ["boarding", "disembarking", "delay", "state"];

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
  const incidents = useVesselAlerts();
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
    return {
      ship,
      info,
      signal,
      incident: ship.vesselId ? incidents.get(ship.vesselId) : undefined,
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
        {rows.map(({ ship, info, signal, incident, travellers: count }) => (
          <li key={ship.id}>
            <button
              type="button"
              onClick={() =>
                onSelect(
                  info.departureId
                    ? { type: "departure", id: info.departureId }
                    : { type: "vessel", id: ship.vesselId ?? "" },
                )
              }
            >
              <span className="bw-port-live__main">
                <strong>{ship.name}</strong>
                {incident ? (
                  <em data-tone="alert">{incident.label}</em>
                ) : signal ? (
                  <em data-tone="signal">{alertLabel(signal)}</em>
                ) : (
                  <em>État non signalé</em>
                )}
                <small>
                  Vers {info.destination} · {info.status}
                </small>
                <small className="bw-port-live__meta">
                  <span>
                    <Radio size={11} aria-hidden />
                    {ship.source === "live" ? "Position réelle" : "D’après l’horaire"}
                  </span>
                  {count ? (
                    <span>
                      <Users size={11} aria-hidden />
                      {count} voyageur{count > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </small>
              </span>
              <ChevronRight size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
