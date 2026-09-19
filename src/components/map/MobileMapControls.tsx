import { ArrowRight, CalendarClock, MapPin } from "lucide-react";
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
  const activePorts = ports.filter((port) => port.status === "active");
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "Port";
  const destinationCounts = new Map<string, number>();

  routes.forEach((route) => {
    if (filters.departurePortId && route.departure_port_id !== filters.departurePortId) return;
    destinationCounts.set(
      route.arrival_port_id,
      (destinationCounts.get(route.arrival_port_id) ?? 0) + 1,
    );
  });

  const destinations = [...destinationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => ports.find((port) => port.id === id))
    .filter((port): port is Port => Boolean(port));

  const nextDepartures = departures
    .filter((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      if (!route || departure.status === "cancelled") return false;
      if (filters.departurePortId && route.departure_port_id !== filters.departurePortId) return false;
      if (filters.arrivalPortId && route.arrival_port_id !== filters.arrivalPortId) return false;
      return true;
    })
    .slice(0, 4);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
      <div className="pointer-events-auto rounded-xl border border-border/70 bg-background/95 p-2.5 shadow-[var(--shadow-elegant)] backdrop-blur-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 pb-2">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <BrandMark className="size-7 shrink-0 text-primary" />
            <span className="truncate font-display text-base font-bold">Batogo</span>
          </Link>
          <UserMenu />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
          <PortSelect
            label="Départ"
            placeholder="D'où ?"
            value={filters.departurePortId}
            ports={activePorts}
            onChange={(departurePortId) =>
              onFiltersChange({ ...filters, departurePortId, departureCountry: null })
            }
          />
          <ArrowRight className="mb-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <PortSelect
            label="Arrivée"
            placeholder="Où ?"
            value={filters.arrivalPortId}
            ports={activePorts}
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
  ports,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  ports: Port[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block px-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
        <SelectTrigger className="h-11 min-w-0 rounded-lg bg-card px-2.5 shadow-none">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {ports.map((port) => (
            <SelectItem key={port.id} value={port.id}>
              {port.name} · {port.country_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}