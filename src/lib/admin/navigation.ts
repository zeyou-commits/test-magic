export const adminTabs = [
  "overview",
  "commercial",
  "users",
  "reviews",
  "community",
  "reports",
  "alerts",
  "notifications",
  "flash",
  "signals",
  "places",
  "companies",
  "departures",
  "schedules",
  "ports",
  "routes",
  "vessels",
  "import",
  "data",
] as const;

export type AdminTab = (typeof adminTabs)[number];
export type AdminFilter = "today" | "unassigned" | "new" | "pending";
export type DepartureScope = Extract<AdminFilter, "today" | "unassigned">;

/** Rubriques où une fiche précise peut s'ouvrir directement (recherche du menu). */
const itemTabs = new Set<AdminTab>(["ports", "vessels", "companies"]);

export function adminSearch(search: Record<string, unknown>): {
  tab?: AdminTab;
  filter?: AdminFilter;
  company?: string;
  route?: string;
  item?: string;
} {
  const tab = adminTabs.includes(search["tab"] as AdminTab)
    ? (search["tab"] as AdminTab)
    : "overview";
  if (tab === "commercial") {
    const uuid = (value: unknown) =>
      typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
        ? value
        : undefined;
    const company = uuid(search["company"]),
      route = uuid(search["route"]);
    return { tab, ...(company ? { company } : {}), ...(company && route ? { route } : {}) };
  }
  const item = search["item"];
  if (
    itemTabs.has(tab) &&
    typeof item === "string" &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item)
  )
    return { tab, item };
  const filter = search["filter"];
  if (
    (tab === "departures" && (filter === "today" || filter === "unassigned")) ||
    (tab === "reports" && filter === "new") ||
    (tab === "reviews" && filter === "pending")
  ) {
    return { tab, filter };
  }
  return { tab };
}

/** Même journée locale pour l'indicateur et sa liste, y compris aux changements d'heure. */
export function adminDayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function matchesDepartureScope(
  departure: { departure_at: string; vessel_id: string | null; status: string },
  scope: DepartureScope | undefined,
  now = new Date(),
) {
  if (!scope) return true;
  const timestamp = Date.parse(departure.departure_at);
  if (scope === "unassigned") {
    return !departure.vessel_id && departure.status !== "cancelled" && timestamp >= now.getTime();
  }
  const { start, end } = adminDayRange(now);
  return timestamp >= Date.parse(start) && timestamp < Date.parse(end);
}
