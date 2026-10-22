import { absoluteUrl, jsonLdString } from "@/lib/seo/site";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { PwaInstall } from "@/components/layout/PwaInstall";
import { TravelActionProvider } from "@/components/auth/TravelActionProvider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La page demandée n’existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à la carte
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  const caughtError = useMemo(
    () => (error instanceof Error ? error : new Error(String(error))),
    [error],
  );
  console.error(caughtError);
  const assetLoadError = /failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .+ failed/i.test(
    `${caughtError.message} ${String(caughtError.cause ?? "")}`,
  );
  useEffect(() => {
    reportLovableError(caughtError, { boundary: "tanstack_root_error_component" });
    if (!import.meta.env.PROD || !assetLoadError) return;
    try {
      const key = "bledway:last-asset-reload";
      const lastAttempt = Number(window.sessionStorage.getItem(key) || 0);
      if (Date.now() - lastAttempt < 60_000) return;
      window.sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    } catch {
      // Le bouton de rechargement reste accessible si le stockage est désactivé.
    }
  }, [caughtError, assetLoadError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Cette page n’a pas pu être chargée
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {assetLoadError
            ? "Une mise à jour a interrompu le chargement. Actualisez la page pour récupérer la dernière version."
            : "Un problème est survenu. Vous pouvez réessayer ou revenir à la carte."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Retour à la carte
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#087d46" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "BledWay — Ferries Europe ↔ Algérie" },
      {
        name: "description",
        content:
          "Les traversées en ferry entre l'Europe et l'Algérie, dans les deux sens : ports, lignes, durées, compagnies et prochains départs en heure locale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:site_name", content: "BledWay" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLdString({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": absoluteUrl("/#site"),
              name: "BledWay",
              url: absoluteUrl("/"),
              inLanguage: "fr",
              publisher: { "@id": absoluteUrl("/#organisation") },
            },
            {
              "@type": "Organization",
              "@id": absoluteUrl("/#organisation"),
              name: "BledWay",
              url: absoluteUrl("/"),
              description:
                "Information indépendante sur les ferries Europe–Algérie et la préparation du voyage.",
            },
          ],
        }),
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa-icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TravelActionProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <PwaInstall />
        <Toaster />
        </TravelActionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
