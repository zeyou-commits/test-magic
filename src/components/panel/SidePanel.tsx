import { useQuery } from "@tanstack/react-query";
import { vesselsQuery } from "@/lib/ferry/queries";
import { FollowButton } from "./FollowButton";
import { useEffect, useRef } from "react";
import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ArrowLeft } from "lucide-react";

import { ShareButtons } from "./ShareButtons";
import { SearchPanel } from "./SearchPanel";
import { ItineraryPlanner } from "@/components/itinerary/ItineraryPlanner";
import type { MapPreview } from "@/lib/ferry/mapPresentation";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";
import { PortView } from "./PortView";
import { RouteView } from "./RouteView";
import { CompanyView, DepartureView, VesselView } from "./EntityViews";

interface SidePanelProps {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onBack?: () => void;
  backLabel?: string;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  hidePickersOnMobile?: boolean;
  onHighlightRoute?: (routeId: string | null) => void;
  onFocusRoute?: (routeId: string | null) => void;
  homeMode?: boolean;
  onTrafficPreview?: (preview: MapPreview | null) => void;
  onOpenSearch?: () => void;
  itineraryOpen?: boolean;
  onOpenItinerary?: () => void;
  onCloseItinerary?: () => void;
  onItineraryPreview?: (preview: ItineraryMapPreview | null) => void;
  onItineraryResultsReady?: () => void;
}

/** Un seul volet : la recherche en permanence, et le détail d'un port, d'une ligne ou d'un départ par-dessus. */
export function SidePanel({
  selection,
  onSelect,
  onBack,
  backLabel,
  filters,
  onFiltersChange,
  hidePickersOnMobile = false,
  onHighlightRoute,
  onFocusRoute,
  homeMode = false,
  onTrafficPreview,
  onOpenSearch,
  itineraryOpen = false,
  onOpenItinerary,
  onCloseItinerary,
  onItineraryPreview,
  onItineraryResultsReady,
}: SidePanelProps) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const followedVessel =
    selection?.type === "vessel" ? vessels.find((v) => v.id === selection.id) : null;
  const detailRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectionKey = selection ? `${selection.type}:${selection.id}` : null;
  useEffect(() => {
    if (selectionKey) {
      if (!returnFocusRef.current && document.activeElement instanceof HTMLElement)
        returnFocusRef.current = document.activeElement;
      detailRef.current?.focus({ preventScroll: true });
    } else {
      returnFocusRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [selectionKey]);
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
      <div
        inert={selection ? true : undefined}
        className="batogo-panel-scroll relative flex-1 overflow-y-auto"
      >
        <div hidden={!itineraryOpen} inert={!itineraryOpen ? true : undefined}>
          {onCloseItinerary && onItineraryPreview ? (
            <ItineraryPlanner
              active={itineraryOpen && !selection}
              onClose={onCloseItinerary}
              onPreview={onItineraryPreview}
              {...(onItineraryResultsReady ? { onResultsReady: onItineraryResultsReady } : {})}
            />
          ) : null}
        </div>
        <div hidden={itineraryOpen} inert={itineraryOpen ? true : undefined}>
          <SearchPanel
            homeMode={homeMode}
            {...(onTrafficPreview ? { onTrafficPreview } : {})}
            {...(onOpenSearch ? { onOpenSearch } : {})}
            filters={filters}
            onFiltersChange={onFiltersChange}
            selection={selection}
            onSelect={onSelect}
            hidePickersOnMobile={hidePickersOnMobile}
            {...(onHighlightRoute ? { onHighlightRoute } : {})}
            {...(onFocusRoute ? { onFocusRoute } : {})}
            {...(onOpenItinerary ? { onOpenItinerary } : {})}
          />
        </div>
      </div>

      {selection ? (
        <div
          ref={detailRef}
          tabIndex={-1}
          aria-label="Détails de la sélection"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              if (onBack) onBack();
              else onSelect(null);
            }
          }}
          className="panel-detail absolute inset-0 z-10 flex flex-col bg-background"
        >
          <div className="flex flex-none items-center justify-between border-b border-border/20 px-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  onSelect(null);
                }
              }}
              className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="size-3.5" /> {backLabel ?? "Accueil"}
            </button>
            <div className="flex items-center gap-1.5">
              {followedVessel ? (
                <FollowButton
                  kind="vessel"
                  targetId={followedVessel.id}
                  label={followedVessel.name}
                  demo={followedVessel.is_demo}
                  compact
                  iconOnly
                />
              ) : null}
              <ShareButtons compact />
            </div>
          </div>
          <div className="batogo-panel-scroll flex-1 overflow-y-auto p-4 md:p-6">
            {selection.type === "port" ? (
              <PortView key={selection.id} portId={selection.id} onSelect={onSelect} />
            ) : selection.type === "route" ? (
              <RouteView routeId={selection.id} onSelect={onSelect} onPlanRoute={planRoute} />
            ) : selection.type === "company" ? (
              <CompanyView companyId={selection.id} onSelect={onSelect} />
            ) : selection.type === "vessel" ? (
              <VesselView key={selection.id} vesselId={selection.id} onSelect={onSelect} />
            ) : (
              <DepartureView key={selection.id} departureId={selection.id} onSelect={onSelect} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
