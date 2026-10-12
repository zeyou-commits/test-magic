import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Backpack,
  CalendarDays,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  emptyFilters,
  type Departure,
  type Filters,
  type RouteLine,
  type Selection,
} from "@/lib/ferry/types";
import { formatDateParts } from "@/lib/ferry/format";
import {
  hasActiveFilters,
  normalizeText,
  swapDirection,
  withArrivalPorts,
  withDeparturePorts,
} from "@/lib/ferry/filtering";
import { dateKeyInZone, portTimeZone } from "@/lib/ferry/time";
import { EmptyNote, Section } from "./shared";
import { PortMultiPicker } from "./PortFilters";
import { schoolBreakOn, type SchoolZone } from "@/lib/ferry/schoolCalendar";

const ANY = "__any__";
const LIST_SIZE = 12;

interface ExplorerViewProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  matchingRoutes: RouteLine[];
  matchingDepartures: Departure[];
  onSelect: (selection: Selection) => void;
  hidePrimarySearchOnMobile?: boolean;
}

export function ExplorerView({
  filters,
  onFiltersChange,
  matchingRoutes,
  matchingDepartures,
  onSelect,
  hidePrimarySearchOnMobile = false,
}: ExplorerViewProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { isLoading: departuresLoading } = useQuery(upcomingDeparturesQuery());

  const [filtersOpen, setFiltersOpen] = useState(() =>
    Boolean(filters.companyId || filters.vesselId || filters.date),
  );

  const activePorts = useMemo(() => ports.filter((port) => port.status === "active"), [ports]);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const portById = useMemo(() => new Map(ports.map((port) => [port.id, port])), [ports]);
  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  );
  const vesselById = useMemo(
    () => new Map(vessels.map((vessel) => [vessel.id, vessel])),
    [vessels],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return matchingDepartures.filter(
      (departure) => new Date(departure.departure_at).getTime() >= now,
    );
  }, [matchingDepartures]);

  const matchingPorts = filters.search.trim()
    ? activePorts
        .filter((port) =>
          normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(
            normalizeText(filters.search),
          ),
        )
        .slice(0, 6)
    : [];

  const advancedFilterCount =
    Number(filters.companyId !== null) +
    Number(filters.vesselId !== null) +
    Number(filters.date !== null);
  const active = hasActiveFilters(filters);

  const reset = () => {
    onFiltersChange(emptyFilters);
    setFiltersOpen(false);
  };

  return (
    // Sur mobile, les prochains départs passent avant les filtres secondaires.
    <div className="flex flex-col pb-2">
      <div className={`order-1 ${hidePrimarySearchOnMobile ? "hidden md:block" : ""}`}>
        <Section
          title="Votre trajet"
          action={
            active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 text-xs text-muted-foreground hover:bg-secondary"
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Tout effacer
              </Button>
            ) : null
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
            <PortMultiPicker
              direction="departure"
              ports={ports}
              routes={routes}
              value={filters.departurePortIds}
              otherSide={filters.arrivalPortIds}
              onChange={(ids) => onFiltersChange(withDeparturePorts(filters, ids, ports, routes))}
            />
            <button
              type="button"
              aria-label="Inverser départ et arrivée"
              title="Inverser le sens"
              disabled={!filters.departurePortIds.length && !filters.arrivalPortIds.length}
              onClick={() => onFiltersChange(swapDirection(filters))}
              className="grid size-9 place-items-center rounded-full border border-border bg-background text-primary shadow-sm transition hover:bg-secondary disabled:opacity-40"
            >
              <ArrowLeftRight className="size-4" />
            </button>
            <PortMultiPicker
              direction="arrival"
              ports={ports}
              routes={routes}
              value={filters.arrivalPortIds}
              otherSide={filters.departurePortIds}
              onChange={(ids) => onFiltersChange(withArrivalPorts(filters, ids, ports, routes))}
            />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              placeholder="Rechercher un port : Marseille, Oran…"
              aria-label="Rechercher un port"
              className="batogo-field batogo-control h-11 pl-9 pr-9 text-sm shadow-none"
            />
            {filters.search ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => onFiltersChange({ ...filters, search: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          {matchingPorts.length > 0 ? (
            <ul className="-mt-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              {matchingPorts.map((port) => (
                <li key={port.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "port", id: port.id })}
                    className="batogo-list-item flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{port.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {port.country_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      Voir la fiche
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {filters.search && matchingPorts.length === 0 ? (
            <p className="-mt-2 text-xs text-muted-foreground">Aucun port trouvé.</p>
          ) : null}
        </Section>
      </div>

      <Section title="Affiner" className="order-3 md:order-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Vacances scolaires françaises"
        >
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Backpack className="size-4" aria-hidden /> Vacances (France)
          </span>
          {(["A", "B", "C"] as SchoolZone[]).map((zone) => {
            const isActive = filters.schoolZone === zone;
            return (
              <button
                key={zone}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFiltersChange({ ...filters, schoolZone: isActive ? null : zone })}
                className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
              >
                Zone {zone}
              </button>
            );
          })}
        </div>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={filtersOpen}
            className="h-9 rounded-full px-3.5 text-xs font-semibold text-foreground shadow-none hover:bg-muted"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            Date, compagnie, navire
            {advancedFilterCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                {advancedFilterCount}
              </span>
            ) : null}
          </Button>
        </div>

        {filtersOpen ? (
          <div className="grid gap-2 rounded-2xl bg-muted/60 p-3 sm:grid-cols-2">
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-semibold text-foreground/80">Date de départ</span>
              <Input
                type="date"
                value={filters.date ?? ""}
                onChange={(event) =>
                  onFiltersChange({ ...filters, date: event.target.value || null })
                }
                className="batogo-control"
              />
            </label>
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
          </div>
        ) : null}
      </Section>

      <Section
        className="order-2 md:order-3"
        title="Prochains départs"
        action={
          upcoming.length ? (
            <span className="text-xs font-medium text-muted-foreground">
              {matchingRoutes.length} ligne{matchingRoutes.length > 1 ? "s" : ""} ·{" "}
              {upcoming.length} départ{upcoming.length > 1 ? "s" : ""}
            </span>
          ) : null
        }
      >
        {departuresLoading ? (
          <div className="space-y-1.5" aria-busy="true" aria-label="Chargement des départs">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="space-y-3">
            <EmptyNote>Aucun départ connu à venir pour cette recherche.</EmptyNote>
            {active ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reset}
                className="rounded-full"
              >
                <RotateCcw className="mr-1.5 size-3.5" /> Élargir la recherche
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Heures locales du port de départ.</p>
            {upcoming.slice(0, LIST_SIZE).map((departure) => {
              const route = routeById.get(departure.route_id);
              const departurePort = route ? portById.get(route.departure_port_id) : undefined;
              const arrivalPort = route ? portById.get(route.arrival_port_id) : undefined;
              const company = companyById.get(departure.company_id);
              const vessel = departure.vessel_id ? vesselById.get(departure.vessel_id) : undefined;
              const timeZone = portTimeZone(departurePort);
              const parts = formatDateParts(departure.departure_at, timeZone);
              const zone = filters.schoolZone;
              const holiday = zone
                ? schoolBreakOn(dateKeyInZone(departure.departure_at, timeZone), zone)
                : null;

              return (
                <button
                  key={departure.id}
                  type="button"
                  onClick={() => onSelect({ type: "departure", id: departure.id })}
                  className="batogo-departure-card flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <div className="min-w-[52px] rounded-lg bg-primary/10 px-1.5 py-1 text-center">
                    <div className="text-[11px] font-semibold uppercase text-primary">
                      {parts.weekday}
                    </div>
                    <div className="text-sm font-bold leading-none text-foreground">
                      {parts.dayMonth}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {departurePort?.name ?? "—"} → {arrivalPort?.name ?? "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {company?.name ?? "Compagnie"}
                      {vessel?.name ? ` · ${vessel.name}` : ""}
                    </div>
                    {holiday ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        <CalendarDays className="size-3" aria-hidden /> {holiday.name} · zone {zone}
                      </span>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-base font-bold tabular-nums text-primary">
                    {parts.time}
                  </div>
                </button>
              );
            })}
            {upcoming.length > LIST_SIZE ? (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                {upcoming.length - LIST_SIZE} autres départs : précisez le départ, l’arrivée ou la
                date.
              </p>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Toutes",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-foreground/80">{label}</span>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
        <SelectTrigger className="batogo-control" aria-label={label}>
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
