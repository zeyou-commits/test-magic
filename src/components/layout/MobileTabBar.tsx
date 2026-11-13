import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarCheck, ClipboardList, Map as MapIcon, MessagesSquare, Ship } from "lucide-react";
import { MeTab } from "@/components/community/MeTab";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
import { useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { useT } from "@/lib/i18n";
import {
  familyById,
  familyIsActive,
  MenuItemLink,
  openSearchFromHeader,
  type MenuFamily,
  type MenuItem,
} from "./menu";

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

  // Sur la carte d'accueil, les liens qui ouvrent un volet de la carte passent par ses commandes.
  const liveOverride = (item: MenuItem) => {
    if (item.to === "/" && onOpenMap) return onOpenMap;
    if (item.to === "/horaires" && onOpenDepartures) return onOpenDepartures;
    return undefined;
  };

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
          <Link to="/" search={{ voyage: 1 } as never} className={bookClass} aria-label={t("menu.myTripLabel")}>
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
        <Link to="/" onClick={openSearchFromHeader} className={bookClass} aria-label={t("menu.bookLabel")}>
          <span className={bookIcon}>
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <span>{t("menu.book")}</span>
        </Link>
      )}

      <FamilySheet
        family={live}
        label={t("menu.tabFollow")}
        icon={<MapIcon className="size-5" aria-hidden />}
        active={
          activeTab === "map" || activeTab === "departures" || (!onHome && familyIsActive(live, pathname))
        }
        override={liveOverride}
      />

      <button type="button" onClick={openSalons} className={itemClass}>
        <MessagesSquare className="size-5" aria-hidden />
        <span>{t("menu.tabSalons")}</span>
      </button>

      {/* « Moi » : mon cabas et mon humeur. « Signaler » est le bouton jaune flottant de la carte. */}
      <MeTab className={itemClass} />
    </nav>
  );
}

/** Un onglet qui ouvre, en volet, le même contenu que le menu de l'ordinateur. */
function FamilySheet({
  family,
  label,
  icon,
  active,
  override,
}: {
  family: MenuFamily;
  label: string;
  icon: ReactNode;
  active: boolean;
  override: (item: MenuItem) => (() => void) | undefined;
}) {
  const t = useT();
  const link = (item: MenuItem) => {
    const run = override(item);
    return (
      <SheetClose asChild key={`${item.to}-${item.labelKey}`}>
        {run ? (
          <button
            type="button"
            onClick={run}
            className={`bw-menu-link${item.featured ? " bw-menu-link--featured" : ""}`}
          >
            <item.icon size={17} aria-hidden />
            {t(item.labelKey)}
          </button>
        ) : (
          <MenuItemLink item={item} iconSize={17} />
        )}
      </SheetClose>
    );
  };
  return (
    <Sheet>
      <SheetTrigger className={itemClass} data-active={active}>
        {icon}
        <span>{label}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="bw-menu-sheet bw-family-sheet">
        <SheetTitle className="bw-menu-sheet__title">{t(family.titleKey)}</SheetTitle>
        <SheetDescription className="sr-only">{t(family.titleKey)}</SheetDescription>
        <div className="bw-family-sheet__columns">
          {family.columns.map((column, index) => (
            <section key={column.titleKey ?? index} aria-label={t(column.titleKey ?? family.titleKey)}>
              {column.titleKey ? <p className="bw-menu-group-title">{t(column.titleKey)}</p> : null}
              {column.items.map(link)}
            </section>
          ))}
        </div>
        {family.footer ? <div className="bw-family-sheet__footer">{family.footer.map(link)}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
