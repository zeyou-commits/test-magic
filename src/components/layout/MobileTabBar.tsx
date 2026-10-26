import { Link } from "@tanstack/react-router";
import { Route as RouteIcon, Clock, Map as MapIcon, Megaphone, Search } from "lucide-react";
import { QUICK_REPORT_EVENT, QUICK_REPORT_ON_LOAD } from "@/components/map/QuickReport";

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";

interface MobileTabBarProps {
  className?: string;
  activeTab?: "map" | "departures" | "search" | "ports" | "itinerary";
  onOpenMap?: () => void;
  /** Conservé pour compatibilité : l'onglet « Plus » a été remplacé par « Signaler ». */
  onMoreToggle?: () => void;
  onOpenDepartures?: () => void;
  onOpenSearch?: () => void;
  onShowPorts?: () => void;
  onOpenItinerary?: () => void;
}

const rememberAction = (action: "departures" | "search" | "ports" | "itinerary") =>
  window.sessionStorage.setItem("bledway:open-home-action", action);

export function MobileTabBar({
  className = "",
  activeTab,
  onOpenMap,
  onOpenDepartures,
  onOpenSearch,
  onShowPorts,
  onOpenItinerary,
}: MobileTabBarProps) {
  return (
    <nav
      aria-label="Navigation mobile"
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur ${className}`}
    >
      {onOpenMap ? (
        <button
          type="button"
          onClick={onOpenMap}
          data-active={activeTab === "map"}
          aria-current={activeTab === "map" ? "page" : undefined}
          className={itemClass}
        >
          <MapIcon className="size-5" aria-hidden />
          <span>Carte</span>
        </button>
      ) : (
        <Link to="/" className={itemClass} activeOptions={{ exact: true }}>
          <MapIcon className="size-5" aria-hidden />
          <span>Carte</span>
        </Link>
      )}
      {onOpenDepartures ? (
        <button
          type="button"
          onClick={onOpenDepartures}
          data-active={activeTab === "departures"}
          className={itemClass}
        >
          <Clock className="size-5" aria-hidden />
          <span>Départs</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("departures")} className={itemClass}>
          <Clock className="size-5" aria-hidden />
          <span>Départs</span>
        </Link>
      )}
      {onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-active={activeTab === "search"}
          className={`${itemClass} text-primary`}
          aria-label="Chercher une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Search className="size-5" aria-hidden />
          </span>
          <span>Chercher</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={() => rememberAction("search")}
          className={`${itemClass} text-primary`}
          aria-label="Chercher une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Search className="size-5" aria-hidden />
          </span>
          <span>Chercher</span>
        </Link>
      )}
      {onOpenItinerary ? (
        <button
          type="button"
          onClick={onOpenItinerary}
          data-active={activeTab === "itinerary"}
          className={itemClass}
        >
          <RouteIcon className="size-5" aria-hidden />
          <span>Itinéraire</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("itinerary")} className={itemClass}>
          <RouteIcon className="size-5" aria-hidden />
          <span>Itinéraire</span>
        </Link>
      )}
      {/* « Signaler » remplace « Plus » : ces pages sont déjà dans le menu de l'en-tête. */}
      {onOpenMap ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(QUICK_REPORT_EVENT))}
          className={itemClass}
        >
          <span className="grid size-6 place-items-center rounded-lg bg-[#ffc83d] text-[#4a3200]">
            <Megaphone className="size-4" aria-hidden />
          </span>
          <span>Signaler</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={() => window.sessionStorage.setItem(QUICK_REPORT_ON_LOAD, "1")}
          className={itemClass}
        >
          <span className="grid size-6 place-items-center rounded-lg bg-[#ffc83d] text-[#4a3200]">
            <Megaphone className="size-4" aria-hidden />
          </span>
          <span>Signaler</span>
        </Link>
      )}
    </nav>
  );
}
