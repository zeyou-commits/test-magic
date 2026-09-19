import { CalendarClock, MapPin } from "lucide-react";
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
  const activeDeparturePorts = ports.filter(
    (port) => port.status === "active" && port.country_code !== ALGERIA,
  );
  const arrivalPorts = ports.filter(
    (port) => port.status === "active" && port.country_code === ALGERIA,
  );

  const countries = [...new Map(
    activeDeparturePorts.map((port) => [port.country_code, port.country_name]),
  )]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const departurePorts = filters.departureCountry
    ? activeDeparturePorts.filter(
        (port) => port.country_code === filters.departureCountry,
      )
    : activeDeparturePorts;

  const compatibleArrivals = arrivalPorts.filter((port) =>
    routes.some((route) => {
      if (route.arrival_port_id !== port.id) return false;
      const departure = ports.find((item) => item.id === route.departure_port_id);
      if (filters.departureCountry && departure?.country_code !== filters.departureCountry)
        return false;
      if (filters.departurePortId && route.departure_port_id !== filters.departurePortId)
        return false;
      return true;
    }),
  );

  const compatibleDeparturePorts = activeDeparturePorts.filter((port) =>
    routes.some((route) => {
      if (route.departure_port_id !== port.id) return false;
      if (filters.arrivalPortId && route.arrival_port_id !== filters.arrivalPortId) return false;
      if (
        filters.departureCountry &&
        port.country_code !== filters.departureCountry
      )
        return false;
      return true;
    }),
  );

  const updateDepartureCountry = (departureCountry: string | null) => {
    const selectedPort = ports.find((port) => port.id === filters.departurePortId);
    const nextPortId =
      departureCountry && selectedPort?.country_code === departureCountry
        ? filters.departurePortId
        : null;

    const nextArrivals = arrivalPorts.filter((port) =>
      routes.some((route) => {
        if (route.arrival_port_id !== port.id) return false;
        const departure = ports.find((item) => item.id === route.departure_port_id);
        return departure?.country_code === departureCountry;
      }),
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
      <div className="pointer-events-auto rounded-lg border border-border/60 bg-background/95 p-1.5 shadow-sm backdrop-blur-xl">
        <div className="flex h-5 items-center justify-between px-0.5 pb-1">
          <Link to="/" className="flex min-w-0 items-center">
            <BrandMark className="size-3.5 shrink-0 text-primary" />
            <span className="sr-only">Batogo</span>
          </Link>
          <UserMenu compact />
        </div>

        <div className="grid grid-cols-3 items-center gap-1">
          <PortSelect
            label="Pays de départ"
            placeholder="Pays"
            value={filters.departureCountry}
            options={countries}
            onChange={updateDepartureCountry}
          />
          <PortSelect
            label="Port de départ"
            placeholder="Départ"
            value={filters.departurePortId}
            ports={departurePorts.filter((port) =>
              compatibleDeparturePorts.some((item) => item.id === port.id),
            )}
            onChange={updateDeparturePort}
          />
          <PortSelect
            label="Port d’arrivée"
            placeholder="Arrivée"
            value={filters.arrivalPortId}
            ports={compatibleArrivals}
            onChange={(arrivalPortId) => onFiltersChange({ ...filters, arrivalPortId })}
          />
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
              onFiltersChange({ ...filters, arrivalPortId: port.id });
              onSelect({ type: "port", id: port.id });
              onOpenPanel();
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
        <SelectTrigger className="h-8 min-w-0 rounded-md bg-card px-1.5 text-[11px] shadow-none">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="max-h-48 min-w-0 w-[var(--radix-select-trigger-width)] [&>div]:h-auto [&>div]:max-h-44"
        >
          <SelectItem value={ANY} className="py-1 text-xs">
            {placeholder}
          </SelectItem>
          {values.map((option) => (
            <SelectItem key={option.value} value={option.value} className="py-1 text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
