import { useState } from "react";
import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { CalendarDays, MapPinned, Share2 } from "lucide-react";
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

        <div className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <div
            role="tablist"
            aria-label="Mode de recherche"
            className="grid grid-cols-2 gap-1 rounded-2xl border border-border/80 bg-card p-1.5 shadow-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "explore"}
              onClick={() => setActiveTab("explore")}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all ${activeTab === "explore" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <MapPinned aria-hidden className="size-4" />
              <span>Explorer la carte</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "plan"}
              onClick={() => setActiveTab("plan")}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all ${activeTab === "plan" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <CalendarDays aria-hidden className="size-4" />
              <span>Planifier mon voyage</span>
            </button>
          </div>
        </div>

        {activeTab === "explore" ? (
          <>
            <MapRouteFilter
              filters={filters}
              onFiltersChange={onFiltersChange}
            />

            <ExplorerView
              filters={filters}
              onFiltersChange={onFiltersChange}
              visibleRoutes={visibleRoutes}
              onSelect={onSelect}
              hidePrimarySearchOnMobile={hidePrimarySearchOnMobile}
            />
          </>
        ) : (
          <TripPlanner
            selection={selection}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}
