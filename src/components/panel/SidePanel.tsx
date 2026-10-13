import type { Filters, RouteLine, Selection } from "@/lib/ferry/types";
import { ArrowLeft, Share2 } from "lucide-react";
import { toast } from "sonner";

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
}

/** Un seul volet : la recherche en permanence, et le détail d'un port, d'une ligne ou d'un départ par-dessus. */
export function SidePanel({
  selection,
  onSelect,
  filters,
  onFiltersChange,
  hidePickersOnMobile = false,
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
    <div className="batogo-floating-panel pointer-events-auto relative flex h-full w-full flex-col overflow-hidden md:rounded-3xl">
      <div className="batogo-panel-scroll relative flex-1 overflow-y-auto">
        <SearchPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          selection={selection}
          onSelect={onSelect}
          hidePickersOnMobile={hidePickersOnMobile}
        />
      </div>

      {selection ? (
        <div className="panel-detail absolute inset-0 z-10 flex flex-col bg-background">
          <div className="flex flex-none items-center justify-between border-b p-2">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="size-4" /> Retour à la recherche
            </button>
            <button
              type="button"
              onClick={shareSelection}
              className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
    </div>
  );
}
