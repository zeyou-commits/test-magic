import { CalendarClock, MapPin, ChevronDown, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/layout/BrandMark";
import { UserMenu } from "@/components/layout/UserMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/ferry/format";
import type { Departure, Filters, Port, RouteLine, Selection } from "@/lib/ferry/types";

const ANY = "__any__";

interface MobileMapControlsProps {
  ports: Port[];
  routes: RouteLine[];
  departures: Departure[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onSelect: (selection: Selection) => void;
  onOpenPanel: () => void;
}

export function MobileMapControls({
  ports,
  routes,
  departures,
  filters,
  onFiltersChange,
  onSelect,
  onOpenPanel,
}: MobileMapControlsProps) {
  const ALGERIA = "DZ";
  const activeDeparturePorts = ports.filter((port) => port.status === "active");
  const countries = [...new Map(activeDeparturePorts.map((port) => [port.country_code, port.country_name]))]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const toggleDepartureCountry = (countryCode: string) => {
    const ids = activeDeparturePorts.filter((port) => port.country_code === countryCode).map((port) => port.id);
    const allSelected = ids.length > 0 && ids.every((id) => filters.portIds.includes(id));
    const portIds = allSelected ? filters.portIds.filter((id) => !ids.includes(id)) : [...new Set([...filters.portIds, ...ids])];
    const countryCodes = allSelected ? filters.countryCodes.filter((code) => code !== countryCode) : [...new Set([...filters.countryCodes, countryCode])];
    onFiltersChange({ ...filters, countryCodes, portIds, departureCountry: null, departurePortId: null });
  };

  const toggleDeparturePort = (portId: string) => {
    const port = activeDeparturePorts.find((item) => item.id === portId);
    const portIds = filters.portIds.includes(portId) ? filters.portIds.filter((id) => id !== portId) : [...filters.portIds, portId];
    const countryCodes = port?.country_code ? [...new Set([...filters.countryCodes, port.country_code])] : filters.countryCodes;
    onFiltersChange({ ...filters, countryCodes, portIds, departureCountry: null, departurePortId: null });
  };

  const updateDepartureCountry = (departureCountry: string | null) => {
    const selectedPort = ports.find((port) => port.id === filters.departurePortId);
    const nextPortId =
      departureCountry && selectedPort?.country_code === departureCountry
        ? filters.departurePortId
        : null;

    const nextArrivals = arrivalPorts.filter((port) =>
      routes.some(
        (route) =>
          route.arrival_port_id === port.id &&
          (!departureCountry ||
            ports.find((item) => item.id === route.departure_port_id)?.country_code ===
              departureCountry) &&
          (!nextPortId || route.departure_port_id === nextPortId),
      ),
    );

    onFiltersChange({
      ...filters,
      departureCountry,
      departurePortId: nextPortId,
      arrivalPortId:
        filters.arrivalPortId &&
        nextArrivals.some((port) => port.id === filters.arrivalPortId)
          ? filters.arrivalPortId
          : null,
    });
  };

  const updateDeparturePort = (departurePortId: string | null) => {
    const selectedPort = ports.find((port) => port.id === departurePortId);
    const departureCountry = selectedPort?.country_code ?? filters.departureCountry;
    const nextArrivals = arrivalPorts.filter((port) =>
      routes.some(
        (route) =>
          route.arrival_port_id === port.id &&
          (!departureCountry ||
            ports.find((item) => item.id === route.departure_port_id)?.country_code ===
              departureCountry) &&
          (!departurePortId || route.departure_port_id === departurePortId),
      ),
    );

    onFiltersChange({
      ...filters,
      departureCountry,
      departurePortId,
      arrivalPortId:
        filters.arrivalPortId &&
        nextArrivals.some((port) => port.id === filters.arrivalPortId)
          ? filters.arrivalPortId
          : null,
    });
  };

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "Port";

  const destinations = compatibleArrivals.slice(0, 6);

  const nextDepartures = departures
    .filter((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      if (!route || departure.status === "cancelled") return false;
      if (filters.departurePortId && route.departure_port_id !== filters.departurePortId)
        return false;
      if (filters.arrivalPortId && route.arrival_port_id !== filters.arrivalPortId)
        return false;
      return true;
    })
    .slice(0, 4);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 px-1.5 pt-[max(0.15rem,env(safe-area-inset-top))] md:hidden">
      <div className="pointer-events-auto rounded-xl border border-border/60 bg-background/95 p-2 shadow-sm backdrop-blur-xl">
        <div className="flex h-7 items-center justify-between px-0.5 pb-1">
          <Link to="/" className="flex min-w-0 items-center">
            <BrandMark className="size-5 shrink-0 text-primary" />
            <span className="ml-1.5 text-xs font-semibold text-foreground">Batogo</span>
          </Link>
          <UserMenu compact />
        </div>

        <div className="grid grid-cols-2 items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-11 min-w-0 justify-between rounded-lg bg-card px-2.5 text-xs font-medium shadow-none">
                <span className="truncate">{filters.portIds.length ? filters.portIds.length + " port" + (filters.portIds.length > 1 ? "s" : "") + " de départ" : "Départs"}</span>
                <ChevronDown className="size-3.5 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] max-w-sm p-2">
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-foreground">Ports de départ</p>
                <p className="text-[10px] text-muted-foreground">Choisissez un ou plusieurs pays et ports.</p>
              </div>
              <div className="max-h-[55vh] overflow-y-auto">
                {countries.map((country) => {
                  const ids = activeDeparturePorts.filter((port) => port.country_code === country.value).map((port) => port.id);
                  const selectedCount = ids.filter((id) => filters.portIds.includes(id)).length;
                  const countrySelected = selectedCount === ids.length && ids.length > 0;
                  return (
                    <div key={country.value} className="mb-1 rounded-lg bg-muted/40 p-1">
                      <button type="button" onClick={() => toggleDepartureCountry(country.value)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold hover:bg-background">
                        <span>{country.label}</span>
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {selectedCount ? selectedCount + "/" + ids.length : ""}
                          <span className={countrySelected ? "grid size-4 place-items-center rounded border bg-primary text-primary-foreground" : "grid size-4 place-items-center rounded border"}>{countrySelected ? <Check className="size-3" /> : null}</span>
                        </span>
                      </button>
                      <div className="grid grid-cols-2 gap-0.5 px-1 pb-1">
                        {activeDeparturePorts.filter((port) => port.country_code === country.value).map((port) => {
                          const selected = filters.portIds.includes(port.id);
                          return (
                            <button key={port.id} type="button" onClick={() => toggleDeparturePort(port.id)} className={selected ? "flex min-h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2 text-left text-[11px] font-semibold text-primary" : "flex min-h-8 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-muted-foreground hover:bg-background"}>
                              <span className={selected ? "grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground" : "size-3.5 rounded-full border"}>{selected ? <Check className="size-2.5" /> : null}</span>
                              <span className="truncate">{port.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <PortSelect label="Port d’arrivée" placeholder="Arrivée" value={filters.arrivalPortId} ports={compatibleArrivals} onChange={(arrivalPortId) => onFiltersChange({ ...filters, arrivalPortId })} />
        </div>
      </div>

      <div className="pointer-events-auto -mx-3 mt-2 flex snap-x gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {destinations.map((port) => (
          <Button
            key={`destination-${port.id}`}
            type="button"
            variant={filters.arrivalPortId === port.id ? "default" : "outline"}
            size="sm"
            className="shrink-0 snap-start rounded-full bg-background/95 shadow-sm backdrop-blur-md"
            onClick={() => {
              // Ce bouton applique uniquement le filtre : aucune popup ne doit s'ouvrir.
              onFiltersChange({ ...filters, arrivalPortId: port.id });
            }}
          >
            <MapPin aria-hidden />
            {port.name}
          </Button>
        ))}
        {nextDepartures.map((departure) => {
          const route = routes.find((item) => item.id === departure.route_id);
          if (!route) return null;
          return (
            <Button
              key={`departure-${departure.id}`}
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 snap-start rounded-full bg-background/95 shadow-sm backdrop-blur-md"
              onClick={() => {
                onSelect({ type: "departure", id: departure.id });
                onOpenPanel();
              }}
            >
              <CalendarClock aria-hidden />
              {portName(route.departure_port_id)} · {formatDateTime(departure.departure_at)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function PortSelect({
  label,
  placeholder,
  value,
  ports = [],
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  ports?: Port[];
  options?: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const values = options ?? ports.map((port) => ({ value: port.id, label: port.name }));

  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger className="h-11 min-w-0 rounded-lg bg-card px-2 text-xs shadow-none">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="max-h-48 min-w-0 w-[var(--radix-select-trigger-width)] [&>div]:h-auto [&>div]:max-h-44"
        >
            <SelectItem value={ANY} className="py-2 text-sm">
            {placeholder}
          </SelectItem>
          {values.map((option) => (
            <SelectItem key={option.value} value={option.value} className="py-2 text-sm">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
