import { articles } from "@/content/articles";
import { vesselDossiers } from "@/content/vessels";
import { carpoolPlaces } from "@/content/carpool";
import { toolsCatalog } from "@/content/tools";
import { EDITORIAL_DATE } from "./site";
import { bledRoutePages, routesData } from "@/lib/routesDuBled/pages";
export const editorialPaths = [
  "/guide",
  "/decouvrir",
  "/vehicules-moins-3-ans",
  "/importer-ma-voiture",
  "/voyage-algerie",
  "/papiers-voyage-algerie",
  "/preparer-mon-voyage",
  "/bateaux",
  "/covoiturage",
  "/simulateurs",
  "/methode-editoriale",
  ...articles.map((a) => `/guide/${a.slug}`),
  ...vesselDossiers.map((v) => `/bateaux/${v.slug}`),
  ...carpoolPlaces.map((p) => `/covoiturage/${p.slug}`),
  ...toolsCatalog.map((t) => `/simulateurs/${t.slug}`),
];

/**
 * Pages qui affichent les départs, les navires ou les actualités : leur date est celle du dernier
 * horaire ou de la dernière actualité publiés (calculée à la demande par le sitemap).
 */
export const livePaths = [
  "/",
  "/horaires",
  "/actualites",
  "/barometre-prix",
  "/ports",
  "/lignes",
  "/compagnies",
];

/** Pages au texte fixe : date de la dernière modification du texte (à avancer quand il change). */
export const fixedPageDates: Record<string, string> = {
  "/questions-frequentes": "2026-11-24",
  "/routes-du-bled": "2026-11-24",
  "/mes-dinars": "2026-11-24",
  "/a-propos": "2026-11-24",
  "/contact": "2026-11-12",
  "/mentions-legales": "2026-11-24",
  "/confidentialite": "2026-11-24",
  "/charte": "2026-11-24",
  "/conditions-utilisation": "2026-11-24",
};

const articleDate = new Map(articles.map((a) => [`/guide/${a.slug}`, a.updated ?? EDITORIAL_DATE]));

/** Entrées du sitemap des pages ; `live` : date à remplacer par celle du dernier horaire publié. */
export const staticSitemapEntries: { path: string; lastmod: string | null; live?: boolean }[] = [
  ...livePaths.map((path) => ({ path, lastmod: null, live: true })),
  ...Object.entries(fixedPageDates).map(([path, lastmod]) => ({ path, lastmod })),
  ...editorialPaths.map((path) => ({ path, lastmod: articleDate.get(path) ?? EDITORIAL_DATE })),
  ...bledRoutePages.map(({ slug }) => ({ path: `/routes-du-bled/${slug}`, lastmod: routesData.version })),
];
