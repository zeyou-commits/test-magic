import type { Filters, Selection } from "./types";
import { emptyFilters } from "./types";

const nullable = (value: string | null) => value || null;
const list = (value: string | null) => value?.split(",").filter(Boolean) ?? [];
const ZONES = ["A", "B", "C"] as const;

export function filtersFromUrl(search: string): Filters {
  const params = new URLSearchParams(search);
  const zone = params.get("zone");
  const way = params.get("way");
  const roundTrip = way === "2" || (way !== "1" && params.has("ret"));
  return {
    ...emptyFilters,
    search: params.get("q") ?? "",
    // « ports » : ancien paramètre, conservé pour que les liens déjà partagés fonctionnent.
    departurePortIds: [...new Set([...list(params.get("from")), ...list(params.get("ports"))])],
    arrivalPortIds: list(params.get("to")),
    companyId: nullable(params.get("company")),
    vesselId: nullable(params.get("vessel")),
    date: nullable(params.get("date")),
    returnDate: roundTrip ? nullable(params.get("ret")) : null,
    roundTrip,
    flexDays: Math.min(3, Math.max(0, Number(params.get("flex")) || 0)),
    schoolZone: ZONES.find((item) => item === zone) ?? null,
  };
}

export function selectionFromUrl(search: string): Selection | null {
  const params = new URLSearchParams(search);
  const type = params.get("select");
  const id = params.get("id");
  if (!id || !type) return null;
  if (!["port", "route", "company", "vessel", "departure"].includes(type)) return null;
  return { type: type as Selection["type"], id };
}

export function mapStateToSearch(
  filters: Filters,
  selection: Selection | null,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.departurePortIds.length) params.set("from", filters.departurePortIds.join(","));
  if (filters.arrivalPortIds.length) params.set("to", filters.arrivalPortIds.join(","));
  if (filters.companyId) params.set("company", filters.companyId);
  if (filters.vesselId) params.set("vessel", filters.vesselId);
  if (filters.date) params.set("date", filters.date);
  if (filters.returnDate) params.set("ret", filters.returnDate);
  if (filters.roundTrip) params.set("way", "2");
  if (filters.flexDays > 0) params.set("flex", String(filters.flexDays));
  if (filters.schoolZone) params.set("zone", filters.schoolZone);

  if (selection) {
    params.set("select", selection.type);
    params.set("id", selection.id);
  }
  Object.entries(extra).forEach(([key, value]) => params.set(key, value));

  const query = params.toString();
  return query ? `?${query}` : "";
}
