import type { Filters, Selection } from "./types";
import { emptyFilters } from "./types";

const nullable = (value: string | null) => value || null;
const list = (value: string | null) => value?.split(",").filter(Boolean) ?? [];

export function filtersFromUrl(search: string): Filters {
  const params = new URLSearchParams(search);
  const departurePortIds = [...new Set([...list(params.get("from")), ...list(params.get("ports"))])];
  return {
    ...emptyFilters,
    search: params.get("q") ?? "",
    departurePortIds,
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
  if (filters.departurePortIds.length) params.set("from", filters.departurePortIds.join(","));
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
