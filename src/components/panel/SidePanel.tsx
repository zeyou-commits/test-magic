import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ExplorerView } from "./ExplorerView";
import { TripPlanner } from "./TripPlanner";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";

interface SidePanelProps {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  visibleRoutes: RouteLine[];
  hidePrimarySearchOnMobile?: boolean;
}

export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  visibleRoutes,
  hidePrimarySearchOnMobile = false,
}: SidePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {selection ? (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/50 px-5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sélection
              </span>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                Fermer ✕
              </button>
            </div>
            {selection.type === "port" ? (
              <PortView portId={selection.id} onSelect={onSelect} />
            ) : selection.type === "route" ? (
              <RouteView routeId={selection.id} onSelect={onSelect} />
            ) : selection.type === "company" ? (
              <CompanyView companyId={selection.id} onSelect={onSelect} />
            ) : selection.type === "vessel" ? (
              <VesselView vesselId={selection.id} onSelect={onSelect} />
            ) : (
              <DepartureView departureId={selection.id} onSelect={onSelect} />
            )}
            <div className="h-2 bg-secondary/40" />
          </div>
        ) : null}
        <TripPlanner />
        <ExplorerView
          filters={filters}
          onFiltersChange={onFiltersChange}
          visibleRoutes={visibleRoutes}
          onSelect={onSelect}
          hidePrimarySearchOnMobile={hidePrimarySearchOnMobile}
        />
      </div>
    </div>
  );
}
