import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, MapPinned, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { companiesQuery, portsQuery, routesQuery, upcomingDeparturesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { emptyFilters, type Filters, type RouteLine, type Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";
import { EmptyNote, Section } from "./shared";

const ANY = "__any__";

interface ExplorerViewProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  visibleRoutes: RouteLine[];
  onSelect: (selection: Selection) => void;
  selection: Selection | null;
  hidePrimarySearchOnMobile?: boolean;
}

export function ExplorerView({
  filters,
  onFiltersChange,
  visibleRoutes,
  onSelect,
  selection,
  hidePrimarySearchOnMobile = false,
}: ExplorerViewProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: departures = [], isLoading: departuresLoading } = useQuery(upcomingDeparturesQuery());

  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCountries = filters.countryCodes;

  const activePorts = useMemo(
    () => ports.filter((port) => port.status === "active"),
    [ports],
  );

  const countries = useMemo(
    () =>
      [...new Map(
        activePorts.map((port) => [port.country_code, port.country_name]),
      )]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [activePorts],
  );

  const selectedPorts = useMemo(
    () => activePorts.filter((port) => filters.portIds.includes(port.id)),
    [activePorts, filters.portIds],
  );

  const visiblePorts = useMemo(() => {
    if (!activeCountries.length) return activePorts;
    return activePorts.filter((port) => activeCountries.includes(port.country_code));
  }, [activeCountries, activePorts]);

  const selectedLineCount = useMemo(() => {
    if (!filters.portIds.length) return routes.length;

    const selectedIds = new Set(filters.portIds);
    return routes.filter(
      (route) =>
        selectedIds.has(route.departure_port_id) ||
        selectedIds.has(route.arrival_port_id),
    ).length;
  }, [filters.portIds, routes]);

  const selectedRouteIds = useMemo(() => {
    if (!filters.portIds.length) return new Set(routes.map((route) => route.id));
    const selectedIds = new Set(filters.portIds);
    return new Set(
      routes
        .filter(
          (route) =>
            selectedIds.has(route.departure_port_id) ||
            selectedIds.has(route.arrival_port_id),
        )
        .map((route) => route.id),
    );
  }, [filters.portIds, routes]);

  const upcoming = useMemo(() => {
    const selected = departures
      .filter((departure) => selectedRouteIds.has(departure.route_id))
      .filter((departure) => !filters.companyId || departure.company_id === filters.companyId)
      .filter((departure) => !filters.vesselId || departure.vessel_id === filters.vesselId)
      .filter((departure) => !filters.date || departure.departure_at.startsWith(filters.date))
      .sort(
        (a, b) =>
          new Date(a.departure_at).getTime() - new Date(b.departure_at).getTime(),
      );
    return selected.slice(0, 12);
  }, [departures, filters.companyId, filters.date, filters.vesselId, selectedRouteIds]);

  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const portById = useMemo(() => new Map(activePorts.map((port) => [port.id, port])), [activePorts]);
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const vesselById = useMemo(() => new Map(vessels.map((vessel) => [vessel.id, vessel])), [vessels]);

  const matchingPorts = filters.search.trim()
    ? activePorts
        .filter((port) =>
          `${port.name} ${port.city ?? ""} ${port.country_name}`
            .toLowerCase()
            .includes(filters.search.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const advancedFilterCount =
    Number(filters.companyId !== null) +
    Number(filters.vesselId !== null) +
    Number(filters.date !== null);

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.portIds.length > 0 ||
    filters.companyId !== null ||
    filters.vesselId !== null ||
    filters.date !== null ||
    filters.countryCodes.length > 0;

  const togglePort = (portId: string) => {
    const portIds = filters.portIds.includes(portId)
      ? filters.portIds.filter((id) => id !== portId)
      : [...filters.portIds, portId];

    onFiltersChange({
      ...filters,
      portIds,
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  const toggleCountry = (countryCode: string) => {
    const isSelected = activeCountries.includes(countryCode);
    const countryCodes = isSelected
      ? activeCountries.filter((code) => code !== countryCode)
      : [...activeCountries, countryCode];

    onFiltersChange({
      ...filters,
      countryCodes,
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  const reset = () => {
    onFiltersChange(emptyFilters);
    setFiltersOpen(false);
  };

  return (
    <div className="pb-2">
      <div className="space-y-1">
        <div className={hidePrimarySearchOnMobile ? "hidden md:block" : undefined}>
          <Section title="Rechercher un port">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#718489]" />
              <Input
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({ ...filters, search: event.target.value })
                }
                placeholder="Rechercher Marseille, Alger, Oran…"
                className="batogo-field h-11 pl-9 pr-9 text-sm shadow-none"
              />
              {filters.search ? (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => onFiltersChange({ ...filters, search: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#6b7f84] hover:bg-[#f1ece2]"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            {matchingPorts.length > 0 ? (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                {matchingPorts.map((port) => (
                  <li key={port.id} className="border-b border-[#edf0ed] last:border-0">
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "port", id: port.id })}
                      className="batogo-list-item flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#17383f]">{port.name}</span>
                        <span className="block text-xs text-[#718489]">
                          {port.city ? `${port.city} · ${port.country_name}` : port.country_name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-[#0e7490]">Voir la fiche</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {filters.search && matchingPorts.length === 0 ? (
              <p className="mt-2 text-xs text-[#718489]">Aucun port trouvé.</p>
            ) : null}
          </Section>
        </div>

        <Section
          title="Pays & ports"
          action={
            hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 text-xs text-[#547078] hover:bg-[#f1ece2]"
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Réinitialiser
              </Button>
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPinned className="size-3.5 text-[#0e7490]" />
                <span className="text-xs font-medium text-[#547078]">
                  {filters.portIds.length
                    ? `${selectedLineCount} lignes liées à votre sélection`
                    : `${routes.length} lignes disponibles`}
                </span>
              </div>
              {selectedPorts.length ? (
                <span className="rounded-full bg-[#f7f3ea] px-2 py-1 text-[10px] font-semibold text-[#0e7490]">
                  {selectedPorts.length} port{selectedPorts.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#718489]">
                Pays
              </p>
              <div className="flex flex-wrap gap-2">
                {countries.map((country) => {
                  const selected = activeCountries.includes(country.code);
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => toggleCountry(country.code)}
                      className={`batogo-list-item inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition ${
                        selected
                          ? "bg-[#0e7490] text-white shadow-sm"
                          : "bg-[#f3f0e8] text-[#3f6269] hover:bg-[#e9f1ef]"
                      }`}
                    >
                      <span>{country.name}</span>
                      {selected ? <Check className="size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[#eeeae1]" />

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#718489]">
                  Ports
                </p>
                {activeCountries.length ? (
                  <span className="text-[10px] text-[#718489]">
                    {visiblePorts.length} disponibles
                  </span>
                ) : null}
              </div>

              <div className="grid max-h-52 gap-0.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {visiblePorts.map((port) => {
                  const selected = filters.portIds.includes(port.id);
                  return (
                    <button
                      key={port.id}
                      type="button"
                      onClick={() => togglePort(port.id)}
                      className={`batogo-list-item flex min-h-9 items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs transition ${
                        selected
                          ? "bg-[#eaf5f5] text-[#0e6177]"
                          : "text-[#294b53] hover:bg-[#f4f1e9]"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {port.name}
                        {port.city && port.city !== port.name ? ` · ${port.city}` : ""}
                      </span>
                      {selected ? <Check className="size-4 shrink-0 text-[#0e7490]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="mt-2">
            <Button
              type="button"
              variant={filtersOpen ? "secondary" : "outline"}
              size="sm"
              className="h-8 rounded-full border-[#0e7490]/15 bg-white px-3 text-[11px] text-[#315860] hover:bg-[#f7f3ea]"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              Affiner
              {advancedFilterCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#e87961] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {advancedFilterCount}
                </span>
              ) : null}
            </Button>
          </div>

          {filtersOpen ? (
            <div className="mt-3 grid gap-2 rounded-2xl bg-muted/70 p-3 sm:grid-cols-2">
              <FilterSelect
                label="Compagnie"
                value={filters.companyId}
                onChange={(value) => onFiltersChange({ ...filters, companyId: value })}
                options={companies.map((company) => ({ value: company.id, label: company.name }))}
              />
              <FilterSelect
                label="Navire"
                value={filters.vesselId}
                onChange={(value) => onFiltersChange({ ...filters, vesselId: value })}
                options={vessels.map((vessel) => ({ value: vessel.id, label: vessel.name }))}
              />
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-medium text-[#547078]">Date de départ</span>
                <Input
                  type="date"
                  value={filters.date ?? ""}
                  onChange={(event) =>
                    onFiltersChange({ ...filters, date: event.target.value || null })
                  }
                  className="bg-white"
                />
              </label>
            </div>
          ) : null}
        </Section>

{!selection ? (
        <Section
          title="Prochains départs"
          action={
            upcoming.length ? (
              <span className="text-[10px] font-medium text-[#718489]">
                {upcoming.length} départ{upcoming.length > 1 ? "s" : ""}
              </span>
            ) : null
          }
        >
          {departuresLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-[#718489]">
              <CalendarDays className="size-3.5 animate-pulse text-[#0e7490]" />
              Chargement du calendrier…
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyNote>Aucun départ à venir pour cette sélection.</EmptyNote>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((departure) => {
                const route = routeById.get(departure.route_id);
                const departurePort = route ? portById.get(route.departure_port_id) : undefined;
                const arrivalPort = route ? portById.get(route.arrival_port_id) : undefined;
                const company = companyById.get(departure.company_id);
                const vessel = departure.vessel_id ? vesselById.get(departure.vessel_id) : undefined;
                const date = new Date(departure.departure_at);

                return (
                  <button
                    key={departure.id}
                    type="button"
                    onClick={() => onSelect({ type: "departure", id: departure.id })}
                    className="batogo-departure-card flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-[46px] rounded-lg bg-[#eaf5f5] px-1.5 py-1 text-center">
                      <div className="text-[9px] font-semibold uppercase text-[#0e7490]">
                        {date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}
                      </div>
                      <div className="text-sm font-bold leading-none text-[#17383f]">
                        {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-[#17383f]">
                        {departurePort?.name ?? "—"} → {arrivalPort?.name ?? "—"}
                      </div>
                      <div className="truncate text-[10px] text-[#718489]">
                        {company?.name ?? "Compagnie"}{vessel?.name ? ` · ${vessel.name}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-bold text-[#0e7490]">
                      {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Tous",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-[#547078]">{label}</span>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
        <SelectTrigger className="border-[#0e7490]/15 bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
