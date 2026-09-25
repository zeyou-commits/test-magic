import type { Filters, Selection } from "./types";
import { emptyFilters } from "./types";

const nullable = (value: string | null) => value || null;

export function filtersFromUrl(search: string): Filters {
  const params = new URLSearchParams(search);
  const portIds = params.get("ports")?.split(",").filter(Boolean) ?? [];

  return {
    ...emptyFilters,
    search: params.get("q") ?? "",
    portIds,
    departureCountry: nullable(params.get("country")),
    departurePortId: nullable(params.get("from")),
    arrivalPortId: nullable(params.get("to")),
    companyId: nullable(params.get("company")),
    vesselId: nullable(params.get("vessel")),
    date: nullable(params.get("date")),
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

export function mapStateToSearch(filters: Filters, selection: Selection | null) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.portIds.length) params.set("ports", filters.portIds.join(","));
  if (filters.departureCountry) params.set("country", filters.departureCountry);
  if (filters.departurePortId) params.set("from", filters.departurePortId);
  if (filters.arrivalPortId) params.set("to", filters.arrivalPortId);
  if (filters.companyId) params.set("company", filters.companyId);
  if (filters.vesselId) params.set("vessel", filters.vesselId);
  if (filters.date) params.set("date", filters.date);
  if (selection) {
    params.set("select", selection.type);
    params.set("id", selection.id);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

