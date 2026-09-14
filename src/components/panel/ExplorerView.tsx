import { useQuery } from "@tanstack/react-query";
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

interface ExplorerViewProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  visibleRoutes: RouteLine[];
  onSelect: (selection: Selection) => void;
}

export function ExplorerView({
  filters,
  onFiltersChange,
  visibleRoutes,
  onSelect,
}: ExplorerViewProps) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const hasFilters =
    filters.search.trim() !== "" ||
    filters.portIds.length > 0 ||
    filters.departureCountry !== null ||
    filters.departurePortId !== null ||
    filters.arrivalPortId !== null ||
    filters.companyId !== null ||
    filters.vesselId !== null;

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

  const countries = [...new Map(ports.map((port) => [port.country_code, port.country_name]))]
    .map(([code, name]) => ({ value: code, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <div>
      <PanelHeader
        overline="Explorer"
        title="Traversées vers l'Algérie"
        subtitle={`${routes.length} lignes · ${ports.length} ports`}
      />
      <div>
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

        <Section
          title="Filtres"
          action={
            hasFilters ? (
              <Button variant="ghost" size="sm" onClick={() => onFiltersChange(emptyFilters)}>
                Réinitialiser
              </Button>
            ) : null
          }
        >
          <div className="grid gap-3">
            <FilterSelect
              label="Pays de départ"
              value={filters.departureCountry}
              onChange={(value) => onFiltersChange({ ...filters, departureCountry: value })}
              options={countries}
            />
            <FilterSelect
              label="Port de départ"
              value={filters.departurePortId}
              onChange={(value) => onFiltersChange({ ...filters, departurePortId: value })}
              options={ports.map((port) => ({ value: port.id, label: port.name }))}
            />
            <FilterSelect
              label="Port d'arrivée"
              value={filters.arrivalPortId}
              onChange={(value) => onFiltersChange({ ...filters, arrivalPortId: value })}
              options={ports.map((port) => ({ value: port.id, label: port.name }))}
            />

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
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Date de départ</span>
              <Input
                type="date"
                value={filters.date ?? ""}
                onChange={(event) =>
                  onFiltersChange({ ...filters, date: event.target.value || null })
                }
              />
            </label>
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tous" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Tous</SelectItem>
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
