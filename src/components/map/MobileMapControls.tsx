import { ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/layout/BrandMark";
import { UserMenu } from "@/components/layout/UserMenu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrivalSelect, DeparturePicker } from "@/components/panel/PortFilters";
import type { Filters, Port, RouteLine } from "@/lib/ferry/types";

interface MobileMapControlsProps {
  ports: Port[];
  routes: RouteLine[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function MobileMapControls({ ports, routes, filters, onFiltersChange }: MobileMapControlsProps) {
  const count = filters.departurePortIds.length;
  const departureLabel = count === 0 ? "Départ : tous" : count === 1 ? "1 port de départ" : `${count} ports de départ`;

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 p-2">
      <div className="flex h-12 items-center justify-between rounded-xl border bg-background/95 px-3 shadow-md backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="size-6 text-primary" />
          <span className="font-display text-base font-bold tracking-tight">Batogo</span>
        </Link>
        <div className="flex items-center gap-2">
          <UserMenu compact />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex min-h-10 w-full flex-col justify-center rounded-xl border border-input bg-background/95 px-3 py-1.5 text-left shadow-sm backdrop-blur-md transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {departureLabel}
                </span>
                <span className="flex items-center justify-between text-sm font-medium">
                  <span className="truncate">
                    {count === 1
                      ? ports.find((p) => p.id === filters.departurePortIds[0])?.name
                      : count > 1
                        ? "Sélection multiple"
                        : "Tous les ports"}
                  </span>
                  <ChevronDown className="size-4 opacity-50" />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-h-[50vh] overflow-y-auto p-2" align="start">
              <div className="mb-4 px-2 text-xs font-semibold text-muted-foreground">
                Ports de départ <br /> Un ou plusieurs pays et ports.
              </div>
              <DeparturePicker ports={ports} routes={routes} filters={filters} onFiltersChange={onFiltersChange} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1">
          <ArrivalSelect
            ports={ports}
            routes={routes}
            filters={filters}
            onFiltersChange={onFiltersChange}
            triggerClassName="batogo-control min-h-10 h-auto flex-col items-start justify-center px-3 py-1.5 shadow-sm backdrop-blur-md"
          />
        </div>
      </div>
    </div>
  );
}
