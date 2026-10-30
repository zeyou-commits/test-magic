import { useState } from "react";
import { Ship } from "lucide-react";
import type { Vessel } from "@/lib/ferry/types";
import { safeExternalUrl } from "./shared";

const number = (value: number | null | undefined) => value?.toLocaleString("fr-FR");

export function VesselSpecs({ vessel }: { vessel: Vessel }) {
  const items = [
    { label: "Passagers", value: number(vessel.passenger_capacity) },
    { label: "Véhicules", value: number(vessel.car_capacity) },
    { label: "Cabines", value: number(vessel.cabin_capacity) },
    { label: "Fauteuils", value: number(vessel.seat_capacity) },
    { label: "Longueur", value: vessel.length_meters ? `${number(vessel.length_meters)} m` : null },
    { label: "Largeur", value: vessel.beam_meters ? `${number(vessel.beam_meters)} m` : null },
    { label: "Ponts", value: vessel.deck_count },
    { label: "Jauge brute", value: vessel.gross_tonnage ? `${number(vessel.gross_tonnage)} t` : null },
    { label: "Mise en service", value: vessel.build_year },
    {
      label: "Vitesse",
      value: vessel.speed_knots ? `${Math.round(vessel.speed_knots * 1.852)} km/h` : null,
    },
    { label: "Construit par", value: vessel.builder },
    { label: "Type", value: vessel.vessel_type },
  ].filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  const source = safeExternalUrl(vessel.specs_source_url);
  return items.length ? (
    <>
      <dl className="bw-vessel-specs">
        {items.map((i) => (
          <div key={i.label}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
      </dl>
      {vessel.specs_source_name ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Source :{" "}
          {source ? (
            <a href={source} target="_blank" rel="noopener noreferrer" className="underline">
              {vessel.specs_source_name}
            </a>
          ) : (
            vessel.specs_source_name
          )}
        </p>
      ) : null}
    </>
  ) : null;
}

export function ShipPhoto({ url, name }: { url: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="bw-ship-photo">
      <Ship size={32} aria-hidden />
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          width={88}
          height={80}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
