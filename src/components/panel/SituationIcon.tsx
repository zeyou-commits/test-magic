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

/**
 * Pictos utilisables dans le catalogue des signalements (choisis dans l'admin).
 * Le nom est enregistré en base : ne pas renommer une clé existante.
 */
export const iconRegistry: Record<string, { icon: LucideIcon; label: string }> = {
  "traffic-cone": { icon: TrafficCone, label: "Cône de chantier" },
  ticket: { icon: Ticket, label: "Billet" },
  users: { icon: Users, label: "Personnes" },
  stamp: { icon: Stamp, label: "Tampon" },
  "bell-ring": { icon: BellRing, label: "Cloche" },
  store: { icon: Store, label: "Boutique" },
  "parking-circle": { icon: ParkingCircle, label: "Parking" },
  "circle-check": { icon: CircleCheck, label: "Validé" },
  "circle-x": { icon: CircleX, label: "Refusé" },
  clock: { icon: Clock, label: "Horloge" },
  "log-in": { icon: LogIn, label: "Entrée" },
  "log-out": { icon: LogOut, label: "Sortie" },
  car: { icon: Car, label: "Voiture" },
  ban: { icon: Ban, label: "Interdit" },
  construction: { icon: Construction, label: "Travaux" },
  "door-open": { icon: DoorOpen, label: "Porte ouverte" },
  "chevrons-right": { icon: ChevronsRight, label: "Ça avance" },
  pause: { icon: Pause, label: "À l’arrêt" },
  "list-ordered": { icon: ListOrdered, label: "File" },
  timer: { icon: Timer, label: "Chrono" },
  hourglass: { icon: Hourglass, label: "Sablier" },
  "calendar-x": { icon: CalendarX, label: "Annulé" },
  footprints: { icon: Footprints, label: "À pied" },
  utensils: { icon: UtensilsCrossed, label: "Restauration" },
  "moon-star": { icon: MoonStar, label: "Croissant" },
  toilet: { icon: Toilet, label: "Toilettes" },
  "glass-water": { icon: GlassWater, label: "Eau" },
  banknote: { icon: Banknote, label: "Billet de banque" },
  coins: { icon: Coins, label: "Pièces" },
  fuel: { icon: Fuel, label: "Carburant" },
  baby: { icon: Baby, label: "Enfants" },
  flag: { icon: Flag, label: "Drapeau" },
  "triangle-alert": { icon: TriangleAlert, label: "Attention" },
  info: { icon: Info, label: "Information" },
  wifi: { icon: Wifi, label: "Wi-Fi" },
  plug: { icon: Plug, label: "Prise" },
  pill: { icon: Pill, label: "Pharmacie" },
  "shopping-bag": { icon: ShoppingBag, label: "Courses" },
  coffee: { icon: Coffee, label: "Café" },
  accessibility: { icon: Accessibility, label: "Accessibilité" },
  shield: { icon: Shield, label: "Sécurité" },
  siren: { icon: Siren, label: "Urgence" },
  sun: { icon: Sun, label: "Chaleur" },
  "cloud-rain": { icon: CloudRain, label: "Pluie" },
  wind: { icon: Wind, label: "Vent" },
  thermometer: { icon: Thermometer, label: "Température" },
  "map-pin": { icon: MapPin, label: "Lieu" },
  ship: { icon: Ship, label: "Bateau" },
  anchor: { icon: Anchor, label: "Ancre" },
  luggage: { icon: Luggage, label: "Bagages" },
  dog: { icon: Dog, label: "Animaux" },
  megaphone: { icon: Megaphone, label: "Annonce" },
  bus: { icon: Bus, label: "Bus" },
  caravan: { icon: Caravan, label: "Caravane" },
  bike: { icon: Bike, label: "Deux-roues" },
  truck: { icon: Truck, label: "Utilitaire" },
  ambulance: { icon: Ambulance, label: "Secours" },
  circle: { icon: Circle, label: "Neutre" },
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
