import { forwardRef, useSyncExternalStore, type MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import {
  Anchor,
  BookOpen,
  Building2,
  Calculator,
  Car,
  CircleHelp,
  Clock,
  FileCheck,
  FileText,
  Info,
  Compass,
  Landmark,
  ListChecks,
  Mail,
  Map as MapIcon,
  Newspaper,
  Route as RouteIcon,
  ScrollText,
  Ship,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useT, type MessageKey } from "@/lib/i18n";
import { usePrepareStatus } from "@/lib/ferry/usePrepareUnfinished";
import { openRoutesDuBled } from "@/lib/routesDuBled/lien";

/**
 * Le menu du site, partagé par l'en-tête de l'ordinateur, le volet ☰ et la barre du bas du
 * téléphone : mêmes familles, mêmes rubriques, mêmes mots partout.
 * Ordre du voyage : préparer, réserver (bouton à part), suivre ; puis lignes et ports.
 */

export type MenuItem = {
  to: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Ouvre un volet de la carte d'accueil au lieu d'une page. */
  action?: "itinerary";
  /** La première chose à faire de la famille : mise en avant. */
  featured?: boolean;
};
export type MenuFamily = {
  id: "prepare" | "live" | "lines" | "bledway";
  titleKey: MessageKey;
  /** L'entrée principale, au-dessus des colonnes : le compagnon pas à pas. */
  lead?: MenuItem & { hintKey: MessageKey };
  columns: { titleKey?: MessageKey; items: MenuItem[] }[];
  /** Liens transversaux, sur une ligne sous les colonnes. */
  footer?: MenuItem[];
  /** Absente du menu de l'ordinateur (reste en pied de page et dans le volet). */
  sheetOnly?: boolean;
};

/** Le point de « Préparer » : « ! » tant que la préparation n'est pas terminée, ✓ une fois prête. */
export function PrepareBadge({ className = "" }: { className?: string }) {
  const t = useT();
  const status = usePrepareStatus();
  if (!status) return null;
  if (status === "done")
    return (
      <span
        className={`bw-todo-dot bw-todo-dot--done ${className}`}
        role="img"
        aria-label={t("menu.prepareDone")}
        title={t("menu.prepareDone")}
      >
        ✓
      </span>
    );
  return (
    <span
      className={`bw-todo-dot bw-todo-dot--todo ${className}`}
      role="img"
      aria-label={t("menu.prepareUnfinished")}
      title={t("menu.prepareUnfinished")}
    >
      <ListChecks size={11} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

export const menuFamilies: MenuFamily[] = [
  {
    id: "prepare",
    titleKey: "menu.groupPrepareTrip",
    // Le compagnon fait tout dans l'ordre ; les colonnes restent pour aller droit à un sujet.
    lead: {
      to: "/preparer-mon-voyage",
      labelKey: "menu.companion",
      hintKey: "menu.companionHint",
      icon: ListChecks,
      featured: true,
    },
    // Par besoin : les papiers d'abord, puis la voiture, la route et le budget.
    columns: [
      {
        titleKey: "menu.colPapers",
        items: [
          { to: "/papiers-voyage-algerie", labelKey: "menu.papersList", icon: FileText },
          {
            to: "/guide/arrivee-algerie-port-formalites",
            labelKey: "menu.arrivalFormalities",
            icon: ShieldCheck,
          },
        ],
      },
      {
        titleKey: "menu.colCar",
        items: [
          {
            to: "/guide/voyage-algerie-voiture-checklist",
            labelKey: "menu.carPapers",
            icon: FileCheck,
          },
          {
            to: "/guide/voiture-vacances-admission-temporaire",
            labelKey: "menu.temporaryAdmission",
            icon: Car,
          },
          { to: "/vehicules-moins-3-ans", labelKey: "menu.importCar", icon: Landmark },
        ],
      },
      {
        titleKey: "menu.colRoute",
        items: [
          { to: "/routes-du-bled", labelKey: "menu.stepByStep", icon: RouteIcon },
          { to: "/covoiturage", labelKey: "menu.carpoolBeforePort", icon: Users },
          { to: "/voyage-algerie", labelKey: "menu.crossingGuide", icon: Ship },
        ],
      },
      {
        titleKey: "menu.colBudget",
        items: [
          { to: "/barometre-prix", labelKey: "menu.crossingPrices", icon: TrendingUp },
          { to: "/simulateurs", labelKey: "menu.budgetCalc", icon: Calculator },
          { to: "/mes-dinars", labelKey: "menu.myDinarsChange", icon: Wallet },
        ],
      },
    ],
    footer: [
      { to: "/guide", labelKey: "nav.allGuides", icon: BookOpen },
      { to: "/questions-frequentes", labelKey: "nav.faq", icon: CircleHelp },
    ],
  },
  {
    id: "live",
    titleKey: "menu.groupLive",
    columns: [
      {
        items: [
          { to: "/", labelKey: "menu.liveMap", icon: MapIcon },
          { to: "/horaires", labelKey: "nav.departuresArrivals", icon: Clock },
        ],
      },
    ],
  },
  {
    id: "lines",
    titleKey: "menu.groupLines",
    columns: [
      {
        items: [
          { to: "/lignes", labelKey: "nav.lines", icon: Waypoints },
          { to: "/ports", labelKey: "nav.ports", icon: Anchor },
          { to: "/compagnies", labelKey: "nav.companies", icon: Building2 },
          { to: "/bateaux", labelKey: "nav.vessels", icon: Ship },
        ],
      },
    ],
  },
  {
    id: "bledway",
    titleKey: "menu.groupBledway",
    sheetOnly: true,
    columns: [
      {
        items: [
          { to: "/decouvrir", labelKey: "nav.discover", icon: Compass },
          { to: "/a-propos", labelKey: "nav.about", icon: Info },
          { to: "/contact", labelKey: "nav.contact", icon: Mail },
          { to: "/methode-editoriale", labelKey: "nav.editorialMethod", icon: ScrollText },
        ],
      },
    ],
  },
];

/**
 * Les actualités : un lien direct au premier niveau (en-tête PC, menu ☰), pas rangé dans une
 * famille où on ne le trouvait pas.
 */
export const NEWS_LINK = { to: "/actualites", labelKey: "nav.news", icon: Newspaper } as const;

export const familyById = (id: MenuFamily["id"]) =>
  menuFamilies.find((family) => family.id === id)!;

/** Tous les liens d'une famille, colonnes puis ligne du bas. */
export const familyItems = (family: MenuFamily) => [
  ...(family.lead ? [family.lead] : []),
  ...family.columns.flatMap((column) => column.items),
  ...(family.footer ?? []),
];

/**
 * Ce que montre la page d'accueil : la carte en direct, la recherche (« Réserver ») ou le trajet
 * porte à porte (« Préparer »). Tout est sur « / » : sans cet état, l'en-tête allumait toujours
 * « Suivre en direct ».
 */
export type HomeView = "live" | "book" | "itinerary";
let homeView: HomeView = "live";
const homeViewListeners = new Set<() => void>();
export function setHomeView(view: HomeView) {
  if (view === homeView) return;
  homeView = view;
  homeViewListeners.forEach((listener) => listener());
}
export function useHomeView() {
  return useSyncExternalStore(
    (listener) => {
      homeViewListeners.add(listener);
      return () => homeViewListeners.delete(listener);
    },
    () => homeView,
    () => "live" as HomeView,
  );
}

/** La rubrique allumée : celle de la page, ou sur l'accueil celle de ce qu'il montre. */
export function familyIsActive(family: MenuFamily, pathname: string, view: HomeView = "live") {
  return familyItems(family).some((item) =>
    item.to === "/"
      ? pathname === "/" && (item.action === "itinerary" ? view === "itinerary" : !item.action && view === "live")
      : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

/** « Carte en direct » : la carte des navires, même quand l'accueil s'ouvre sur Réserver. */
export const OPEN_LIVE_EVENT = "bledway:open-live";
export function openLiveFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "live");
  if (window.location.pathname === "/") window.dispatchEvent(new Event(OPEN_LIVE_EVENT));
}

/** « Réserver » : la recherche de traversée de la carte d'accueil, d'où partent les liens de réservation. */
export function openSearchFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "search");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-search"));
}

/** L'ancien simulateur de l'accueil est retiré : la route se fait sur Routes du bled. */
export function openItineraryFromHeader() {
  openRoutesDuBled();
}

/** Un lien du menu : une page, ou un volet de la carte d'accueil (« étape par étape »).
 * Transmet les propriétés du menu (fermeture au clic, focus clavier) au lien lui-même. */
export const MenuItemLink = forwardRef<
  HTMLAnchorElement,
  {
    item: MenuItem;
    iconSize?: number;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    className?: string;
    /** Une ligne d'explication sous le libellé (l'entrée principale). */
    hint?: string;
  }
>(function MenuItemLink({ item, iconSize = 16, onClick, className, hint, ...rest }, ref) {
  const t = useT();
  const itinerary = item.action === "itinerary";
  // Rôle, tabIndex, data-* et focus passés par le menu (Slot de Radix) : repris tels quels.
  return (
    <Link
      ref={ref}
      {...rest}
      to={item.to}
      activeOptions={{ exact: item.to === "/" }}
      {...(itinerary ? { activeProps: { className: "" } } : {})}
      onClick={(event) => {
        onClick?.(event);
        if (itinerary) openItineraryFromHeader();
        else if (item.to === "/") openLiveFromHeader();
      }}
      className={`bw-menu-link${item.featured ? " bw-menu-link--featured" : ""}${className ? ` ${className}` : ""}`}
    >
      <item.icon size={iconSize} aria-hidden />
      {item.to === "/preparer-mon-voyage" ? <PrepareBadge /> : null}
      {hint ? (
        <span className="bw-menu-link__text">
          {t(item.labelKey)}
          <small>{hint}</small>
        </span>
      ) : (
        t(item.labelKey)
      )}
    </Link>
  );
});
