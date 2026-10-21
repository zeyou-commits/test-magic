import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Armchair,
  Bus,
  Info,
  MapPin,
  MoonStar,
  ParkingSquare,
  ShieldCheck,
  ShoppingBag,
  ShowerHead,
  Utensils,
  Wifi,
} from "lucide-react";
import { facilityLabels } from "@/lib/ferry/format";

const icons: Record<string, LucideIcon> = {
  parking: ParkingSquare,
  restauration: Utensils,
  wifi: Wifi,
  sanitaires: ShowerHead,
  salle_attente: Armchair,
  priere: MoonStar,
  douane: ShieldCheck,
  transports: Bus,
  acces: MapPin,
  pmr: Accessibility,
  boutique: ShoppingBag,
};

/** Services du port sous forme de pictogrammes : icône, nom, et précision en dessous quand elle existe. */
export function FacilityIcons({ items }: { items: [string, string][] }) {
  return (
    <ul className="port-facilities">
      {items.map(([key, value]) => {
        const Icon = icons[key] ?? Info;
        const label = facilityLabels[key] ?? key;
        // « Oui » / « Disponible » n'apportent rien : on n'affiche que les vraies précisions.
        const unavailable = /^(non|indisponible|absent|no)$/i.test(value.trim());
        const detail = unavailable
          ? "Indisponible"
          : /^(oui|disponible|présent|yes)$/i.test(value.trim())
            ? "Disponible"
            : value;
        return (
          <li
            key={key}
            title={detail ? `${label} : ${detail}` : label}
            className={`port-facility ${unavailable ? "is-unavailable" : ""}`}
          >
            <span className="port-facility-icon">
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="port-facility-copy">
              <strong>{label}</strong>
              <span>{detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
