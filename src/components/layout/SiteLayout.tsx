import { AlertTicker } from "./AlertTicker";
import {
  forwardRef,
  useEffect,
  useRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";
import { QuestionButton } from "./QuestionButton";
import { DataUnavailableNotice } from "./DataUnavailableNotice";
import { goHome, openVoyage, useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { refocusTriggerWithoutScroll } from "@/lib/ui/menuFocus";
import { LanguageSwitcher, useT, type MessageKey } from "@/lib/i18n";
import {
  Anchor,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarCheck,
  Calculator,
  Car,
  ChevronDown,
  CircleHelp,
  House,
  Clock,
  Info,
  Mail,
  Map as MapIcon,
  MapPin,
  Menu,
  Newspaper,
  Route as RouteIcon,
  ScrollText,
  Ship,
  TrendingUp,
  Users,
  Wallet,
  Waypoints,
  type LucideIcon,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { tr } from "@/lib/i18n";

export const navLinks = [
  { to: "/", labelKey: "nav.map" },
  { to: "/horaires", labelKey: "nav.departuresArrivals" },
  { to: "/actualites", labelKey: "nav.news" },
  { to: "/ports", labelKey: "nav.ports" },
  { to: "/lignes", labelKey: "nav.lines" },
  { to: "/compagnies", labelKey: "nav.companies" },
  { to: "/guide", labelKey: "nav.guide" },
  { to: "/bateaux", labelKey: "nav.vessels" },
  { to: "/simulateurs", labelKey: "nav.simulators" },
  { to: "/barometre-prix", labelKey: "nav.priceBarometer" },
  { to: "/mes-dinars", labelKey: "nav.myDinars" },
] as const;

type MenuItem = {
  to: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Ouvre un volet de la carte d'accueil au lieu d'une page. */
  action?: "itinerary";
};
type MenuFamily = {
  id: "prepare" | "live" | "lines" | "bledway";
  titleKey: MessageKey;
  columns: { titleKey?: MessageKey; items: MenuItem[] }[];
  /** Absente du menu de l'ordinateur (reste en pied de page et dans le volet). */
  sheetOnly?: boolean;
};

/**
 * Le menu dit ce qu'on vient faire : réserver (bouton à part), préparer son voyage, suivre en
 * direct, découvrir lignes et ports. Mêmes familles dans le menu de l'ordinateur et le volet.
 */
export const menuFamilies: MenuFamily[] = [
  {
    id: "prepare",
    titleKey: "menu.groupPrepareTrip",
    columns: [
      {
        titleKey: "menu.groupOrganize",
        items: [
          { to: "/", labelKey: "menu.stepByStep", icon: RouteIcon, action: "itinerary" },
          { to: "/voyage-algerie", labelKey: "nav.travelAlgeria", icon: MapPin },
          { to: "/papiers-voyage-algerie", labelKey: "nav.travelPapers", icon: FileText },
          { to: "/vehicules-moins-3-ans", labelKey: "nav.vehiclesUnder3", icon: Car },
          { to: "/guide", labelKey: "nav.guide", icon: BookOpen },
          { to: "/questions-frequentes", labelKey: "nav.faq", icon: CircleHelp },
          { to: "/covoiturage", labelKey: "nav.carpool", icon: Users },
        ],
      },
      {
        titleKey: "menu.groupBudget",
        items: [
          { to: "/simulateurs", labelKey: "nav.simulators", icon: Calculator },
          { to: "/barometre-prix", labelKey: "nav.priceBarometer", icon: TrendingUp },
          { to: "/mes-dinars", labelKey: "nav.myDinars", icon: Wallet },
        ],
      },
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

/** La rubrique allumée : « Suivre en direct » sur la carte d'accueil. */
function familyIsActive(family: MenuFamily, pathname: string) {
  return family.columns.some((column) =>
    column.items.some((item) =>
      item.to === "/"
        ? pathname === "/" && !item.action
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    ),
  );
}

/** Un lien du menu : une page, ou un volet de la carte d'accueil (« étape par étape »).
 * Transmet les propriétés du menu (fermeture au clic, focus clavier) au lien lui-même. */
const MenuItemLink = forwardRef<
  HTMLAnchorElement,
  {
    item: MenuItem;
    iconSize?: number;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    className?: string;
  }
>(function MenuItemLink({ item, iconSize = 16, onClick, className, ...rest }, ref) {
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
      className={`bw-menu-link${className ? ` ${className}` : ""}`}
    >
      <item.icon size={iconSize} aria-hidden />
      {t(item.labelKey)}
    </Link>
  );
});

const footerLinks = [
  { to: "/actualites", labelKey: "nav.news" },
  { to: "/guide", labelKey: "nav.allGuides" },
  { to: "/questions-frequentes", labelKey: "nav.faq" },
  { to: "/vehicules-moins-3-ans", labelKey: "nav.vehiclesUnder3" },
  { to: "/voyage-algerie", labelKey: "nav.travelAlgeria" },
  { to: "/papiers-voyage-algerie", labelKey: "nav.travelPapers" },
  { to: "/covoiturage", labelKey: "nav.carpool" },
  { to: "/bateaux", labelKey: "nav.vessels" },
  { to: "/simulateurs", labelKey: "nav.simulators" },
  { to: "/barometre-prix", labelKey: "nav.priceBarometer" },
  { to: "/mes-dinars", labelKey: "nav.myDinars" },
  { to: "/methode-editoriale", labelKey: "nav.editorialMethod" },
  { to: "/compagnies", labelKey: "nav.companies" },
  { to: "/a-propos", labelKey: "nav.about" },
  { to: "/contact", labelKey: "nav.contact" },
  { to: "/mentions-legales", labelKey: "nav.legalNotice" },
  { to: "/confidentialite", labelKey: "nav.privacy" },
  { to: "/charte", labelKey: "nav.communityCharter" },
  { to: "/conditions-utilisation", labelKey: "nav.terms" },
] as const;

/** « Réserver » : la recherche de traversée de la carte d'accueil, d'où partent les liens de réservation. */
function openSearchFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "search");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-search"));
}

function openItineraryFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-itinerary"));
}

/** Identité compacte commune à toutes les pages. */
export function BrandLink({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <Link
      to="/"
      className="bw-brand-link flex shrink-0 items-start"
      aria-label={t("menu.homeLabel")}
      onClick={goHome}
    >
      <img
        src="/bledway-brand-entete.webp"
        alt={tr("ui.siteLayout.bledway")}
        className={compact ? "bw-brand bw-brand-compact" : "bw-brand"}
      />
      <span className="bw-beta">{t("menu.beta")}</span>
    </Link>
  );
}

export function SiteHeader() {
  const t = useT();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Une traversée suivie : « Mon voyage » à portée de clic, comme le bouton central du téléphone.
  const { trip } = useVoyageTrip();
  // Hauteur réelle du bandeau (bandeau d'alertes compris), pour caler ce qui reste collé dessous.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const publish = () =>
      document.documentElement.style.setProperty("--bw-header-h", `${header.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return (
    <header className="bw-header" ref={headerRef}>
      <div className="bw-header-inner">
        <BrandLink />
        <nav aria-label={t("menu.mainNav")} className="bw-desktop-nav">
          <Link
            to="/"
            onClick={openSearchFromHeader}
            activeProps={{ className: "" }}
            className="bw-book-button"
            aria-label={t("menu.bookLabel")}
          >
            <CalendarCheck size={16} aria-hidden />
            {t("menu.book")}
          </Link>
          {menuFamilies
            .filter((family) => !family.sheetOnly)
            .map((family) => (
              // Non modal : un menu modal bloque le défilement en passant <body> en overflow hidden,
              // l'en-tête collant se cale alors sur <body> et sort de l'écran (page déjà descendue).
              <DropdownMenu key={family.id} modal={false}>
                <DropdownMenuTrigger
                  className="bw-explore-trigger"
                  data-active={familyIsActive(family, pathname) || undefined}
                >
                  {t(family.titleKey)} <ChevronDown size={15} aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="bw-mega-menu"
                  data-columns={family.columns.length}
                  onCloseAutoFocus={refocusTriggerWithoutScroll}
                >
                  {family.columns.map((column, index) => (
                    <div
                      key={column.titleKey ?? index}
                      className="bw-mega-menu__group"
                      role="group"
                      aria-label={t(column.titleKey ?? family.titleKey)}
                    >
                      {column.titleKey ? (
                        <p className="bw-menu-group-title">{t(column.titleKey)}</p>
                      ) : null}
                      {column.items.map((item) => (
                        <DropdownMenuItem asChild key={`${item.to}-${item.labelKey}`}>
                          <MenuItemLink item={item} />
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
        </nav>
        <div className="bw-header-actions">
          {/* Sur mobile, le compte est l'onglet « Moi » de la barre du bas. */}
          {trip ? (
            <Link
              to="/"
              search={{ voyage: 1 } as never}
              onClick={openVoyage}
              className="bw-my-trip-pill"
              aria-label={t("menu.myTripLabel")}
            >
              <Ship size={16} aria-hidden />
              {t("nav.myTrip")}
            </Link>
          ) : null}
          <QuestionButton />
          <span className="hidden md:inline-flex">
            <UserMenu compact iconOnly />
          </span>
          <Sheet>
            <SheetTrigger className="bw-mobile-menu bw-icon-button" aria-label={t("menu.open")}>
              <Menu size={22} />
            </SheetTrigger>
            <SheetContent side="bottom" className="bw-menu-sheet">
              <SheetTitle className="bw-menu-sheet__title">{t("menu.sheetTitle")}</SheetTitle>
              <SheetDescription className="sr-only">{t("menu.sheetDescription")}</SheetDescription>
              {/* Tablette : pas de barre du bas, « Réserver » et la carte restent ici. */}
              <div className="bw-menu-sheet__main">
                <SheetClose asChild>
                  <Link
                    to="/"
                    onClick={openSearchFromHeader}
                    activeProps={{ className: "" }}
                    className="bw-menu-link"
                  >
                    <CalendarCheck size={16} aria-hidden /> {t("menu.book")}
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/"
                    activeOptions={{ exact: true }}
                    onClick={goHome}
                    className="bw-menu-link"
                  >
                    <House size={16} aria-hidden /> {t("menu.liveMap")}
                  </Link>
                </SheetClose>
                {trip ? (
                  <SheetClose asChild>
                    <Link
                      to="/"
                      search={{ voyage: 1 } as never}
                      onClick={openVoyage}
                      className="bw-menu-link"
                    >
                      <Ship size={16} aria-hidden /> {t("nav.myTrip")}
                    </Link>
                  </SheetClose>
                ) : null}
              </div>
              <div className="bw-menu-sheet__groups">
                {menuFamilies.map((family) => (
                  <section key={family.id} aria-label={t(family.titleKey)}>
                    <p className="bw-menu-group-title">{t(family.titleKey)}</p>
                    {family.columns
                      .flatMap((column) => column.items)
                      .map((item) => (
                        <SheetClose asChild key={`${item.to}-${item.labelKey}`}>
                          <MenuItemLink item={item} iconSize={17} />
                        </SheetClose>
                      ))}
                  </section>
                ))}
              </div>
              <LanguageSwitcher className="mt-4" />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <AlertTicker />
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="bw-footer">
      <div className="bw-container bw-footer-grid">
        <div>
          <BrandLink />
          <p>
            {t("footer.taglineSea")}
            <br />
            {t("footer.taglineTrip")}
          </p>
          <span>{t("footer.scope")}</span>
        </div>
        <div>
          <h2>{t("footer.explore")}</h2>
          {navLinks
            .filter((item) =>
              ["/", "/horaires", "/ports", "/lignes", "/bateaux", "/compagnies"].includes(item.to),
            )
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {t(item.labelKey)}
              </Link>
            ))}
        </div>
        <div>
          <h2>{t("footer.prepare")}</h2>
          {footerLinks
            .filter((item) =>
              [
                "/guide",
                "/questions-frequentes",
                "/voyage-algerie",
                "/papiers-voyage-algerie",
                "/simulateurs",
                "/covoiturage",
                "/barometre-prix",
                "/mes-dinars",
              ].includes(item.to),
            )
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {t(item.labelKey)}
              </Link>
            ))}
        </div>
        <div>
          <h2>{t("footer.withYou")}</h2>
          {footerLinks
            .filter((item) => ["/a-propos", "/contact", "/methode-editoriale"].includes(item.to))
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {t(item.labelKey)}
              </Link>
            ))}
          <Link to="/contact" className="bw-text-link">
            {t("footer.question")} <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <div className="bw-container bw-footer-bottom">
        <p>{t("footer.disclaimer", { year: new Date().getFullYear() })}</p>
        <div>
          <Link to="/mentions-legales">{t("nav.legalNotice")}</Link>
          <Link to="/confidentialite">{t("nav.privacy")}</Link>
          <Link to="/conditions-utilisation">{t("nav.terms")}</Link>
          <Link to="/charte">{t("nav.charter")}</Link>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:p-3 focus:text-primary"
      >
        {t("menu.skipToContent")}
      </a>
      <SiteHeader />

      {/* Conteneur commun : largeur maximale et marges latérales sur toutes les pages éditoriales. */}
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 md:px-6 md:pb-16"
      >
        <DataUnavailableNotice className="mt-4" />
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

export function PageHero({
  overline,
  title,
  intro,
  compact = false,
}: {
  overline: string;
  title: string;
  intro: string;
  /** Pages de flux (actualités) : l'en-tête laisse vite la place au contenu. */
  compact?: boolean;
}) {
  if (compact)
    return (
      <div className="mx-auto max-w-3xl pb-5 pt-3 text-center md:pb-6 md:pt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
          {overline}
        </div>
        <h1 className="mb-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">{intro}</p>
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl py-8 text-center sm:py-12 md:py-20">
      <div className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">
        {overline}
      </div>
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight sm:mb-6 sm:text-4xl md:text-5xl lg:text-6xl">
        {title}
      </h1>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{intro}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-6 shadow-sm md:p-8 ${className}`}>{children}</div>
  );
}
