import { useState } from "react";
import type { Departure, Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ArrowLeft, CalendarDays, MapPinned, Share2 } from "lucide-react";
import { toast } from "sonner";

import { ExplorerView } from "./ExplorerView";
import { TripPlanner } from "./TripPlanner";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";

export type PanelTab = "explore" | "plan";

interface SidePanelProps {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /** Lignes et départs correspondant aux filtres (calculés une seule fois dans la page). */
  matchingRoutes: RouteLine[];
  matchingDepartures: Departure[];
  hidePrimarySearchOnMobile?: boolean;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}

export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  matchingRoutes,
  matchingDepartures,
  hidePrimarySearchOnMobile = false,
  activeTab,
  onTabChange,
}: SidePanelProps) {
  const [prefill, setPrefill] = useState<{ fromId: string; toId: string; key: number } | null>(
    null,
  );

  const planRoute = (route: RouteLine) => {
    setPrefill({ fromId: route.departure_port_id, toId: route.arrival_port_id, key: Date.now() });
    onSelect(null);
    onTabChange("plan");
  };

  const shareSelection = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Batogo — traversées en ferry", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      // L'utilisateur peut fermer la fenêtre de partage.
    }
  };

  return (
    <div className="batogo-floating-panel pointer-events-auto flex h-full w-full flex-col overflow-hidden md:rounded-2xl">
      <div className="flex-none p-3 pb-0">
        <div
          className="batogo-tabbar grid grid-cols-2 p-1"
          role="tablist"
          aria-label="Mode du volet"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "explore"}
            onClick={() => {
              onSelect(null);
              onTabChange("explore");
            }}
            className="batogo-tab flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2"
            data-active={activeTab === "explore" && !selection}
          >
            <MapPinned className="size-4" />
            Explorer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "plan"}
            onClick={() => {
              onSelect(null);
              onTabChange("plan");
            }}
            className="batogo-tab flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2"
            data-active={activeTab === "plan" && !selection}
          >
            <CalendarDays className="size-4" />
            Planifier mon voyage
          </button>
        </div>
      </div>

      <div className="batogo-panel-scroll relative flex-1 overflow-y-auto">
        {selection ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-background">
            <div className="flex flex-none items-center justify-between border-b p-2">
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
              >
                <ArrowLeft className="size-4" />{" "}
                {activeTab === "plan" ? "Retour au planificateur" : "Retour à la recherche"}
              </button>
              <button
                type="button"
                onClick={shareSelection}
                className="flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Share2 className="size-4" /> Partager
              </button>
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

        {activeTab === "explore" ? (
          <ExplorerView
            filters={filters}
            onFiltersChange={onFiltersChange}
            matchingRoutes={matchingRoutes}
            matchingDepartures={matchingDepartures}
            onSelect={onSelect}
            hidePrimarySearchOnMobile={hidePrimarySearchOnMobile}
          />
        ) : (
          <TripPlanner selection={selection} onSelect={onSelect} prefill={prefill} />
        )}
      </div>
    </div>
  );
}
