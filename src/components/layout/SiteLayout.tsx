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

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-16 md:pb-0">
      {/* HEADER : Pleine largeur, fin et élégant (Glassmorphism) */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl text-foreground">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <BrandMark className="size-8 text-primary" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: link.to === "/" }}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground relative py-1"
                activeProps={{ className: "text-foreground font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full" }}
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
        <nav className="flex gap-4 overflow-x-auto border-t border-border/40 px-4 py-2.5 md:hidden scrollbar-none">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="shrink-0 text-xs font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary font-bold" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-12">{children}</main>

      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Batogo</p>
            <p>© {new Date().getFullYear()} — Informations maritimes indépendantes.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 font-medium">
            {footerLinks.map((link) => (
              <Link key={link.to} to={link.to} className="transition-colors hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* NAV MOBILE FIXE */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 pb-1 backdrop-blur-xl md:hidden">
        <Link to="/" activeOptions={{ exact: true }} className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground" activeProps={{ className: "!text-primary" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span className="text-[10px] font-medium">Carte</span>
        </Link>
        <Link to="/horaires" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground" activeProps={{ className: "!text-primary" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span className="text-[10px] font-medium">Horaires</span>
        </Link>
        <Link to="/ports" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground" activeProps={{ className: "!text-primary" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg>
          <span className="text-[10px] font-medium">Ports</span>
        </Link>
        <Link to="/guide" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground" activeProps={{ className: "!text-primary" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          <span className="text-[10px] font-medium">Guide</span>
        </Link>
      </nav>
    </div>
  );
}

export function PageHero({ overline, title, intro }: { overline: string; title: string; intro: string; }) {
  return (
    <div className="max-w-3xl mb-10">
      <p className="text-[12px] font-bold uppercase tracking-widest text-primary mb-3">
        {overline}
      </p>
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">{title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{intro}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md ${className}`}>
      {children}
    </div>
  );
}
