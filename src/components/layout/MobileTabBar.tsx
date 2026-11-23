import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  ClipboardList,
  Map as MapIcon,
  Menu,
  MessagesSquare,
  Ship,
} from "lucide-react";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
import { useFleet } from "@/lib/ferry/useFleet";
import { useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { useT } from "@/lib/i18n";
import { MainMenuSheet } from "./MainMenu";
import {
  familyById,
  familyIsActive,
  openLiveFromHeader,
  openSearchFromHeader,
  PrepareBadge,
} from "./menu";

/**
 * Un seul onglet en avant : celui où l'on est (vert + trait au-dessus de l'icône). Les autres,
 * « Réserver » et « Mon voyage » compris, restent neutres. Seul `data-active` compte : un lien
 * vers « / » serait sinon « actif » pour plusieurs onglets à la fois.
 */
const itemClass =
  "relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground before:absolute before:left-1/2 before:top-0 before:h-[3px] before:w-9 before:-translate-x-1/2 before:rounded-b-full before:bg-primary before:opacity-0 before:content-[''] data-[active=true]:font-bold data-[active=true]:text-primary data-[active=true]:before:opacity-100";
/** « Réserver » / « Mon voyage » : même style que les autres onglets. */
const bookClass = itemClass;
const bookIcon = "grid place-items-center";

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
  /** Une traversée suivie : « Réserver » cède la place à « Mon voyage » (mode voyage de la carte). */
  onOpenVoyage?: () => void;
}

/** Sur l'icône « Direct » : combien de navires sont en mer maintenant (rien s'il n'y en a aucun). */
function SeaCountBadge() {
  const count = useFleet().filter((ship) => ship.state === "sea" && !ship.ashore).length;
  if (!count) return null;
  const label = `${count} navire${count > 1 ? "s" : ""} en mer en ce moment`;
  return (
    <span className="bw-sea-count" role="img" aria-label={label} title={label}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

const rememberAction = (action: "departures" | "search" | "ports" | "itinerary" | "salons") =>
  window.sessionStorage.setItem("bledway:open-home-action", action);

/**
 * La barre du bas reprend l'en-tête de l'ordinateur, dans le même ordre :
 * Préparer · Réserver · Suivre, puis les salons et « Moi ». « Préparer » ouvre directement le
 * compagnon pas à pas (les sujets un par un restent dans ses étapes et dans le menu ☰) ;
 * « Suivre » ouvre le même contenu que son menu sur ordinateur.
 */
export function MobileTabBar({
  className = "",
  activeTab,
  onOpenMap,
  onOpenDepartures,
  onOpenSearch,
  onOpenVoyage,
}: MobileTabBarProps) {
  const { trip } = useVoyageTrip();
  const t = useT();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onHome = pathname === "/";
  const prepare = familyById("prepare");
  const live = familyById("live");

  const openSalons = () => {
    if (onHome) window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT));
    else {
      rememberAction("salons");
      void navigate({ to: "/" });
    }
  };

  return (
    <nav
      data-tour="nav"
      aria-label={t("menu.mobileNav")}
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur ${className}`}
    >
      <Link
        to="/preparer-mon-voyage"
        className={itemClass}
        data-tour="prepare"
        data-active={familyIsActive(prepare, pathname) || activeTab === "itinerary"}
      >
        <span className="relative">
          <ClipboardList className="size-5" aria-hidden />
          <PrepareBadge className="bw-todo-dot--corner" />
        </span>
        <span>{t("menu.tabPrepare")}</span>
      </Link>

      {trip ? (
        onOpenVoyage ? (
          <button
            type="button"
            onClick={onOpenVoyage}
            data-active={activeTab === "voyage"}
            className={bookClass}
            aria-label={t("menu.myTripLabel")}
          >
            <span className={`bw-tab-voyage ${bookIcon}`}>
              <Ship className="size-5" aria-hidden />
            </span>
            <span>{t("nav.myTrip")}</span>
          </button>
        ) : (
          <Link
            to="/"
            search={{ voyage: 1 } as never}
            className={bookClass}
            aria-label={t("menu.myTripLabel")}
          >
            <span className={`bw-tab-voyage ${bookIcon}`}>
              <Ship className="size-5" aria-hidden />
            </span>
            <span>{t("nav.myTrip")}</span>
          </Link>
        )
      ) : onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          data-active={activeTab === "search" || activeTab === "departures"}
          className={bookClass}
          data-tour="book"
          aria-label={t("menu.bookLabel")}
        >
          <span className={bookIcon}>
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <span>{t("menu.book")}</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={openSearchFromHeader}
          className={bookClass}
          data-tour="book"
          aria-label={t("menu.bookLabel")}
        >
          <span className={bookIcon}>
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <span>{t("menu.book")}</span>
        </Link>
      )}

      {/* « Suivre » : la carte en direct, sans sous-menu (départs et actualités y sont). */}
      {onOpenMap ? (
        <button
          type="button"
          onClick={onOpenMap}
          data-active={activeTab === "map"}
          className={itemClass}
        >
          <span className="relative">
            <MapIcon className="size-5" aria-hidden />
            <SeaCountBadge />
          </span>
          <span>{t("menu.tabFollow")}</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={openLiveFromHeader}
          className={itemClass}
          data-active={familyIsActive(live, pathname)}
        >
          <span className="relative">
            <MapIcon className="size-5" aria-hidden />
            <SeaCountBadge />
          </span>
          <span>{t("menu.tabFollow")}</span>
        </Link>
      )}

      <button type="button" onClick={openSalons} className={itemClass} data-tour="salons">
        <MessagesSquare className="size-5" aria-hidden />
        <span>{t("menu.tabSalons")}</span>
      </button>

      {/* « Menu » : tout le site. Le compte (« Moi ») est en haut à droite. */}
      <MainMenuSheet triggerClassName={itemClass} label={t("menu.open")}>
        <Menu className="size-5" aria-hidden />
        <span>{t("menu.tabMenu")}</span>
      </MainMenuSheet>
    </nav>
  );
}
