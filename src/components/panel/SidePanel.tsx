import { useState } from "react";
import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { CalendarDays, MapPinned, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

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
  hasMobileBar?: boolean;
  onRequestExpand?: () => void;
}

type PanelTab = "explore" | "plan";

export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  visibleRoutes,
  hasMobileBar = false,
  onRequestExpand,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("explore");
  const isMobile = useIsMobile();

  const switchTab = (tab: PanelTab) => {
    setActiveTab(tab);
    if (tab === "plan" && typeof window !== "undefined" && isMobile)
      onRequestExpand?.();
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
    <div className="batogo-floating-panel pointer-events-auto flex h-full w-full flex-col overflow-hidden shadow-2xl md:w-[420px] md:rounded-2xl">
      <div className="flex-none p-3 pb-0">
        <div className="batogo-tabbar grid grid-cols-2 p-1">
          <button
            onClick={() => switchTab("explore")}
            className="batogo-tab flex items-center justify-center gap-2 whitespace-nowrap px-2.5 text-xs font-semibold"
            data-active={activeTab === "explore"}
          >
            <MapPinned className="size-4" />
            Explorer la carte
          </button>
          <button
            onClick={() => switchTab("plan")}
            className="batogo-tab flex items-center justify-center gap-2 px-3 text-xs font-semibold"
            data-active={activeTab === "plan"}
          >
            <CalendarDays className="size-4" />
            Planifier mon voyage
          </button>
        </div>
      </div>

      <div className="batogo-panel-scroll relative flex-1 overflow-y-auto">
        {selection ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-background/98 backdrop-blur-md">
            <div className="flex flex-none items-center justify-between border-b p-2">
              <span className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Détail sélectionné
              </span>
              <div className="flex items-center gap-1">
                <button onClick={shareSelection} className="flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
                  <Share2 className="size-3.5" /> Partager
                </button>
                <button onClick={() => onSelect(null)} className="flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
                  Fermer <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="batogo-panel-scroll flex-1 overflow-y-auto p-4 md:p-6">
              {selection.type === "port" ? <PortView portId={selection.id} onSelect={onSelect} /> :
               selection.type === "route" ? <RouteView routeId={selection.id} onSelect={onSelect} /> :
               selection.type === "company" ? <CompanyView companyId={selection.id} /> :
               selection.type === "vessel" ? <VesselView vesselId={selection.id} /> :
               <DepartureView departureId={selection.id} onSelect={onSelect} />}
            </div>
          </div>
        ) : null}

        {activeTab === "explore" ? (
          <ExplorerView 
            filters={filters} 
            onFiltersChange={onFiltersChange} 
            hidePrimarySearchOnMobile={hasMobileBar} 
          />
        ) : (
          <TripPlanner />
        )}
      </div>
    </div>
  );
}
