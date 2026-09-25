import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
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
import { EmptyNote, Section } from "./shared";

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
  const departurePorts = ports.filter(
    (port) => port.status === "active" && port.country_code !== ALGERIA,
  );
  const arrivalPorts = ports.filter(
    (port) => port.status === "active" && port.country_code === ALGERIA,
  );

  const filteredDeparturePorts = filters.departureCountry
    ? departurePorts.filter((port) => port.country_code === filters.departureCountry)
    : [];

  const countries = [...new Map(
    departurePorts.map((port) => [port.country_code, port.country_name]),
  )]
    .map(([code, name]) => ({ value: code, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const routeMatchesDeparture = (route: RouteLine) =>
    !filters.departureCountry ||
    ports.find((port) => port.id === route.departure_port_id)?.country_code ===
      filters.departureCountry;

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
    const nextPortId =
      value && selectedPort?.country_code === value ? filters.departurePortId : null;

    const nextCompatibleArrivals = arrivalPorts.filter((port) =>
      routes.some(
        (route) =>
          route.arrival_port_id === port.id &&
          (!value ||
            ports.find((item) => item.id === route.departure_port_id)?.country_code === value) &&
          (!nextPortId || route.departure_port_id === nextPortId),
      ),
    );

    onFiltersChange({
      ...filters,
      departureCountry: value,
      departurePortId: nextPortId,
      arrivalPortId:
        filters.arrivalPortId &&
        nextCompatibleArrivals.some((port) => port.id === filters.arrivalPortId)
          ? filters.arrivalPortId
          : null,
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
            ports.find((item) => item.id === route.departure_port_id)?.country_code ===
              nextFilters.departureCountry) &&
          (!nextFilters.departurePortId ||
            route.departure_port_id === nextFilters.departurePortId),
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

  const advancedFilterCount =
    Number(filters.companyId !== null) +
    Number(filters.vesselId !== null) +
    Number(filters.date !== null);

  const hasFilters =
    filters.search.trim() !== "" ||
    filters.departureCountry !== null ||
    filters.departurePortId !== null ||
    filters.arrivalPortId !== null ||
    filters.companyId !== null ||
    filters.vesselId !== null ||
    filters.date !== null;

  const matchingPorts = filters.search.trim()
    ? ports
        .filter((port) =>
          `${port.name} ${port.city ?? ""} ${port.country_name}`
            .toLowerCase()
            .includes(filters.search.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="pb-2">
      <div className="flex items-center justify-between gap-3 border-b border-[#0e7490]/10 bg-[#f7f3ea] px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#12343b]">Explorer les traversées</p>
          <p className="text-[11px] text-[#547078]">Europe → Algérie</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#547078] shadow-sm">
          {routes.length} lignes · {ports.length} ports
        </span>
      </div>

      <div className="space-y-1">
        <div className={hidePrimarySearchOnMobile ? "hidden md:block" : undefined}>
          <Section title="Trouver un port">
            <div className="relative">
              <Input
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({ ...filters, search: event.target.value })
                }
                placeholder="Marseille, Alger, Oran…"
                className="pr-9"
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
              <ul className="mt-2 overflow-hidden rounded-xl border border-[#0e7490]/10 bg-white">
                {matchingPorts.map((port) => (
                  <li key={port.id} className="border-b border-[#edf0ed] last:border-0">
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "port", id: port.id })}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#f7f3ea]"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#17383f]">
                          {port.name}
                        </span>
                        <span className="block text-xs text-[#718489]">
                          {port.city ? `${port.city} · ${port.country_name}` : port.country_name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-[#0e7490]">
                        Voir
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {filters.search && matchingPorts.length === 0 ? (
              <p className="mt-2 text-xs text-[#718489]">Aucun port trouvé.</p>
            ) : null}

            {!filters.search ? (
              <p className="mt-2 text-[11px] text-[#718489]">
                Recherchez un port pour ouvrir sa fiche.
              </p>
            ) : null}
          </Section>
        </div>

        <Section
          title="Votre trajet"
          action={
            hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFiltersChange(emptyFilters)}
                className="h-8 text-xs text-[#547078] hover:bg-[#f1ece2]"
              >
                Réinitialiser
              </Button>
            ) : null
          }
        >
          <div className="rounded-2xl border border-[#0e7490]/15 bg-white p-3 shadow-[0_4px_18px_rgba(18,52,59,0.06)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-[#547078]">
                Pays de départ → port → arrivée
              </p>
              <span className="rounded-full bg-[#f7f3ea] px-2 py-1 text-[10px] font-semibold text-[#0e7490]">
                3 étapes
              </span>
            </div>

            <div className="space-y-2.5">
              <FilterSelect
                label="Pays de départ"
                value={filters.departureCountry}
                onChange={updateDepartureCountry}
                options={countries}
                placeholder="Choisir un pays"
              />
              <FilterSelect
                label="Port de départ"
                value={filters.departurePortId}
                onChange={updateDeparturePort}
                options={filteredDeparturePorts.map((port) => ({
                  value: port.id,
                  label: port.name,
                }))}
                placeholder={
                  filters.departureCountry
                    ? "Choisir un port"
                    : "Choisir d’abord un pays"
                }
                disabled={!filters.departureCountry}
              />
              <FilterSelect
                label="Port d’arrivée"
                value={filters.arrivalPortId}
                onChange={(value) =>
                  onFiltersChange({ ...filters, arrivalPortId: value })
                }
                options={compatibleArrivalPorts.map((port) => ({
                  value: port.id,
                  label: port.name,
                }))}
                placeholder="Choisir une arrivée"
              />
            </div>

            {filters.departurePortId || filters.arrivalPortId ? (
              <div className="mt-3 rounded-xl bg-[#f7f3ea] px-3 py-2 text-xs font-medium text-[#17383f]">
                {filters.departurePortId ? portName(filters.departurePortId) : "Départ"}{" "}
                <span className="px-1 text-[#e87961]">→</span>{" "}
                {filters.arrivalPortId ? portName(filters.arrivalPortId) : "Arrivée"}
              </div>
            ) : null}
          </div>

          <div className="mt-3">
            <Button
              type="button"
              variant={filtersOpen ? "secondary" : "outline"}
              size="sm"
              className="h-9 rounded-full border-[#0e7490]/15 bg-white px-3 text-xs text-[#315860] hover:bg-[#f7f3ea]"
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
            <div className="mt-2 grid gap-2.5 rounded-2xl border border-[#0e7490]/10 bg-[#f7f3ea] p-3 sm:grid-cols-2">
              <FilterSelect
                label="Compagnie"
                value={filters.companyId}
                onChange={(value) =>
                  onFiltersChange({ ...filters, companyId: value })
                }
                options={companies.map((company) => ({
                  value: company.id,
                  label: company.name,
                }))}
              />
              <FilterSelect
                label="Navire"
                value={filters.vesselId}
                onChange={(value) =>
                  onFiltersChange({ ...filters, vesselId: value })
                }
                options={vessels.map((vessel) => ({
                  value: vessel.id,
                  label: vessel.name,
                }))}
              />
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-medium text-[#547078]">
                  Date de départ
                </span>
                <Input
                  type="date"
                  value={filters.date ?? ""}
                  onChange={(event) =>
                    onFiltersChange({
                      ...filters,
                      date: event.target.value || null,
                    })
                  }
                  className="bg-white"
                />
              </label>
            </div>
          ) : null}
        </Section>

        <Section title={`Lignes affichées · ${visibleRoutes.length}`}>
          {visibleRoutes.length === 0 ? (
            <EmptyNote>Aucune ligne ne correspond à cette sélection.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {visibleRoutes.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "route", id: route.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f7f3ea]"
                  >
                    <span className="text-sm font-medium text-[#17383f]">
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    </span>
                    <span className="text-xs font-semibold text-[#0e7490]">
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
      <span className="text-xs font-medium text-[#547078]">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : next)}
        disabled={disabled}
      >
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
