import {
  Banknote,
  Bath,
  BedDouble,
  Clock,
  Coffee,
  Droplets,
  Fuel,
  MapPin,
  MoonStar,
  ShieldCheck,
  Ship,
  ShowerHead,
  Signpost,
  SquareParking,
  Ticket,
  Truck,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { tr } from "@/lib/i18n";
import type { StopFeature, StopKind, StopSource } from "@/lib/routesDuBled/data";

const KIND_ICON: Record<StopKind, LucideIcon> = {
  carburant: Fuel,
  aire: Signpost,
  manger: UtensilsCrossed,
  priere: MoonStar,
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
  priere: MoonStar,
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
