import { Link } from "@tanstack/react-router";
import { Route as RouteIcon, Clock, Map as MapIcon, Ship } from "lucide-react";
import { MeTab } from "@/components/community/MeTab";
import { useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { useT } from "@/lib/i18n";

const itemClass =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";
/** Le bouton central, plus large et en relief : son rond déborde au-dessus de la barre. */
const centerClass =
  "flex h-full min-w-0 flex-[1.35] flex-col items-center justify-end gap-0.5 whitespace-nowrap pb-1.5 text-[11.5px] font-semibold text-primary";
const centerIcon =
  "-mt-6 grid size-[52px] shrink-0 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg";

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
  /** Une traversée suivie : le bouton central ouvre « Mon voyage » (mode voyage de la carte). */
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
  // Traversée suivie : « Trouver » cède la place à « Mon voyage » ; la recherche passe par « Carte ».
  const { trip } = useVoyageTrip();
  const t = useT();
  return (
    <nav
      aria-label={t("menu.mobileNav")}
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
          <span>{t("nav.map")}</span>
        </button>
      ) : (
        <Link to="/" className={itemClass} activeOptions={{ exact: true }}>
          <MapIcon className="size-5" aria-hidden />
          <span>{t("nav.map")}</span>
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
          <span>{t("nav.departures")}</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("departures")} className={itemClass}>
          <Clock className="size-5" aria-hidden />
          <span>{t("nav.departures")}</span>
        </Link>
      )}
      {trip ? (
        onOpenVoyage ? (
          <button
            type="button"
            onClick={onOpenVoyage}
            data-active={activeTab === "voyage"}
            className={centerClass}
            aria-label={t("menu.myTripLabel")}
          >
            <span className={`bw-tab-voyage ${centerIcon}`}>
              <Ship className="size-6" aria-hidden />
            </span>
            <span>{t("nav.myTrip")}</span>
          </button>
        ) : (
          <Link
            to="/"
            search={{ voyage: 1 } as never}
            className={centerClass}
            aria-label={t("menu.myTripLabel")}
          >
            <span className={`bw-tab-voyage ${centerIcon}`}>
              <Ship className="size-6" aria-hidden />
            </span>
            <span>{t("nav.myTrip")}</span>
          </Link>
        )
      ) : onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-active={activeTab === "search"}
          className={centerClass}
          aria-label={t("menu.findLabel")}
        >
          <span className={centerIcon}>
            <Ship className="size-6" aria-hidden />
          </span>
          <span>{t("nav.find")}</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={() => rememberAction("search")}
          className={centerClass}
          aria-label={t("menu.findLabel")}
        >
          <span className={centerIcon}>
            <Ship className="size-6" aria-hidden />
          </span>
          <span>{t("nav.find")}</span>
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
          <span>{t("nav.route")}</span>
        </button>
      ) : (
        <Link to="/" onClick={() => rememberAction("itinerary")} className={itemClass}>
          <RouteIcon className="size-5" aria-hidden />
          <span>{t("nav.route")}</span>
        </Link>
      )}
      {/* « Moi » : mon cabas et mon humeur. « Signaler » est le bouton jaune flottant de la carte. */}
      <MeTab className={itemClass} />
    </nav>
  );
}
