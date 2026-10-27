import type { CSSProperties } from "react";
import {
  Baby,
  Ban,
  Banknote,
  BellRing,
  CalendarX2,
  Car,
  ChevronsRight,
  CircleCheck,
  CircleX,
  Clock,
  Clock3,
  Coins,
  Construction,
  DoorOpen,
  Footprints,
  Fuel,
  GlassWater,
  Hourglass,
  ListOrdered,
  MoonStar,
  Pause,
  Timer,
  Toilet,
  UtensilsCrossed,
  LogIn,
  LogOut,
  ParkingCircle,
  Stamp,
  Store,
  Ticket,
  TrafficCone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { situationOf, type AlertCategory } from "@/lib/ferry/community";

/** Un picto par situation, le même partout (saisie, carte, fiches, Flash info). */
export const situationIcons: Record<AlertCategory, LucideIcon> = {
  checkin: Ticket,
  call: BellRing,
  service: Store,
  queue: Users,
  formalities: Stamp,
  access: TrafficCone,
  parking: ParkingCircle,
  fluid: CircleCheck,
  delay: Clock3,
  boarding: LogIn,
  disembarking: LogOut,
};

/** Un picto par choix (précision, service, état), pour lire les boutons d'un coup d'œil. */
const optionIcons: Record<string, LucideIcon> = {
  access_ok: CircleCheck,
  access_traffic: Car,
  access_closed: Ban,
  access_works: Construction,
  checkin_open: DoorOpen,
  checkin_notyet: Clock,
  checkin_queue: Users,
  queue_moving: ChevronsRight,
  queue_stopped: Pause,
  queue_long: ListOrdered,
  queue_30: Timer,
  queue_60: Hourglass,
  queue_120: Hourglass,
  formalities_open: DoorOpen,
  formalities_short: Timer,
  formalities_long: Hourglass,
  formalities_notyet: Clock,
  formalities_30: Timer,
  formalities_60: Hourglass,
  formalities_120: Hourglass,
  call_called: BellRing,
  call_waiting: Hourglass,
  delay_30: Timer,
  delay_60: Hourglass,
  delay_120: Hourglass,
  delay_postponed: CalendarX2,
  boarding_vehicles: Car,
  boarding_foot: Footprints,
  disembarking_vehicles: Car,
  disembarking_foot: Footprints,
  parking_boarding: ParkingCircle,
  parking_visitors: ParkingCircle,
  // Services du port, puis leur état.
  snack: UtensilsCrossed,
  prayer: MoonStar,
  toilets: Toilet,
  water: GlassWater,
  atm: Banknote,
  exchange: Coins,
  fuel: Fuel,
  kids: Baby,
  open: CircleCheck,
  closed: CircleX,
};
export function OptionIcon({ code, size = 16 }: { code: string; size?: number }) {
  const Icon = optionIcons[code];
  return Icon ? <Icon size={size} aria-hidden /> : null;
}

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
