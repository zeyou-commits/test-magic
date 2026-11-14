import { forwardRef, type MouseEventHandler } from "react";
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
import { goHome } from "@/lib/ferry/voyageTrip";
import { useT, type MessageKey } from "@/lib/i18n";
import { usePrepareUnfinished } from "@/lib/ferry/usePrepareUnfinished";

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

/** Le point « ! » de « Préparer » tant que la préparation n'est pas terminée. */
export function PrepareBadge({ className = "" }: { className?: string }) {
  const t = useT();
  const unfinished = usePrepareUnfinished();
  if (!unfinished) return null;
  return (
    <span
      className={`bw-prep-badge ${className}`}
      role="img"
      aria-label={t("menu.prepareUnfinished")}
      title={t("menu.prepareUnfinished")}
    >
      !
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
          { to: "/", labelKey: "menu.stepByStep", icon: RouteIcon, action: "itinerary" },
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
          { to: "/actualites", labelKey: "nav.news", icon: Newspaper },
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
          { to: "/a-propos", labelKey: "nav.about", icon: Info },
          { to: "/contact", labelKey: "nav.contact", icon: Mail },
          { to: "/methode-editoriale", labelKey: "nav.editorialMethod", icon: ScrollText },
        ],
      },
    ],
  },
];

export const familyById = (id: MenuFamily["id"]) =>
  menuFamilies.find((family) => family.id === id)!;

/** Tous les liens d'une famille, colonnes puis ligne du bas. */
export const familyItems = (family: MenuFamily) => [
  ...(family.lead ? [family.lead] : []),
  ...family.columns.flatMap((column) => column.items),
  ...(family.footer ?? []),
];

/** La rubrique allumée : « Suivre en direct » sur la carte d'accueil. */
export function familyIsActive(family: MenuFamily, pathname: string) {
  return familyItems(family).some((item) =>
    item.to === "/"
      ? pathname === "/" && !item.action
      : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

/** « Réserver » : la recherche de traversée de la carte d'accueil, d'où partent les liens de réservation. */
export function openSearchFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "search");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-search"));
}

export function openItineraryFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-itinerary"));
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
        else if (item.to === "/") goHome();
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
