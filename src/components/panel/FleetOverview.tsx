import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Ship } from "lucide-react";
import { companiesQuery, upcomingDeparturesQuery, vesselsQuery } from "@/lib/ferry/queries";
import type { Vessel } from "@/lib/ferry/types";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { fleetOverview } from "@/lib/ferry/vesselFacts";
import { VesselAlertTag } from "./VesselAlert";

const year = new Date().getFullYear();
const number = (value: number) => value.toLocaleString("fr-FR");

const rankings: {
  id: string;
  label: string;
  value: (vessel: Vessel) => number | null | undefined;
  show: (value: number) => string;
}[] = [
  { id: "passengers", label: "Passagers", value: (v) => v.passenger_capacity, show: number },
  { id: "cars", label: "Véhicules", value: (v) => v.car_capacity, show: number },
  { id: "cabins", label: "Cabines", value: (v) => v.cabin_capacity, show: number },
  {
    id: "length",
    label: "Longueur",
    value: (v) => v.length_meters,
    show: (n) => `${number(n)} m`,
  },
  {
    id: "age",
    label: "Âge",
    value: (v) => (v.build_year ? year - v.build_year : null),
    show: (n) => `${n} ans`,
  },
];

/** L'arrivée sur la page : la flotte en chiffres, puis un classement à choisir. */
export function FleetOverview() {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const [rankingId, setRankingId] = useState("passengers");
  const upcoming = new Map<string, number>();
  for (const departure of departures) {
    if (!departure.vessel_id || departure.status === "cancelled") continue;
    upcoming.set(departure.vessel_id, (upcoming.get(departure.vessel_id) ?? 0) + 1);
  }
  const overview = fleetOverview(vessels, upcoming);
  const ranking = rankings.find((item) => item.id === rankingId) ?? rankings[0]!;
  const rows = overview.fleet
    .flatMap((vessel) => {
      const value = ranking.value(vessel);
      return value ? [{ vessel, value }] : [];
    })
    .sort((a, b) => b.value - a.value);
  const photos = useQueries({ queries: rows.map((row) => vesselPhotoQuery(row.vessel)) });
  if (!overview.vessels) return null;
  const max = rows[0]?.value ?? 1;
  const tiles = [
    { value: number(overview.vessels), label: "navires en service" },
    { value: number(overview.companies), label: "compagnies" },
    { value: overview.averageAge ? `${overview.averageAge} ans` : "—", label: "d'âge moyen" },
    { value: number(overview.passengers), label: "places passagers" },
    { value: number(overview.cars), label: "places véhicules" },
    { value: number(overview.crossings), label: "traversées à venir" },
  ];
  return (
    <section className="bw-fleet" aria-label="La flotte en chiffres">
      <dl className="bw-fleet__tiles">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dd>{tile.value}</dd>
            <dt>{tile.label}</dt>
          </div>
        ))}
      </dl>
      <div className="bw-fleet__ranking">
        <div className="bw-fleet__head">
          <h2>Le classement</h2>
          <div role="group" aria-label="Classer par">
            {rankings.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === ranking.id}
                onClick={() => setRankingId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <ol>
          {rows.map(({ vessel, value }, index) => (
            <li key={vessel.id}>
              <b className="bw-fleet__rank">{index + 1}</b>
              <span className="bw-fleet__photo">
                {photos[index]?.data?.url ? (
                  <img src={photos[index]!.data!.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <Ship size={18} aria-hidden />
                )}
              </span>
              <span className="bw-fleet__name">
                <Link to="/" search={{ select: "vessel", id: vessel.id } as never}>
                  {vessel.name}
                </Link>{" "}
                <VesselAlertTag vesselId={vessel.id} />
                <small>{companies.find((company) => company.id === vessel.company_id)?.name}</small>
              </span>
              <span className="bw-fleet__bar" aria-hidden>
                <i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
              </span>
              <strong>{ranking.show(value)}</strong>
            </li>
          ))}
        </ol>
        <p>Capacités générales, pas des places disponibles. Sources indiquées sur chaque fiche.</p>
      </div>
    </section>
  );
}
