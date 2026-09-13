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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-[image:var(--gradient-header)] text-primary-foreground">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-9" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
              <span className="text-[11px] text-primary-foreground/70">
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
                className="rounded-full px-3 py-1.5 text-sm font-medium text-primary-foreground/85 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                activeProps={{ className: "bg-primary-foreground/15 text-primary-foreground" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <UserMenu />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-primary-foreground/10 px-4 py-2 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-primary-foreground/85"
              activeProps={{ className: "bg-primary-foreground/15 text-primary-foreground" }}
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
