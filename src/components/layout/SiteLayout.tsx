import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "./UserMenu";
import { MobileTabBar } from "./MobileTabBar";
import { DataUnavailableNotice } from "./DataUnavailableNotice";

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
        src="/bledway-logo.webp"
        alt="BledWay"
        className={compact ? "h-9 w-auto max-w-[145px] object-contain" : "h-11 w-auto max-w-[190px] object-contain"}
      />
    </Link>
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
      <header className="sticky top-0 z-40 hidden h-14 w-full items-center justify-between gap-6 border-b border-border/60 bg-background/90 px-5 shadow-[0_1px_12px_-6px_hsl(0_0%_0%/0.15)] backdrop-blur-xl md:flex">
        <BrandLink />
        <nav
          aria-label="Navigation principale"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
        >
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <UserMenu />
        </div>
      </header>

      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <BrandLink compact />
        <UserMenu compact />
      </header>

      {/* Conteneur commun : largeur maximale et marges latérales sur toutes les pages éditoriales. */}
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 md:px-6 md:pb-16"
      >
        <DataUnavailableNotice className="mt-4" />
        {children}
      </main>

      <footer className="mt-auto border-t bg-card py-12 pb-24 text-center text-sm text-muted-foreground md:pb-12">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-4 flex flex-col items-center gap-2">
            <img src="/bledway-logo.webp" alt="BledWay" className="mx-auto h-10 w-auto max-w-[150px] object-contain opacity-80" />
            BledWay © {new Date().getFullYear()} — Informations maritimes indépendantes. Les
            compagnies restent la seule référence officielle pour les horaires et la réservation.
          </p>
          <div className="flex flex-wrap justify-center gap-4 gap-y-2">
            {footerLinks.map((link) => (
              <Link key={link.to} to={link.to} className="hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
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
