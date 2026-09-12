export type EntityStatus = "active" | "inactive" | "draft";
export type LabelAnchor = "left" | "right" | "top" | "bottom";
export type Reliability = "verified" | "to_verify" | "possibly_outdated";
export type DepartureStatus = "scheduled" | "modified" | "cancelled";
export type ReviewStatus =
  | "pending"
  | "approved"
  | "published"
  | "rejected"
  | "hidden"
  | "deleted";
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

export interface Filters {
  search: string;
  departurePortId: string | null;
  arrivalPortId: string | null;
  companyId: string | null;
  vesselId: string | null;
  date: string | null;
}

export const emptyFilters: Filters = {
  search: "",
  departurePortId: null,
  arrivalPortId: null,
  companyId: null,
  vesselId: null,
  date: null,
};
