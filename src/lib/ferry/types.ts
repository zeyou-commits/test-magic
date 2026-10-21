export type EntityStatus = "active" | "inactive" | "draft";
export type LabelAnchor = "left" | "right" | "top" | "bottom";
export type Reliability = "verified" | "to_verify" | "possibly_outdated";
export type DepartureStatus = "scheduled" | "modified" | "cancelled";
export type ReviewStatus = "pending" | "approved" | "published" | "rejected" | "hidden" | "deleted";
export type ReportStatus = "new" | "in_progress" | "resolved" | "rejected";

export interface Port {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  country_name: string;
  city: string | null;
  latitude: number;
  longitude: number;
  label_anchor: LabelAnchor;
  label_offset_x: number;
  label_offset_y: number;
  status: EntityStatus;
  facilities: Record<string, string> | null;
  notes: string | null;
  /** Photo du port (URL https), sinon recherche sur Wikimedia Commons. */
  photo_url: string | null;
  info_source: string | null;
  info_source_url: string | null;
  info_verified_at: string | null;
  is_demo: boolean;
}
export interface Company {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  status: EntityStatus;
  is_demo: boolean;
}
export interface Vessel {
  id: string;
  slug: string;
  name: string;
  company_id: string | null;
  photo_url: string | null;
  vessel_type: string | null;
  description: string | null;
  status: EntityStatus;
  is_demo: boolean;
  /** Identifiant AIS à 9 chiffres, pour le suivi en direct. */
  mmsi: number | null;
  /** Numéro IMO à 7 chiffres (lien vers la fiche VesselFinder). */
  imo: number | null;
  build_year?: number | null;
  length_meters?: number | null;
  passenger_capacity?: number | null;
  car_capacity?: number | null;
  freight_lane_meters?: number | null;
  speed_knots?: number | null;
}
export interface RouteLine {
  id: string;
  slug: string;
  departure_port_id: string;
  arrival_port_id: string;
  typical_duration_minutes: number | null;
  distance_km: number | null;
  status: EntityStatus;
  notes: string | null;
  color: string | null;
  is_demo: boolean;
  company_ids: string[];
}
export interface Schedule {
  id: string;
  route_id: string;
  company_id: string;
  default_vessel_id: string | null;
  departure_time: string;
  duration_minutes: number;
  weekdays: number[];
  valid_from: string;
  valid_to: string | null;
  status: EntityStatus;
  source_name: string | null;
  source_url: string | null;
  last_verified_at: string | null;
  reliability: Reliability;
  notes: string | null;
  is_demo: boolean;
}
export interface Departure {
  id: string;
  route_id: string;
  company_id: string;
  vessel_id: string | null;
  schedule_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  status: DepartureStatus;
  source_name: string | null;
  source_url: string | null;
  last_verified_at: string | null;
  reliability: Reliability;
  notes: string | null;
  is_demo: boolean;
}
export interface RatingCriterion {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}
export interface PortReview {
  id: string;
  port_id: string;
  user_id: string;
  comment: string | null;
  status: ReviewStatus;
  created_at: string;
}

export type SelectionType = "port" | "route" | "company" | "vessel" | "departure";
export interface Selection {
  type: SelectionType;
  id: string;
}

/**
 * Filtres partagés par la carte, la liste des départs, le volet mobile et l'URL.
 * Un seul modèle : ports de départ, ports d'arrivée, puis critères facultatifs.
 */
export interface Filters {
  search: string;
  departurePortIds: string[];
  arrivalPortIds: string[];
  companyId: string | null;
  vesselId: string | null;
  /** Jour de départ de l'aller (AAAA-MM-JJ), dans l'heure locale du port de départ. */
  date: string | null;
  /** Jour de départ du retour (AAAA-MM-JJ), dans l'heure locale du port de retour. */
  returnDate: string | null;
  /** Aller-retour ou aller simple (par défaut). */
  roundTrip: boolean;
  /** Souplesse sur la date d'aller : 0 = jour exact, sinon ± N jours. */
  flexDays: number;
  schoolZone: "A" | "B" | "C" | null;
}

export const emptyFilters: Filters = {
  search: "",
  departurePortIds: [],
  arrivalPortIds: [],
  companyId: null,
  vesselId: null,
  date: null,
  returnDate: null,
  roundTrip: false,
  flexDays: 0,
  schoolZone: null,
};
