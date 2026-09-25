import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPinned, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { emptyFilters, type Filters, type RouteLine, type Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";
import { EmptyNote, Section } from "./shared";

const ANY = "__any__";

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
  const [activeCountries, setActiveCountries] = useState<string[]>([]);

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
    filters.date !== null;

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
    const nextCountries = isSelected
      ? activeCountries.filter((code) => code !== countryCode)
      : [...activeCountries, countryCode];

    const countryPortIds = activePorts
      .filter((port) => nextCountries.includes(port.country_code))
      .map((port) => port.id);

    const nextPortIds = isSelected
      ? filters.portIds.filter(
          (id) => !activePorts.some(
            (port) =>
              port.id === id && port.country_code === countryCode,
          ),
        )
      : [...new Set([...filters.portIds, ...countryPortIds])];

    setActiveCountries(nextCountries);
    onFiltersChange({
      ...filters,
      portIds: nextPortIds,
      departureCountry: null,
      departurePortId: null,
      arrivalPortId: null,
    });
  };

  const reset = () => {
    setActiveCountries([]);
    onFiltersChange(emptyFilters);
    setFiltersOpen(false);
  };

  return (
    <div className="pb-2">
      <div className="flex items-center justify-between gap-3 border-b border-[#0e7490]/10 bg-[#f7f3ea] px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#12343b]">Explorer les traversées</p>
          <p className="text-[11px] text-[#547078]">Choisissez un ou plusieurs pays, puis un ou plusieurs ports</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#547078] shadow-sm">
          {routes.length} lignes · {ports.length} ports
        </span>
      </div>

      <div className="space-y-1">
        <div className={hidePrimarySearchOnMobile ? "hidden md:block" : undefined}>
          <Section title="Trouver un port">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#718489]" />
              <Input
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({ ...filters, search: event.target.value })
                }
                placeholder="Marseille, Alger, Oran…"
                className="pl-9 pr-9"
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
          title="Filtrer la carte"
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
          <div className="rounded-2xl border border-[#0e7490]/15 bg-white p-3 shadow-[0_4px_18px_rgba(18,52,59,0.06)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPinned className="size-4 text-[#0e7490]" />
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
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#718489]">
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
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                        selected
                          ? "border-[#0e7490] bg-[#0e7490] text-white shadow-sm"
                          : "border-[#dce4e1] bg-[#fbfaf7] text-[#3f6269] hover:border-[#0e7490]/40 hover:bg-[#f3f8f7]"
                      }`}
                    >
                      <span>{country.name}</span>
                      {selected ? <Check className="size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="my-4 border-t border-[#edf0ed]" />

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

              <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {visiblePorts.map((port) => {
                  const selected = filters.portIds.includes(port.id);
                  return (
                    <button
                      key={port.id}
                      type="button"
                      onClick={() => togglePort(port.id)}
                      className={`flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm transition ${
                        selected
                          ? "border-[#0e7490]/40 bg-[#eaf5f5] text-[#0e6177]"
                          : "border-[#e5e8e5] bg-[#fbfaf7] text-[#294b53] hover:border-[#0e7490]/30 hover:bg-[#f3f8f7]"
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

            {selectedPorts.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#edf0ed] pt-3">
                {selectedPorts.map((port) => (
                  <button
                    key={port.id}
                    type="button"
                    onClick={() => togglePort(port.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5f5] px-2.5 py-1 text-xs font-medium text-[#0e6177] hover:bg-[#dff0f0]"
                  >
                    {port.name}
                    <X className="size-3" />
                  </button>
                ))}
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
                      {ports.find((port) => port.id === route.departure_port_id)?.name ?? "—"} → {ports.find((port) => port.id === route.arrival_port_id)?.name ?? "—"}
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
