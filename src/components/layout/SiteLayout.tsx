import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";

const navLinks = [
  { to: "/", label: "Carte" },
  { to: "/horaires", label: "Horaires" },
  { to: "/ports", label: "Ports" },
  { to: "/lignes", label: "Lignes" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide" },
] as const;

const footerLinks = [
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/confidentialite", label: "Confidentialité" },
] as const;

/** Chrome commun aux pages de contenu (la carte garde son propre plein écran). */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-16 md:pb-0">
      {/* HEADER MODERNISÉ */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl text-foreground shadow-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-9 text-primary" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
              <span className="text-[11px] text-muted-foreground">
                Traversées en ferry vers l'Algérie
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: link.to === "/" }}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <UserMenu />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border/50 px-4 py-2 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Batogo — informations maritimes indépendantes.</p>
          <nav className="flex flex-wrap gap-4">
            {footerLinks.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* BARRE DE NAVIGATION DU BAS (Mobile uniquement) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border/50 bg-background/95 pb-1 backdrop-blur-xl md:hidden">
        <Link 
          to="/" 
          activeOptions={{ exact: true }} 
          className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground" 
          activeProps={{ className: "!text-primary" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span className="text-[10px] font-medium">Carte</span>
        </Link>
        <Link 
          to="/horaires" 
          className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground" 
          activeProps={{ className: "!text-primary" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span className="text-[10px] font-medium">Horaires</span>
        </Link>
        <Link 
          to="/ports" 
          className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground" 
          activeProps={{ className: "!text-primary" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg>
          <span className="text-[10px] font-medium">Ports</span>
        </Link>
        <Link 
          to="/guide" 
          className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground" 
          activeProps={{ className: "!text-primary" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          <span className="text-[10px] font-medium">Guide</span>
        </Link>
      </nav>

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
    <div className="max-w-3xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
        {overline}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{intro}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-panel)] transition-transform hover:-translate-y-0.5 ${className}`}
    >
      {children}
    </div>
  );
}
