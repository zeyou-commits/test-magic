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
import {
  familyIsActive,
  familyItems,
  menuFamilies,
  MenuItemLink,
  openSearchFromHeader,
  type MenuFamily,
} from "./menu";

export { menuFamilies } from "./menu";
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

const footerLinks = [
  { to: "/actualites", labelKey: "nav.news" },
  { to: "/guide", labelKey: "nav.allGuides" },
  { to: "/questions-frequentes", labelKey: "nav.faq" },
  { to: "/vehicules-moins-3-ans", labelKey: "nav.vehiclesUnder3" },
  { to: "/voyage-algerie", labelKey: "nav.travelAlgeria" },
  { to: "/papiers-voyage-algerie", labelKey: "nav.travelPapers" },
  { to: "/preparer-mon-voyage", labelKey: "nav.prepareCompanion" },
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
  const desktopFamilies = menuFamilies.filter((family) => !family.sheetOnly);
  const renderFamily = (family: MenuFamily) => (
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
        {family.lead ? (
          <DropdownMenuItem asChild>
            <MenuItemLink
              item={family.lead}
              iconSize={20}
              hint={t(family.lead.hintKey)}
              className="bw-menu-link--lead"
            />
          </DropdownMenuItem>
        ) : null}
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
        {family.footer ? (
          <div className="bw-mega-menu__footer">
            {family.footer.map((item) => (
              <DropdownMenuItem asChild key={`${item.to}-${item.labelKey}`}>
                <MenuItemLink item={item} iconSize={15} />
              </DropdownMenuItem>
            ))}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <header className="bw-header" ref={headerRef}>
      <div className="bw-header-inner">
        <BrandLink />
        <nav aria-label={t("menu.mainNav")} className="bw-desktop-nav">
          {/* Dans l'ordre du voyage : préparer, réserver, puis suivre. */}
          {desktopFamilies.slice(0, 1).map(renderFamily)}
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
          {desktopFamilies.slice(1).map(renderFamily)}
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
                    {familyItems(family).map((item) => (
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
                "/preparer-mon-voyage",
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
