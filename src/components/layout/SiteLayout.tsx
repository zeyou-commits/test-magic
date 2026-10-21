import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";
import { MobileTabBar } from "./MobileTabBar";
import { DataUnavailableNotice } from "./DataUnavailableNotice";
import { ChevronDown, Menu, ArrowUpRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const navLinks = [
  { to: "/", label: "Carte" },
  { to: "/horaires", label: "Horaires" },
  { to: "/ports", label: "Ports" },
  { to: "/lignes", label: "Lignes" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide" },
  { to: "/bateaux", label: "Bateaux" },
  { to: "/simulateurs", label: "Simulateurs" },
] as const;

const footerLinks = [
  { to: "/guide", label: "Tous les dossiers" },
  { to: "/vehicules-moins-3-ans", label: "Véhicules de moins de 3 ans" },
  { to: "/voyage-algerie", label: "Voyage en Algérie" },
  { to: "/covoiturage", label: "Covoiturage" },
  { to: "/bateaux", label: "Bateaux" },
  { to: "/simulateurs", label: "Simulateurs" },
  { to: "/methode-editoriale", label: "Méthode éditoriale" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/confidentialite", label: "Confidentialité" },
] as const;

/** Identité commune à toutes les pages : même logo, même nom, même accroche. */
export function BrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-2.5"
      aria-label="BledWay, retour à la carte"
    >
      <img
        src="/bledway-brand.png"
        alt="BledWay"
        className={compact ? "bw-brand bw-brand-compact" : "bw-brand"}
      />
    </Link>
  );
}

export function SiteHeader() {
  const primary = navLinks.filter((item) =>
    ["/", "/horaires", "/guide", "/simulateurs"].includes(item.to),
  );
  const explore = navLinks.filter((item) =>
    ["/ports", "/lignes", "/compagnies", "/bateaux"].includes(item.to),
  );
  return (
    <header className="bw-header">
      <div className="bw-header-inner">
        <BrandLink />
        <nav aria-label="Navigation principale" className="bw-desktop-nav">
          {primary.slice(0, 2).map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }}>
              {item.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="bw-explore-trigger">
              Explorer <ChevronDown size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {explore.map((item) => (
                <DropdownMenuItem asChild key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {primary.slice(2).map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="bw-header-actions">
          <span className="md:hidden">
            <UserMenu compact iconOnly />
          </span>
          <span className="hidden md:inline-flex">
            <UserMenu compact />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="bw-mobile-menu bw-icon-button"
              aria-label="Ouvrir le menu"
            >
              <Menu size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {navLinks.map((item) => (
                <DropdownMenuItem asChild key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
              ["/guide", "/voyage-algerie", "/simulateurs", "/covoiturage"].includes(item.to),
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
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <MobileTabBar />
      </div>
    </div>
  );
}

export function PageHero({
  overline,
  title,
  intro,
}: {
  overline: string;
  title: string;
  intro: string;
}) {
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
