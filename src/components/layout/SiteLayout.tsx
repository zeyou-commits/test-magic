import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";
import { MobileTabBar } from "./MobileTabBar";

export const navLinks = [
  { to: "/", label: "Carte" },
  { to: "/horaires", label: "Horaires" },
  { to: "/ports", label: "Ports" },
  { to: "/lignes", label: "Lignes" },
  { to: "/compagnies", label: "Compagnies" },
  { to: "/guide", label: "Guide" },
] as const;

const footerLinks = [
  { to: "/compagnies", label: "Compagnies" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/confidentialite", label: "Confidentialité" },
] as const;

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 hidden w-full border-b bg-background/95 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark className="size-8 text-primary" />
            <span className="font-display text-xl font-bold tracking-tight">Batogo</span>
          </Link>
          <nav className="flex items-center gap-6">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground [&.active]:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4"><UserMenu /></div>
        </div>
      </header>

      <div className="md:hidden">
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="size-6 text-primary" />
            <span className="font-display font-bold tracking-tight">Batogo</span>
          </Link>
          <UserMenu compact />
        </header>
      </div>

      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      <footer className="mt-auto border-t bg-card py-12 text-center text-sm text-muted-foreground pb-24 md:pb-12">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-4">
            <BrandMark className="inline-block size-5 translate-y-[-2px] text-muted-foreground opacity-50" />
            <br />Batogo © {new Date().getFullYear()} — Informations maritimes indépendantes.
          </p>
          <div className="flex flex-wrap justify-center gap-4 gap-y-2">
            {footerLinks.map((link) => (
              <Link key={link.to} to={link.to} className="hover:underline">{link.label}</Link>
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

export function PageHero({ overline, title, intro }: { overline: string; title: string; intro: string; }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center md:py-20">
      <div className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">{overline}</div>
      <h1 className="mb-6 font-display text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">{title}</h1>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{intro}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string; }) {
  return <div className={`rounded-2xl border bg-card p-6 shadow-sm md:p-8 ${className}`}>{children}</div>;
}
