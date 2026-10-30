import { normalizeText } from "./filtering";

export type CatalogResult = {
  kind: "vessel" | "company" | "port" | "route";
  id: string;
  label: string;
  /** État réel : prochaine traversée, ou « aucune traversée programmée » (fiche quand même ouverte). */
  hint: string;
};

type Source = {
  vessels: { id: string; name: string; company_id: string | null; status: string }[];
  companies: { id: string; name: string; status: string }[];
  ports: {
    id: string;
    name: string;
    city?: string | null;
    country_name?: string | null;
    status?: string;
  }[];
  routes: { id: string; departure_port_id: string; arrival_port_id: string }[];
  departures: {
    route_id: string;
    company_id: string;
    vessel_id: string | null;
    departure_at: string;
    status: string;
  }[];
};

const day = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

/** Tous les mots tapés doivent se retrouver, sans accents ni majuscules. */
export function searchCatalog(term: string, source: Source, limit = 6): CatalogResult[] {
  const words = normalizeText(term).split(/\s+/).filter(Boolean);
  if (words.join("").length < 2) return [];
  const hit = (...values: (string | null | undefined)[]) => {
    const text = normalizeText(values.filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  };
  const now = Date.now();
  const upcoming = source.departures
    .filter((d) => d.status !== "cancelled" && Date.parse(d.departure_at) >= now)
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const nextHint = (next: { departure_at: string } | undefined, count: number) =>
    next
      ? `Prochaine traversée le ${day(next.departure_at)} · ${count} à venir`
      : "Aucune traversée programmée pour le moment";
  const portName = (id: string) => source.ports.find((p) => p.id === id)?.name ?? "?";
  const companyName = (id: string | null) => source.companies.find((c) => c.id === id)?.name;

  const vessels: CatalogResult[] = source.vessels
    .filter((v) => v.status === "active" && hit(v.name, companyName(v.company_id)))
    .slice(0, limit)
    .map((v) => {
      const own = upcoming.filter((d) => d.vessel_id === v.id);
      return {
        kind: "vessel",
        id: v.id,
        label: v.name,
        hint: `${companyName(v.company_id) ?? "Compagnie à confirmer"} · ${nextHint(own[0], own.length)}`,
      };
    });
  const companies: CatalogResult[] = source.companies
    .filter((c) => c.status === "active" && hit(c.name))
    .slice(0, limit)
    .map((c) => {
      const own = upcoming.filter((d) => d.company_id === c.id);
      return { kind: "company", id: c.id, label: c.name, hint: nextHint(own[0], own.length) };
    });
  const ports: CatalogResult[] = source.ports
    .filter((p) => p.status !== "draft" && hit(p.name, p.city, p.country_name))
    .slice(0, limit)
    .map((p) => ({ kind: "port", id: p.id, label: p.name, hint: p.country_name ?? "Port" }));
  const routes: CatalogResult[] = source.routes
    .filter((r) => hit(portName(r.departure_port_id), portName(r.arrival_port_id)))
    .slice(0, limit)
    .map((r) => {
      const own = upcoming.filter((d) => d.route_id === r.id);
      return {
        kind: "route",
        id: r.id,
        label: `${portName(r.departure_port_id)} → ${portName(r.arrival_port_id)}`,
        hint: nextHint(own[0], own.length),
      };
    });
  return [...vessels, ...companies, ...ports, ...routes];
}
