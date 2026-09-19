import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { emptyFilters, type Filters, type RouteLine, type Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";
import { EmptyNote, PanelHeader, Section } from "./shared";

const ANY = "__any__";
const ALGERIA = "DZ";

interface ExplorerViewProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  visibleRoutes: RouteLine[];
  onSelect: (selection: Selection) => void;
  hidePrimarySearchOnMobile?: boolean;
}

export function ExplorerView({
  filters,
  onFiltersChange,
  visibleRoutes,
  onSelect,
  hidePrimarySearchOnMobile = false,
}: ExplorerViewProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const departurePorts = ports.filter((port) => port.status === "active" && port.country_code !== ALGERIA);
  const arrivalPorts = ports.filter((port) => port.status === "active" && port.country_code === ALGERIA);
  const filteredDeparturePorts = filters.departureCountry
    ? departurePorts.filter((port) => port.country_code === filters.departureCountry)
    : departurePorts;
  const countries = [...new Map(departurePorts.map((port) => [port.country_code, port.country_name]))]
    .map(([code, name]) => ({ value: code, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const routeMatchesDeparture = (route: RouteLine) =>
    !filters.departureCountry ||
    ports.find((port) => port.id === route.departure_port_id)?.country_code === filters.departureCountry;

  const routeMatchesDeparturePort = (route: RouteLine) =>
    !filters.departurePortId || route.departure_port_id === filters.departurePortId;

  const compatibleArrivalPorts = arrivalPorts.filter((port) =>
    routes.some(
      (route) =>
        route.arrival_port_id === port.id &&
        routeMatchesDeparture(route) &&
        routeMatchesDeparturePort(route),
    ),
  );

  const updateDepartureCountry = (value: string | null) => {
    const selectedPort = ports.find((port) => port.id === filters.departurePortId);
    onFiltersChange({
      ...filters,
      departureCountry: value,
      departurePortId: value && selectedPort?.country_code !== value ? null : filters.departurePortId,
    });
  };

  const updateDeparturePort = (value: string | null) => {
    const selectedPort = ports.find((port) => port.id === value);
    const nextFilters = {
      ...filters,
      departurePortId: value,
      departureCountry: selectedPort?.country_code ?? filters.departureCountry,
    };

    const nextCompatibleArrivals = arrivalPorts.filter((port) =>
      routes.some(
        (route) =>
          route.arrival_port_id === port.id &&
          (!nextFilters.departureCountry ||
            ports.find((item) => item.id === route.departure_port_id)?.country_code === nextFilters.departureCountry) &&
          (!nextFilters.departurePortId || route.departure_port_id === nextFilters.departurePortId),
      ),
    );

    onFiltersChange({
      ...nextFilters,
      arrivalPortId:
        nextFilters.arrivalPortId &&
        nextCompatibleArrivals.some((port) => port.id === nextFilters.arrivalPortId)
          ? nextFilters.arrivalPortId
          : null,
    });
  };

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.portIds.length > 0 ||
    filters.departureCountry !== null ||
    filters.departurePortId !== null ||
    filters.arrivalPortId !== null ||
    filters.companyId !== null ||
    filters.vesselId !== null ||
    filters.date !== null;

  const matchingPorts = filters.search.trim()
    ? ports.filter((port) =>
        `${port.name} ${port.city ?? ""} ${port.country_name}`
          .toLowerCase()
          .includes(filters.search.trim().toLowerCase()),
      )
    : [];

  const togglePort = (id: string) =>
    onFiltersChange({
      ...filters,
      portIds: filters.portIds.includes(id)
        ? filters.portIds.filter((item) => item !== id)
        : [...filters.portIds, id],
    });

  return (
    <div>
      <PanelHeader
        overline="Explorer"
        title="Traversées vers l'Algérie"
        subtitle={`${routes.length} lignes · ${ports.length} ports`}
      />
      <div>
        <div className={hidePrimarySearchOnMobile ? "hidden md:block" : undefined}>
        <Section title="Recherche">
          <Input
            value={filters.search}
            onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            placeholder="Un port, une ville, un pays…"
          />
          {filters.portIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.portIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePort(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {portName(id)} <span aria-hidden>✕</span>
                </button>
              ))}
            </div>
          ) : null}
          {matchingPorts.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {matchingPorts.slice(0, 6).map((port) => {
                const picked = filters.portIds.includes(port.id);
                return (
                  <li key={port.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => togglePort(port.id)}
                      className="flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <span className="font-medium">{port.name}</span>
                      <span className="text-muted-foreground"> · {port.country_name}</span>
                      {picked ? <span className="ml-1 text-primary">✓</span> : null}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect({ type: "port", id: port.id })}
                    >
                      Fiche
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Touchez un port pour l'ajouter à la sélection, plusieurs ports sont possibles.
          </p>
        </Section>
        </div>

        <Section
          title="Votre trajet"
          action={
            hasFilters ? (
              <Button variant="ghost" size="sm" onClick={() => onFiltersChange(emptyFilters)}>
                Réinitialiser
              </Button>
            ) : null
          }
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Choisissez d’abord votre pays de départ, puis votre port et votre arrivée en Algérie.
              </p>
              <div className="space-y-2.5">
                <FilterSelect label="1. Pays de départ" value={filters.departureCountry} onChange={updateDepartureCountry} options={countries} placeholder="Choisir un pays" />
                <FilterSelect label="2. Port de départ" value={filters.departurePortId} onChange={updateDeparturePort} options={filteredDeparturePorts.map((port) => ({ value: port.id, label: port.name }))} placeholder={filters.departureCountry ? "Choisir un port de départ" : "Choisissez d’abord un pays"} disabled={!filters.departureCountry} />
                <FilterSelect label="3. Port d’arrivée en Algérie" value={filters.arrivalPortId} onChange={(value) => onFiltersChange({ ...filters, arrivalPortId: value })} options={compatibleArrivalPorts.map((port) => ({ value: port.id, label: port.name }))} placeholder="Choisir un port d’arrivée" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Compagnie" active={filters.companyId !== null} value={filters.companyId ? companies.find((company) => company.id === filters.companyId)?.name : undefined} onClick={() => setFiltersOpen(true)} />
              <FilterChip label="Navire" active={filters.vesselId !== null} value={filters.vesselId ? vessels.find((vessel) => vessel.id === filters.vesselId)?.name : undefined} onClick={() => setFiltersOpen(true)} />
              <FilterChip label="Date" active={filters.date !== null} value={filters.date ? new Date(filters.date).toLocaleDateString("fr-FR") : undefined} onClick={() => setFiltersOpen(true)} icon={<CalendarDays className="size-3.5" />} />
              <Button type="button" variant={filtersOpen ? "secondary" : "outline"} size="sm" className="h-8 rounded-full px-3" onClick={() => setFiltersOpen((open) => !open)}>
                <SlidersHorizontal className="size-3.5" />
                Plus de filtres
              </Button>
            </div>

            {filtersOpen ? (
              <div className="grid gap-2.5 rounded-xl border border-border/70 bg-secondary/30 p-3 sm:grid-cols-2">
                <FilterSelect label="Compagnie" value={filters.companyId} onChange={(value) => onFiltersChange({ ...filters, companyId: value })} options={companies.map((company) => ({ value: company.id, label: company.name }))} />
                <FilterSelect label="Navire" value={filters.vesselId} onChange={(value) => onFiltersChange({ ...filters, vesselId: value })} options={vessels.map((vessel) => ({ value: vessel.id, label: vessel.name }))} />
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Date de départ</span>
                  <Input type="date" value={filters.date ?? ""} onChange={(event) => onFiltersChange({ ...filters, date: event.target.value || null })} />
                </label>
              </div>
            ) : null}
          </div>
        </Section>
        <Section title={`Lignes affichées (${visibleRoutes.length})`}>
          {visibleRoutes.length === 0 ? (
            <EmptyNote>Aucune ligne ne correspond à cette sélection.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {visibleRoutes.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "route", id: route.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-secondary"
                  >
                    <span className="text-sm font-medium">
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {formatDuration(route.typical_duration_minutes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  value,
  active,
  onClick,
  icon,
}: {
  label: string;
  value?: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  const className = active
    ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary"
    : "inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-secondary";

  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {active ? value : label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Tous",
  disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger>
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
