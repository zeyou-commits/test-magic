import { AlertTicker } from "./AlertTicker";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";
import { DataUnavailableNotice } from "./DataUnavailableNotice";
import { goHome } from "@/lib/ferry/voyageTrip";
import {
  Anchor,
  ArrowUpRight,
  BookOpen,
  Building2,
  Calculator,
  Car,
  ChevronDown,
  CircleHelp,
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

export const navLinks = [
  { to: "/", label: "Carte" },
  { to: "/horaires", label: "Départs & arrivées" },
  { to: "/actualites", label: "Actualités" },
  { to: "/ports", label: "Ports" },
  { to: "/lignes", label: "Lignes" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide" },
  { to: "/bateaux", label: "Navires" },
  { to: "/simulateurs", label: "Simulateurs" },
  { to: "/barometre-prix", label: "Baromètre des prix" },
  { to: "/mes-dinars", label: "Mes dinars" },
] as const;

/**
 * Le même rangement partout : volet « Explorer » sur téléphone, grand menu « Explorer » sur
 * ordinateur. Rien n'y répète la navigation principale (Carte, Départs, Route, compte).
 */
export const menuGroups: {
  title: string;
  items: { to: string; label: string; icon: LucideIcon }[];
}[] = [
  {
    title: "Voyager",
    items: [
      { to: "/actualites", label: "Actualités", icon: Newspaper },
      { to: "/lignes", label: "Lignes", icon: Waypoints },
      { to: "/ports", label: "Ports", icon: Anchor },
      { to: "/compagnies", label: "Compagnies", icon: Building2 },
      { to: "/bateaux", label: "Navires", icon: Ship },
    ],
  },
  {
    title: "Préparer",
    items: [
      { to: "/guide", label: "Guide", icon: BookOpen },
      { to: "/questions-frequentes", label: "Questions fréquentes", icon: CircleHelp },
      { to: "/voyage-algerie", label: "Voyage en Algérie", icon: MapPin },
      { to: "/vehicules-moins-3-ans", label: "Véhicules de moins de 3 ans", icon: Car },
      { to: "/covoiturage", label: "Covoiturage", icon: Users },
    ],
  },
  {
    title: "Outils",
    items: [
      { to: "/simulateurs", label: "Simulateurs", icon: Calculator },
      { to: "/barometre-prix", label: "Baromètre des prix", icon: TrendingUp },
      { to: "/mes-dinars", label: "Mes dinars", icon: Wallet },
    ],
  },
  {
    title: "BledWay",
    items: [
      { to: "/a-propos", label: "À propos", icon: Info },
      { to: "/contact", label: "Contact", icon: Mail },
      { to: "/methode-editoriale", label: "Méthode éditoriale", icon: ScrollText },
    ],
  },
];

const footerLinks = [
  { to: "/actualites", label: "Actualités" },
  { to: "/guide", label: "Tous les dossiers" },
  { to: "/questions-frequentes", label: "Questions fréquentes" },
  { to: "/vehicules-moins-3-ans", label: "Véhicules de moins de 3 ans" },
  { to: "/voyage-algerie", label: "Voyage en Algérie" },
  { to: "/covoiturage", label: "Covoiturage" },
  { to: "/bateaux", label: "Navires" },
  { to: "/simulateurs", label: "Simulateurs" },
  { to: "/barometre-prix", label: "Baromètre des prix" },
  { to: "/mes-dinars", label: "Mes dinars" },
  { to: "/methode-editoriale", label: "Méthode éditoriale" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/confidentialite", label: "Confidentialité" },
  { to: "/charte", label: "Charte de la communauté" },
  { to: "/conditions-utilisation", label: "Conditions d'utilisation" },
] as const;

function openItineraryFromHeader() {
  window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-itinerary"));
}

/** Identité compacte commune à toutes les pages. */
export function BrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="bw-brand-link flex shrink-0 flex-col items-start justify-center"
      aria-label="BledWay, retour à la carte"
      onClick={goHome}
    >
      <img
        src="/bledway-brand-entete.webp"
        alt="BledWay"
        className={compact ? "bw-brand bw-brand-compact" : "bw-brand"}
      />
    </Link>
  );
}

export function SiteHeader() {
  const primary = navLinks.filter((item) => ["/", "/horaires"].includes(item.to));
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
        <nav aria-label="Navigation principale" className="bw-desktop-nav">
          {primary.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              onClick={() => {
                if (item.to !== "/") return;
                window.scrollTo({ top: 0, behavior: "instant" });
                goHome();
              }}
            >
              {item.to === "/" ? "Carte" : "Départs"}
            </Link>
          ))}
          <Link
            to="/"
            onClick={openItineraryFromHeader}
            activeProps={{ className: "" }}
            className="inline-flex items-center gap-1.5"
          >
            <RouteIcon size={16} aria-hidden />
            Route
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="bw-explore-trigger">
              Explorer <ChevronDown size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bw-mega-menu">
              {menuGroups.map((group) => (
                <div key={group.title} className="bw-mega-menu__group" role="group" aria-label={group.title}>
                  <p className="bw-menu-group-title">{group.title}</p>
                  {group.items.map((item) => (
                    <DropdownMenuItem asChild key={item.to}>
                      <Link to={item.to} className="bw-menu-link">
                        <item.icon size={16} aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div className="bw-header-actions">
          {/* Sur mobile, le compte est l'onglet « Moi » de la barre du bas. */}
          <span className="hidden md:inline-flex">
            <UserMenu compact iconOnly />
          </span>
          <Sheet>
            <SheetTrigger className="bw-mobile-menu bw-icon-button" aria-label="Ouvrir le menu">
              <Menu size={22} />
            </SheetTrigger>
            <SheetContent side="bottom" className="bw-menu-sheet">
              <SheetTitle className="bw-menu-sheet__title">Explorer BledWay</SheetTitle>
              <SheetDescription className="sr-only">
                Toutes les rubriques, rangées par famille.
              </SheetDescription>
              {/* Tablette : pas de barre du bas, la navigation principale reste ici. */}
              <div className="bw-menu-sheet__main">
                <SheetClose asChild>
                  <Link to="/" activeOptions={{ exact: true }} onClick={goHome} className="bw-menu-link">
                    <MapIcon size={16} aria-hidden /> Carte
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/horaires" className="bw-menu-link">
                    <Clock size={16} aria-hidden /> Départs
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/"
                    onClick={openItineraryFromHeader}
                    activeProps={{ className: "" }}
                    className="bw-menu-link"
                  >
                    <RouteIcon size={16} aria-hidden /> Route
                  </Link>
                </SheetClose>
              </div>
              <div className="bw-menu-sheet__groups">
                {menuGroups.map((group) => (
                  <section key={group.title} aria-label={group.title}>
                    <p className="bw-menu-group-title">{group.title}</p>
                    {group.items.map((item) => (
                      <SheetClose asChild key={item.to}>
                        <Link to={item.to} className="bw-menu-link">
                          <item.icon size={17} aria-hidden />
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </section>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <AlertTicker />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bw-footer">
      <div className="bw-container bw-footer-grid">
        <div>
          <BrandLink />
          <p>
            La mer entre nous.
            <br />
            Le voyage qui nous rapproche.
          </p>
          <span>Ferries Europe ↔ Algérie</span>
        </div>
        <div>
          <h2>Explorer</h2>
          {navLinks
            .filter((item) =>
              ["/", "/horaires", "/ports", "/lignes", "/bateaux", "/compagnies"].includes(item.to),
            )
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
        </div>
        <div>
          <h2>Préparer le voyage</h2>
          {footerLinks
            .filter((item) =>
              [
                "/guide",
                "/questions-frequentes",
                "/voyage-algerie",
                "/simulateurs",
                "/covoiturage",
                "/barometre-prix",
                "/mes-dinars",
              ].includes(item.to),
            )
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
        </div>
        <div>
          <h2>À vos côtés</h2>
          {footerLinks
            .filter((item) => ["/a-propos", "/contact", "/methode-editoriale"].includes(item.to))
            .map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          <Link to="/contact" className="bw-text-link">
            Une question ? <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <div className="bw-container bw-footer-bottom">
        <p>
          © {new Date().getFullYear()} BledWay · Informations indépendantes. Horaires et offres à
          confirmer auprès des compagnies.
        </p>
        <div>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/conditions-utilisation">Conditions d'utilisation</Link>
          <Link to="/charte">Charte</Link>
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:p-3 focus:text-primary"
      >
        Aller au contenu
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
    <div className="mx-auto max-w-3xl py-12 text-center md:py-20">
      <div className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">
        {overline}
      </div>
      <h1 className="mb-6 font-display text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">
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
