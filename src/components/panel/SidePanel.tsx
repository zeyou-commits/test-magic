import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ArrowLeft } from "lucide-react";

import { ShareButtons } from "./ShareButtons";
import { SearchPanel } from "./SearchPanel";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";

interface SidePanelProps {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  hidePickersOnMobile?: boolean;
  onHighlightRoute?: (routeId: string | null) => void;
  onFocusRoute?: (routeId: string | null) => void;
}

/** Un seul volet : la recherche en permanence, et le détail d'un port, d'une ligne ou d'un départ par-dessus. */
export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  hidePickersOnMobile = false,
  onHighlightRoute,
  onFocusRoute,
}: SidePanelProps) {
  const planRoute = (route: RouteLine) => {
    onFiltersChange({
      ...filters,
      departurePortIds: [route.departure_port_id],
      arrivalPortIds: [route.arrival_port_id],
      date: null,
      returnDate: null,
    });
    onSelect(null);
  };

  return (
    <div className="batogo-floating-panel pointer-events-auto relative flex h-full w-full flex-col overflow-hidden md:rounded-3xl">
      <div className="batogo-panel-scroll relative flex-1 overflow-y-auto">
        <SearchPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          selection={selection}
          onSelect={onSelect}
          hidePickersOnMobile={hidePickersOnMobile}
          {...(onHighlightRoute ? { onHighlightRoute } : {})}
          {...(onFocusRoute ? { onFocusRoute } : {})}
        />
      </div>

      {selection ? (
        <div className="panel-detail absolute inset-0 z-10 flex flex-col bg-background">
          <div className="flex flex-none items-center justify-between border-b border-border/20 px-3 py-1.5">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="size-3.5" /> Rechercher
            </button>
            <ShareButtons compact />
          </div>
          <div className="batogo-panel-scroll flex-1 overflow-y-auto p-4 md:p-6">
            {selection.type === "port" ? (
              <PortView portId={selection.id} onSelect={onSelect} />
            ) : selection.type === "route" ? (
              <RouteView routeId={selection.id} onSelect={onSelect} onPlanRoute={planRoute} />
            ) : selection.type === "company" ? (
              <CompanyView companyId={selection.id} onSelect={onSelect} />
            ) : selection.type === "vessel" ? (
              <VesselView vesselId={selection.id} onSelect={onSelect} />
            ) : (
              <DepartureView departureId={selection.id} onSelect={onSelect} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
