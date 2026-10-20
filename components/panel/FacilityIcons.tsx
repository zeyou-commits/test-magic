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
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map(([key, value]) => {
        const Icon = icons[key] ?? Info;
        const label = facilityLabels[key] ?? key;
        // « Oui » / « Disponible » n'apportent rien : on n'affiche que les vraies précisions.
        const detail = /^(oui|disponible|présent|yes)$/i.test(value.trim()) ? null : value;
        return (
          <li
            key={key}
            title={detail ? `${label} : ${detail}` : label}
            className="flex flex-col items-center gap-1 rounded-2xl bg-secondary/60 px-1.5 py-2.5 text-center"
          >
            <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="text-[11px] font-semibold leading-tight">{label}</span>
            {detail ? (
              <span className="line-clamp-3 text-[10px] leading-tight text-muted-foreground">
                {detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
