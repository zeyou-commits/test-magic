import type { CSSProperties } from "react";
import {
  CircleCheck,
  Clock3,
  LogIn,
  LogOut,
  ParkingCircle,
  Stamp,
  TrafficCone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { situationOf, type AlertCategory } from "@/lib/ferry/community";

/** Un picto par situation, le même partout (saisie, carte, fiches, Flash info). */
export const situationIcons: Record<AlertCategory, LucideIcon> = {
  queue: Users,
  formalities: Stamp,
  access: TrafficCone,
  parking: ParkingCircle,
  fluid: CircleCheck,
  delay: Clock3,
  boarding: LogIn,
  disembarking: LogOut,
};

export function SituationIcon({ category, size = 17 }: { category: AlertCategory; size?: number }) {
  const Icon = situationIcons[category];
  return <Icon size={size} aria-hidden />;
}

/** Pastille ronde de la couleur de la situation, picto blanc. */
export function SituationBadge({
  category,
  size = 17,
  className = "bw-situation-badge",
}: {
  category: AlertCategory;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{ "--situation-color": situationOf(category).color } as CSSProperties}
      aria-hidden
    >
      <SituationIcon category={category} size={size} />
    </span>
  );
}
