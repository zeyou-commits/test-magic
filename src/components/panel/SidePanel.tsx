import { useState } from "react";
import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { CalendarDays, MapPinned, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ExplorerView } from "./ExplorerView";
import { TripPlanner } from "./TripPlanner";
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

type PanelTab = "explore" | "plan";

export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  visibleRoutes,
  hidePrimarySearchOnMobile = false,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("explore");

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
    <div className="flex h-full min-h-0 flex-col bg-background batogo-panel">
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-border/70 bg-background/92 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <div
            role="tablist"
            aria-label="Mode de recherche"
            className="batogo-tabbar grid grid-cols-2 gap-1 rounded-xl p-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "explore"}
              onClick={() => setActiveTab("explore")}
              className="batogo-tab flex items-center justify-center gap-2 px-3 text-xs font-semibold" data-active={activeTab === "explore"}
            >
              <MapPinned aria-hidden className="size-4" />
              <span>Explorer la carte</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "plan"}
              onClick={() => setActiveTab("plan")}
              className="batogo-tab flex items-center justify-center gap-2 px-3 text-xs font-semibold" data-active={activeTab === "plan"}
            >
              <CalendarDays aria-hidden className="size-4" />
              <span>Planifier mon voyage</span>
            </button>
          </div>
        </div>

        {activeTab === "explore" ? (
          <>
            <ExplorerView
              filters={filters}
              onFiltersChange={onFiltersChange}
              visibleRoutes={visibleRoutes}
              onSelect={onSelect}
              selection={selection}
              hidePrimarySearchOnMobile={hidePrimarySearchOnMobile}
            />
          </>
        ) : (
          <TripPlanner
            selection={selection}
            onSelect={onSelect}
          />
        )}

        {selection ? (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between gap-2 border-y border-border/60 bg-background/70 px-5 py-2">
              <span className="sr-only">Détail sélectionné</span>
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

            <div className="h-3 bg-muted/70" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
