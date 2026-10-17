import { articles } from "@/content/articles";
import { vesselDossiers } from "@/content/vessels";
import { carpoolPlaces } from "@/content/carpool";
import { toolsCatalog } from "@/content/tools";
import { EDITORIAL_DATE } from "./site";
export const editorialPaths = [
  "/guide",
  "/vehicules-moins-3-ans",
  "/voyage-algerie",
  "/bateaux",
  "/covoiturage",
  "/simulateurs",
  "/methode-editoriale",
  ...articles.map((a) => `/guide/${a.slug}`),
  ...vesselDossiers.map((v) => `/bateaux/${v.slug}`),
  ...carpoolPlaces.map((p) => `/covoiturage/${p.slug}`),
  ...toolsCatalog.map((t) => `/simulateurs/${t.slug}`),
];
export const staticSitemapEntries = [
  ...[
    "/",
    "/horaires",
    "/ports",
    "/lignes",
    "/compagnies",
    "/a-propos",
    "/contact",
    "/mentions-legales",
    "/confidentialite",
  ].map((path) => ({ path, lastmod: null })),
  ...editorialPaths.map((path) => ({ path, lastmod: EDITORIAL_DATE })),
];
