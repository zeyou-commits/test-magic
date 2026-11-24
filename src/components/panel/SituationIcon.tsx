import type { CSSProperties } from "react";
import {
  Accessibility,
  Ambulance,
  Anchor,
  Baby,
  Ban,
  Banknote,
  BellRing,
  Bike,
  Bus,
  CalendarX,
  Car,
  Caravan,
  ChevronsRight,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  CloudRain,
  Coffee,
  Coins,
  Construction,
  Dog,
  DoorOpen,
  Flag,
  Footprints,
  Fuel,
  GlassWater,
  Hourglass,
  Info,
  ListOrdered,
  LogIn,
  LogOut,
  Luggage,
  MapPin,
  Megaphone,
  MoonStar,
  ParkingCircle,
  Pause,
  Pill,
  Plug,
  Shield,
  Ship,
  ShoppingBag,
  Siren,
  Stamp,
  Store,
  Sun,
  Thermometer,
  Ticket,
  Timer,
  Toilet,
  TrafficCone,
  TriangleAlert,
  Truck,
  Users,
  UtensilsCrossed,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { situationOf, type AlertCategory } from "@/lib/ferry/community";
import { tr } from "@/lib/i18n";

/**
 * Pictos utilisables dans le catalogue des signalements (choisis dans l'admin).
 * Le nom est enregistré en base : ne pas renommer une clé existante.
 */
export const iconRegistry: Record<string, { icon: LucideIcon; label: string }> = {
  "traffic-cone": { icon: TrafficCone, get label() { return tr("ui.situationIcon.coneDeChantier"); } },
  ticket: { icon: Ticket, get label() { return tr("ui.situationIcon.billet"); } },
  users: { icon: Users, get label() { return tr("ui.situationIcon.personnes"); } },
  stamp: { icon: Stamp, get label() { return tr("ui.situationIcon.tampon"); } },
  "bell-ring": { icon: BellRing, get label() { return tr("ui.situationIcon.cloche"); } },
  store: { icon: Store, get label() { return tr("ui.situationIcon.boutique"); } },
  "parking-circle": { icon: ParkingCircle, get label() { return tr("ui.situationIcon.parking"); } },
  "circle-check": { icon: CircleCheck, get label() { return tr("ui.situationIcon.valide"); } },
  "circle-x": { icon: CircleX, get label() { return tr("ui.situationIcon.refuse"); } },
  clock: { icon: Clock, get label() { return tr("ui.situationIcon.horloge"); } },
  "log-in": { icon: LogIn, get label() { return tr("ui.situationIcon.entree"); } },
  "log-out": { icon: LogOut, get label() { return tr("ui.situationIcon.sortie"); } },
  car: { icon: Car, get label() { return tr("ui.situationIcon.voiture"); } },
  ban: { icon: Ban, get label() { return tr("ui.situationIcon.interdit"); } },
  construction: { icon: Construction, get label() { return tr("ui.situationIcon.travaux"); } },
  "door-open": { icon: DoorOpen, get label() { return tr("ui.situationIcon.porteOuverte"); } },
  "chevrons-right": { icon: ChevronsRight, get label() { return tr("ui.situationIcon.caAvance"); } },
  pause: { icon: Pause, get label() { return tr("ui.situationIcon.aLArret"); } },
  "list-ordered": { icon: ListOrdered, get label() { return tr("ui.situationIcon.file"); } },
  timer: { icon: Timer, get label() { return tr("ui.situationIcon.chrono"); } },
  hourglass: { icon: Hourglass, get label() { return tr("ui.situationIcon.sablier"); } },
  "calendar-x": { icon: CalendarX, get label() { return tr("ui.situationIcon.annule"); } },
  footprints: { icon: Footprints, get label() { return tr("ui.situationIcon.aPied"); } },
  utensils: { icon: UtensilsCrossed, get label() { return tr("ui.situationIcon.restauration"); } },
  "moon-star": { icon: MoonStar, get label() { return tr("ui.situationIcon.croissant"); } },
  toilet: { icon: Toilet, get label() { return tr("ui.situationIcon.toilettes"); } },
  "glass-water": { icon: GlassWater, get label() { return tr("ui.situationIcon.eau"); } },
  banknote: { icon: Banknote, get label() { return tr("ui.situationIcon.billetDeBanque"); } },
  coins: { icon: Coins, get label() { return tr("ui.situationIcon.pieces"); } },
  fuel: { icon: Fuel, get label() { return tr("ui.situationIcon.carburant"); } },
  baby: { icon: Baby, get label() { return tr("ui.situationIcon.enfants"); } },
  flag: { icon: Flag, get label() { return tr("ui.situationIcon.drapeau"); } },
  "triangle-alert": { icon: TriangleAlert, get label() { return tr("ui.situationIcon.attention"); } },
  info: { icon: Info, get label() { return tr("ui.situationIcon.information"); } },
  wifi: { icon: Wifi, label: "Wi-Fi" },
  plug: { icon: Plug, get label() { return tr("ui.situationIcon.prise"); } },
  pill: { icon: Pill, get label() { return tr("ui.situationIcon.pharmacie"); } },
  "shopping-bag": { icon: ShoppingBag, get label() { return tr("ui.situationIcon.courses"); } },
  coffee: { icon: Coffee, get label() { return tr("ui.situationIcon.cafe"); } },
  accessibility: { icon: Accessibility, get label() { return tr("ui.situationIcon.accessibilite"); } },
  shield: { icon: Shield, get label() { return tr("ui.situationIcon.securite"); } },
  siren: { icon: Siren, get label() { return tr("ui.situationIcon.urgence"); } },
  sun: { icon: Sun, get label() { return tr("ui.situationIcon.chaleur"); } },
  "cloud-rain": { icon: CloudRain, get label() { return tr("ui.situationIcon.pluie"); } },
  wind: { icon: Wind, get label() { return tr("ui.situationIcon.vent"); } },
  thermometer: { icon: Thermometer, get label() { return tr("ui.situationIcon.temperature"); } },
  "map-pin": { icon: MapPin, get label() { return tr("ui.situationIcon.lieu"); } },
  ship: { icon: Ship, get label() { return tr("ui.situationIcon.bateau"); } },
  anchor: { icon: Anchor, get label() { return tr("ui.situationIcon.ancre"); } },
  luggage: { icon: Luggage, get label() { return tr("ui.situationIcon.bagages"); } },
  dog: { icon: Dog, get label() { return tr("ui.situationIcon.animaux"); } },
  megaphone: { icon: Megaphone, get label() { return tr("ui.situationIcon.annonce"); } },
  bus: { icon: Bus, get label() { return tr("ui.situationIcon.bus"); } },
  caravan: { icon: Caravan, get label() { return tr("ui.situationIcon.caravane"); } },
  bike: { icon: Bike, label: "Deux-roues" },
  truck: { icon: Truck, get label() { return tr("ui.situationIcon.utilitaire"); } },
  ambulance: { icon: Ambulance, get label() { return tr("ui.situationIcon.secours"); } },
  circle: { icon: Circle, get label() { return tr("ui.situationIcon.neutre"); } },
};

/** Picto par son nom (registre ci-dessus), neutre si le nom est inconnu. */
export function NamedIcon({ name, size = 16 }: { name: string | null | undefined; size?: number }) {
  const Icon = (name && iconRegistry[name]?.icon) || Circle;
  return <Icon size={size} aria-hidden />;
}

/** Picto d'un choix (précision, service, état ouvert / fermé). */
export function OptionIcon({ name, size = 16 }: { name: string | null | undefined; size?: number }) {
  if (!name) return null;
  return <NamedIcon name={name} size={size} />;
}

/** Un picto par situation, le même partout (saisie, carte, fiches, Flash info). */
export function SituationIcon({ category, size = 17 }: { category: AlertCategory; size?: number }) {
  return <NamedIcon name={situationOf(category).icon} size={size} />;
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
