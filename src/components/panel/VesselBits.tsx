import { useState } from "react";
import { Ship } from "lucide-react";
import type { Vessel } from "@/lib/ferry/types";

export function VesselSpecs({ vessel }: { vessel: Vessel }) {
  const items = [
    { label: "Passagers", value: vessel.passenger_capacity?.toLocaleString("fr-FR") },
    { label: "Véhicules", value: vessel.car_capacity?.toLocaleString("fr-FR") },
    { label: "Longueur", value: vessel.length_meters ? `${vessel.length_meters} m` : null },
    { label: "Mise en service", value: vessel.build_year },
    { label: "Vitesse", value: vessel.speed_knots ? `${vessel.speed_knots} nœuds` : null },
    { label: "Type", value: vessel.vessel_type },
  ].filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  return items.length ? (
    <dl className="bw-vessel-specs">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
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
