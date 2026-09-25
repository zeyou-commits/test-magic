import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";

export const navLinks = [
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
    <div className="flex min-h-dvh flex-col bg-background pb-20 md:pb-0">
      {/* HEADER MODERNISÉ : Effet Glassmorphism accentué, espacements aérés */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-2xl text-foreground shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-[1.02]">
            <BrandMark className="size-10 text-primary drop-shadow-sm" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl font-bold tracking-tight text-foreground">Batogo</span>
              <span className="text-[12px] font-medium text-muted-foreground mt-0.5">
                Traversées en ferry vers l'Algérie
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex bg-secondary/50 p-1 rounded-full border border-border/50">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: link.to === "/" }}
                className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground"
                activeProps={{ className: "bg-white text-primary shadow-sm ring-1 ring-border/50" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
        
        {/* Navigation secondaire mobile */}
        <nav className="flex gap-2 overflow-x-auto border-t border-border/40 px-4 py-3 md:hidden scrollbar-none">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-all bg-secondary/50"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-md" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12 md:py-16">{children}</main>

      {/* FOOTER MODERNISÉ */}
      <footer className="mt-auto border-t border-border/50 bg-card/50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <BrandMark className="size-6 text-muted-foreground/50 grayscale" />
            <p className="font-medium">© {new Date().getFullYear()} Batogo — informations maritimes indépendantes.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 font-medium">
            {footerLinks.map((link) => (
              <Link key={link.to} to={link.to} className="transition-colors hover:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* BARRE DE NAVIGATION DU BAS (Mobile uniquement) - Style flottant type App */}
      <nav className="fixed bottom-4 left-4 right-4 z-50 flex h-16 items-center justify-around rounded-2xl border border-white/60 bg-white/80 pb-0.5 shadow-[var(--shadow-elegant)] backdrop-blur-2xl md:hidden">
        <Link 
          to="/" 
          activeOptions={{ exact: true }} 
          className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-all hover:text-foreground" 
          activeProps={{ className: "!text-primary scale-110" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span className="text-[10px] font-bold tracking-wide">Carte</span>
        </Link>
        <Link 
          to="/horaires" 
          className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-all hover:text-foreground" 
          activeProps={{ className: "!text-primary scale-110" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span className="text-[10px] font-bold tracking-wide">Horaires</span>
        </Link>
        <Link 
          to="/ports" 
          className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-all hover:text-foreground" 
          activeProps={{ className: "!text-primary scale-110" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg>
          <span className="text-[10px] font-bold tracking-wide">Ports</span>
        </Link>
        <Link 
          to="/guide" 
          className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-all hover:text-foreground" 
          activeProps={{ className: "!text-primary scale-110" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          <span className="text-[10px] font-bold tracking-wide">Guide</span>
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
    <div className="max-w-3xl mb-12">
      <p className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.2em] text-accent mb-4">
        {overline}
      </p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">{title}</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl font-medium">{intro}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-[var(--shadow-elegant)] hover:-translate-y-1 ${className}`}
    >
      {children}
    </div>
  );
}
