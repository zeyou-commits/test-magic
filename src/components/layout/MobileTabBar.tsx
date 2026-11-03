import { Link } from "@tanstack/react-router";
import { Route as RouteIcon, Clock, Map as MapIcon, Ship } from "lucide-react";
import { MeTab } from "@/components/community/MeTab";
import { useVoyageTrip } from "@/lib/ferry/voyageTrip";

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";

interface MobileTabBarProps {
  className?: string;
  activeTab?: "map" | "departures" | "search" | "ports" | "itinerary" | "voyage";
  onOpenMap?: () => void;
  /** Conservé pour compatibilité : l'onglet « Plus » a été remplacé par « Moi ». */
  onMoreToggle?: () => void;
  onOpenDepartures?: () => void;
  onOpenSearch?: () => void;
  onShowPorts?: () => void;
  onOpenItinerary?: () => void;
  /** Une traversée suivie : le bouton central ouvre « Ma traversée » (mode voyage de la carte). */
  onOpenVoyage?: () => void;
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
  onOpenVoyage,
}: MobileTabBarProps) {
  // Traversée suivie : « Trouver » cède la place à « Ma traversée » ; la recherche passe par « Carte ».
  const { trip } = useVoyageTrip();
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
      {trip ? (
        onOpenVoyage ? (
          <button
            type="button"
            onClick={onOpenVoyage}
            data-active={activeTab === "voyage"}
            className={`${itemClass} text-primary`}
            aria-label="Ma traversée, étape par étape"
          >
            <span className="bw-tab-voyage grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Ship className="size-5" aria-hidden />
            </span>
            <span>Ma traversée</span>
          </button>
        ) : (
          <Link
            to="/"
            search={{ voyage: 1 } as never}
            className={`${itemClass} text-primary`}
            aria-label="Ma traversée, étape par étape"
          >
            <span className="bw-tab-voyage grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Ship className="size-5" aria-hidden />
            </span>
            <span>Ma traversée</span>
          </Link>
        )
      ) : onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-active={activeTab === "search"}
          className={`${itemClass} text-primary`}
          aria-label="Trouver une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Ship className="size-5" aria-hidden />
          </span>
          <span>Trouver</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={() => rememberAction("search")}
          className={`${itemClass} text-primary`}
          aria-label="Trouver une traversée"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Ship className="size-5" aria-hidden />
          </span>
          <span>Trouver</span>
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
          <span>Route</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("itinerary")} className={itemClass}>
          <RouteIcon className="size-5" aria-hidden />
          <span>Route</span>
        </Link>
      )}
      {/* « Moi » : mon cabas et mon humeur. « Signaler » est le bouton jaune flottant de la carte. */}
      <MeTab className={itemClass} />
    </nav>
  );
}
