import { absoluteUrl, jsonLdString } from "@/lib/seo/site";
import { PITCH, PROMISE } from "@/lib/seo/pitch";
import { I18nProvider } from "@/lib/i18n";
import seoConfig from "../../seo.config.json";
import { ProfileHost } from "@/components/community/ProfileHost";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { track } from "@/lib/usage";
import { useEffect, useMemo, type ReactNode } from "react";
import { loadIllustrations } from "@/lib/illustrations/store";
import { keepOffline, restoreOffline } from "@/lib/offline";
import { OfflineBanner } from "@/components/layout/OfflineBanner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { AppUpdates } from "@/components/layout/AppUpdates";
import { LocationHelp } from "@/components/layout/LocationHelp";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SiteHeader } from "@/components/layout/SiteLayout";
import { TravelActionProvider } from "@/components/auth/TravelActionProvider";
import { tr } from "@/lib/i18n";
import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Erreur 404</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{tr("ui.pageRoot.pageIntrouvable")}</h1>
        {/* La raison est sûre : l'adresse ne mène à aucune page. La 504 propose deux sorties. */}
        <Bw504Note
          tone="stuck"
          className="mt-5 text-left"
          title="J'ai pris la mauvaise sortie"
          actions={
            <>
              <Bw504Button primary onClick={() => window.location.assign("/")}>
                {tr("ui.pageRoot.retourALaCarte")}
              </Bw504Button>
              <Bw504Button onClick={() => window.location.assign("/preparer-mon-voyage")}>
                Préparer mon voyage
              </Bw504Button>
            </>
          }
        >
          Cette page n'existe pas, ou elle a changé d'adresse. On repart d'un endroit connu ?
        </Bw504Note>
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
  const assetLoadError =
    /failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .+ failed/i.test(
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
          {tr("ui.pageRoot.cettePageNAPas")}
        </h1>
        {/* Deux cas seulement sont sûrs : une mise à jour du site, ou « un problème » sans plus. */}
        <Bw504Note
          tone="stuck"
          className="mt-5 text-left"
          title={assetLoadError ? "Le site vient d'être mis à jour" : "J'ai calé sur cette page"}
          actions={
            <>
              <Bw504Button primary onClick={() => window.location.reload()}>
                {tr("ui.pageRoot.reessayer")}
              </Bw504Button>
              <Bw504Button onClick={() => window.location.assign("/")}>
                {tr("ui.pageRoot.retourALaCarte")}
              </Bw504Button>
            </>
          }
        >
          {assetLoadError
            ? "Recharge la page : tu auras la dernière version."
            : "Je ne sais pas encore pourquoi, l'équipe est prévenue. Réessaie, ou repars de la carte."}
        </Bw504Note>
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
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "BledWay — le Waze du ferry Europe ↔ Maghreb" },
      {
        name: "description",
        content:
          `${PROMISE}. Le Waze du ferry Europe–Maghreb : navires en direct, alertes de retard ou d'annulation, signalements des voyageurs.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:site_name", content: "BledWay" },
    ],
    scripts: [
      // Mesure d'audience Umami : sans cookie ; seulement sur le vrai site (pas en local ni en aperçu).
      {
        src: "https://cloud.umami.is/script.js",
        defer: true,
        "data-website-id": "9a6674a0-5a87-48e4-a954-dad8060ab59c",
        "data-domains": "www.bledway.com,bledway.com",
      },
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
              logo: absoluteUrl("/pwa-icon-512.png"),
              email: seoConfig.contactEmail,
              description:
                PITCH,
            },
            {
              "@type": "WebApplication",
              "@id": absoluteUrl("/#app"),
              name: "BledWay",
              alternateName: "Le Waze du ferry Europe–Maghreb",
              url: absoluteUrl("/"),
              inLanguage: "fr",
              applicationCategory: "TravelApplication",
              operatingSystem: "Web, Android, iOS",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
              publisher: { "@id": absoluteUrl("/#organisation") },
              description:
                PITCH,
              featureList: [
                "Signalements des voyageurs en direct au port et à bord, façon Waze",
                "Suivi des navires en mer et arrivée estimée",
                "Alertes de retard, de report et d'annulation pour la traversée suivie",
                "Comparaison des départs de toutes les compagnies, en heure locale",
                "Salons de discussion par traversée et par port",
                "Préparation du voyage de porte à porte : itinéraire, carburant, péages",
                "Billets rangés et consultables sans réseau",
              ],
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
      // Google choisit parmi les icônes déclarées et préfère les grandes : la pastille BW existe donc
      // aussi en 192 et 512 px, à côté de l'icône iPhone BW. Les onglets gardent le favicon de 64 px.
      { rel: "icon", href: "/favicon-512.png?v=bw", type: "image/png", sizes: "512x512" },
      { rel: "icon", href: "/favicon-192.png?v=bw", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/favicon.ico?v=bw", type: "image/x-icon", sizes: "any" },
      { rel: "icon", href: "/favicon-64.png?v=bw", type: "image/png", sizes: "64x64" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=bw", sizes: "180x180" },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Connexion venue de l'espace compagnie : ni bandeau ni barre du site voyageurs.
  const proAuth = useRouterState({
    select: (state) => {
      const next = String((state.location.search as Record<string, unknown>)["next"] ?? "");
      return (
        state.location.pathname === "/auth" &&
        (next.startsWith("/espace-compagnie") || next.startsWith("/rejoindre-compagnie"))
      );
    },
  });
  useEffect(() => {
    track("page_view");
  }, [pathname]);
  useEffect(() => {
    loadIllustrations();
  }, []);
  // Hors ligne : le voyage gardé sur l'appareil, et le service worker de secours pour les pages.
  useEffect(() => {
    restoreOffline(queryClient);
    const stop = keepOffline(queryClient);
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    return stop;
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <TravelActionProvider>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            {/* Pages à l'en-tête propre : le bandeau général reste présent sur PC. Les espaces de
                travail (équipe, compagnie) ont leur propre cadre, sans le bandeau du site. */}
            {/^\/(compte|auth)(\/|$)/.test(pathname) && !proAuth ? (
              <div className="bw-global-header hidden md:block">
                <SiteHeader />
              </div>
            ) : null}
            <Outlet />
            {/* La carte a sa propre barre, reliée à ses volets ; l'espace équipe a la sienne. */}
            {pathname === "/" || proAuth || /^\/(admin|espace-compagnie)(\/|$)/.test(pathname) ? null : (
              <div className="bw-global-tabs fixed bottom-0 left-0 right-0 z-[70] md:hidden">
                <MobileTabBar className="h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]" />
              </div>
            )}
            <OfflineBanner />
            {proAuth || /^\/(espace-compagnie|rejoindre-compagnie)(\/|$)/.test(pathname) ? null : <AppUpdates />}
            <LocationHelp />
            <ProfileHost />
            <Toaster />
          </TravelActionProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
