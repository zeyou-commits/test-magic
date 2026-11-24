import {
  Banknote,
  Bath,
  BedDouble,
  Clock,
  Coffee,
  Droplets,
  Fuel,
  MapPin,
  ShieldCheck,
  Ship,
  ShowerHead,
  Signpost,
  SquareParking,
  Ticket,
  Truck,
  UtensilsCrossed,
  Wrench,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import { tr } from "@/lib/i18n";
import type { StopFeature, StopKind, StopSource } from "@/lib/routesDuBled/data";

/** Une mosquée (coupole, minaret, porte) : plus parlant qu'une lune pour dire « on peut prier ici ». */
// Coupole à bulbe et croissant, porte en arc, minaret : reconnaissable même en 14 px.
export const Mosque = createLucideIcon("mosque", [
  ["path", { d: "M2 21h20", key: "m1" }],
  ["path", { d: "M4 21v-5.5h12V21", key: "m2" }],
  ["path", { d: "M5 15.5c0-2.8 2.2-4.4 5-6.3 2.8 1.9 5 3.5 5 6.3", key: "m3" }],
  ["path", { d: "M10 9.2V7.4", key: "m4" }],
  ["path", { d: "M10.9 3.4a1.7 1.7 0 1 0 0 2.9 1.45 1.45 0 0 1 0-2.9z", key: "m5" }],
  ["path", { d: "M8.5 21v-2.3a1.5 1.5 0 0 1 3 0V21", key: "m6" }],
  ["path", { d: "M18.5 21V10.5h3V21", key: "m7" }],
  ["path", { d: "M18.5 10.5 20 7.5l1.5 3", key: "m8" }],
  ["path", { d: "M20 7.5V6", key: "m9" }],
]);

const KIND_ICON: Record<StopKind, LucideIcon> = {
  carburant: Fuel,
  aire: Signpost,
  manger: UtensilsCrossed,
  priere: Mosque,
  dormir: BedDouble,
  garage: Wrench,
  billets: Ticket,
  port: Ship,
  autre: MapPin,
};

const FEATURE_ICON: Record<StopFeature, LucideIcon> = {
  h24: Clock,
  manger: UtensilsCrossed,
  halal: UtensilsCrossed,
  priere: Mosque,
  ablutions: Droplets,
  dormir: BedDouble,
  parking: SquareParking,
  parking_sur: ShieldCheck,
  parking_pl: Truck,
  douches: ShowerHead,
  toilettes: Bath,
  billets: Ticket,
  garage: Wrench,
  dab: Banknote,
  cafe: Coffee,
};

export function KindIcon({ kind, className = "size-4" }: { kind: StopKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={className} aria-hidden />;
}

export function FeatureIcon({
  feature,
  className = "size-3.5",
}: {
  feature: StopFeature;
  className?: string;
}) {
  const Icon = FEATURE_ICON[feature];
  return <Icon className={className} aria-hidden />;
}

export const kindLabel = (k: StopKind) => {
  switch (k) {
    case "carburant":
      return tr("ui.pageRoutesDuBled.typeCarburant");
    case "aire":
      return tr("ui.pageRoutesDuBled.typeAire");
    case "manger":
      return tr("ui.pageRoutesDuBled.typeManger");
    case "priere":
      return tr("ui.pageRoutesDuBled.typePriere");
    case "dormir":
      return tr("ui.pageRoutesDuBled.typeDormir");
    case "garage":
      return tr("ui.pageRoutesDuBled.typeGarage");
    case "billets":
      return tr("ui.pageRoutesDuBled.typeBillets");
    case "port":
      return tr("ui.pageRoutesDuBled.typePort");
    case "autre":
      return tr("ui.pageRoutesDuBled.typeAutre");
  }
};

export const featureLabel = (f: StopFeature) => {
  switch (f) {
    case "h24":
      return tr("ui.pageRoutesDuBled.equip24h");
    case "manger":
      return tr("ui.pageRoutesDuBled.equipManger");
    case "halal":
      return tr("ui.pageRoutesDuBled.equipHalal");
    case "priere":
      return tr("ui.pageRoutesDuBled.equipPriere");
    case "ablutions":
      return tr("ui.pageRoutesDuBled.equipAblutions");
    case "dormir":
      return tr("ui.pageRoutesDuBled.equipDormir");
    case "parking":
      return tr("ui.pageRoutesDuBled.equipParking");
    case "parking_sur":
      return tr("ui.pageRoutesDuBled.equipParkingSur");
    case "parking_pl":
      return tr("ui.pageRoutesDuBled.equipParkingPl");
    case "douches":
      return tr("ui.pageRoutesDuBled.equipDouches");
    case "toilettes":
      return tr("ui.pageRoutesDuBled.equipToilettes");
    case "billets":
      return tr("ui.pageRoutesDuBled.equipBillets");
    case "garage":
      return tr("ui.pageRoutesDuBled.equipGarage");
    case "dab":
      return tr("ui.pageRoutesDuBled.equipDab");
    case "cafe":
      return tr("ui.pageRoutesDuBled.equipCafe");
  }
};

export const sourceLabel = (s: StopSource) =>
  s === "osm"
    ? tr("ui.pageRoutesDuBled.sourceOsm")
    : s === "web"
      ? tr("ui.pageRoutesDuBled.sourceWeb")
      : tr("ui.pageRoutesDuBled.sourceCommunaute");
