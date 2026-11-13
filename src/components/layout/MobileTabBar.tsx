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
import { goHome, useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { useT } from "@/lib/i18n";
import { MainMenuSheet } from "./MainMenu";
import { familyById, familyIsActive, openSearchFromHeader } from "./menu";

const itemClass =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary [&.active]:text-primary";
/** « Réserver » : le bouton plein, à la même place que sur l'ordinateur (après « Préparer »). */
const bookClass =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[11px] font-bold text-primary";
const bookIcon =
  "grid h-8 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm";

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
      aria-label={t("menu.mobileNav")}
      className={`pointer-events-auto flex h-[60px] w-full items-center justify-around border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur ${className}`}
    >
      <Link
        to="/preparer-mon-voyage"
        className={itemClass}
        data-active={familyIsActive(prepare, pathname) || activeTab === "itinerary"}
      >
        <ClipboardList className="size-5" aria-hidden />
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
          data-active={activeTab === "search"}
          className={bookClass}
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
          data-active={activeTab === "map" || activeTab === "departures"}
          className={itemClass}
        >
          <MapIcon className="size-5" aria-hidden />
          <span>{t("menu.tabFollow")}</span>
        </button>
      ) : (
        <Link
          to="/"
          onClick={goHome}
          className={itemClass}
          data-active={familyIsActive(live, pathname)}
        >
          <MapIcon className="size-5" aria-hidden />
          <span>{t("menu.tabFollow")}</span>
        </Link>
      )}

      <button type="button" onClick={openSalons} className={itemClass}>
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
