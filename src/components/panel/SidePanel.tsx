import { Button } from "@/components/ui/button";
import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ExplorerView } from "./ExplorerView";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";

interface SidePanelProps {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  visibleRoutes: RouteLine[];
}

export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  visibleRoutes,
}: SidePanelProps) {
  return (
    <div className="flex h-full flex-col bg-card">
      {selection ? (
        <div className="border-b border-border px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
            ← Retour à l'exploration
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {selection === null ? (
          <ExplorerView
            filters={filters}
            onFiltersChange={onFiltersChange}
            visibleRoutes={visibleRoutes}
            onSelect={onSelect}
          />
        ) : selection.type === "port" ? (
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
      </div>
    </div>
  );
}
