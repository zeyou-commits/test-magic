import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ExplorerView } from "./ExplorerView";
import { TripPlanner } from "./TripPlanner";
import { MapRouteFilter } from "./MapRouteFilter";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import {
  CompanyView,
  DepartureView,
  VesselView,
} from "./EntityViews";

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
  const shareSelection = async () => {
    if (typeof window === "undefined") return;

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Batogo — traversées en ferry",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      // L'utilisateur peut fermer la fenêtre de partage.
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {selection ? (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/50 px-5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sélection
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={shareSelection}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                  title="Partager cette sélection"
                >
                  <Share2 aria-hidden className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">
                    Partager
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="min-h-9 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  Fermer ✕
                </button>
              </div>
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
              <DepartureView
                departureId={selection.id}
                onSelect={onSelect}
              />
            )}

            <div className="h-2 bg-secondary/40" />
          </div>
        ) : null}

        <MapRouteFilter
          filters={filters}
          onFiltersChange={onFiltersChange}
        />

        <TripPlanner
          selection={selection}
          onSelect={onSelect}
        />

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
