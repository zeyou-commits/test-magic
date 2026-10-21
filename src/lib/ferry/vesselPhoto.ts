import { queryOptions } from "@tanstack/react-query";
import type { Vessel } from "./types";
import { vesselVisual } from "./vesselVisuals";

export interface VesselPhoto {
  url: string;
  /** Page de la photo (pour l'attribution et le droit d'auteur). */
  pageUrl: string | null;
  credit: string | null;
  license: string | null;
  source: "batogo" | "commons" | "render";
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Mots du titre d'un navire (sans « II », « III »…), qui doivent tous figurer dans le nom du fichier. */
const nameWords = (name: string) =>
  normalize(name)
    .split(" ")
    .filter((word) => word.length > 1 && !/^[ivx]+$/.test(word));

/** Mots qui prouvent que la photo représente bien un navire (évite « Fantastic Lava Beds »). */
const SHIP_HINTS = [
  "ship",
  "ferry",
  "ferries",
  "imo",
  "port",
  "quai",
  "boat",
  "navire",
  "paquebot",
  "corsica",
  "gnv",
  "sncm",
  "ctn",
  "marseille",
  "alger",
  "oran",
  "sete",
  "genova",
  "genes",
  "naples",
  "barcelona",
  "valencia",
  "alicante",
  "almeria",
  "bejaia",
  "skikda",
  "annaba",
  "tunis",
];

const stripHtml = (html: string | undefined) =>
  (html
    ? html
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "") || null;

function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

interface CommonsPage {
  title: string;
  index?: number;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

/**
 * Cherche une photo libre du navire sur Wikimedia Commons. La photo n'est gardée que si le nom du
 * fichier contient tous les mots du nom du navire ET un indice « navire » : mieux vaut aucune photo
 * qu'une mauvaise. Les photos renseignées dans le back-office priment toujours.
 */
async function searchCommons(
  name: string,
  term: string,
  hints: string[] = SHIP_HINTS,
): Promise<VesselPhoto | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${name} ${term}`,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "480",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  // Une erreur (limitation de débit 429, panne) est remontée pour ne JAMAIS être mémorisée comme « pas de photo ».
  if (!response.ok) throw new Error(`Commons : HTTP ${response.status}`);
  const body = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(body.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  const words = nameWords(name);
  if (words.length === 0) return null;

  for (const page of pages) {
    const title = normalize(page.title.replace(/^File:/i, ""));
    if (!/\.(jpe?g|png|webp)$/i.test(page.title)) continue;
    if (!words.every((word) => title.includes(word))) continue;
    if (!hints.some((hint) => title.includes(hint))) continue;
    const info = page.imageinfo?.[0];
    const url = safeHttps(info?.thumburl ?? info?.url);
    if (!info || !url) continue;
    return {
      url,
      pageUrl: safeHttps(info.descriptionurl),
      credit: stripHtml(info.extmetadata?.["Artist"]?.value),
      license: stripHtml(info.extmetadata?.["LicenseShortName"]?.value),
      source: "commons",
    };
  }
  return null;
}

/** Deux essais successifs : « ferry » puis « ship » (les résultats diffèrent d'un navire à l'autre). */
async function findCommonsPhoto(name: string): Promise<VesselPhoto | null> {
  return (await searchCommons(name, "ferry")) ?? (await searchCommons(name, "ship"));
}

function readCache(key: string): VesselPhoto | null | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { expires: number; value: VesselPhoto | null };
    if (entry.expires < Date.now()) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: VesselPhoto | null, days: number) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ expires: Date.now() + days * 86400000, value }),
    );
  } catch {
    // Stockage indisponible (navigation privée) : sans conséquence.
  }
}

/** Mots qui prouvent que la photo représente bien un port. */
const PORT_HINTS = [
  "port",
  "harbour",
  "harbor",
  "ferry",
  "terminal",
  "quai",
  "marina",
  "gare maritime",
];

/** Photo d'un port : celle du back-office, sinon une photo libre de Wikimedia Commons, sinon rien. */
export function portPhotoQuery(port: { id: string; name: string; photo_url: string | null }) {
  return queryOptions({
    queryKey: ["port-photo", port.id, port.photo_url ?? ""],
    queryFn: async (): Promise<VesselPhoto | null> => {
      const own = safeHttps(port.photo_url);
      if (own) return { url: own, pageUrl: null, credit: null, license: null, source: "batogo" };
      const cacheKey = `batogo:port-photo:${normalize(port.name)}`;
      const cached = readCache(cacheKey);
      if (cached !== undefined) return cached;
      try {
        const found =
          (await searchCommons(port.name, "port", PORT_HINTS)) ??
          (await searchCommons(port.name, "harbour ferry terminal", PORT_HINTS));
        writeCache(cacheKey, found, found ? 30 : 3);
        return found;
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled: Boolean(port.name),
  });
}

export function vesselPhotoQuery(vessel: Pick<Vessel, "id" | "name" | "photo_url">) {
  return queryOptions({
    queryKey: ["vessel-photo", vessel.id, vessel.photo_url ?? ""],
    queryFn: async (): Promise<VesselPhoto | null> => {
      const render = vesselVisual(vessel.name);
      if (render)
        return { url: render, pageUrl: null, credit: null, license: null, source: "render" };
      const own = safeHttps(vessel.photo_url);
      if (own) return { url: own, pageUrl: null, credit: null, license: null, source: "batogo" };
      const cacheKey = `batogo:vessel-photo:${normalize(vessel.name)}`;
      const cached = readCache(cacheKey);
      if (cached !== undefined) return cached;
      try {
        const found = await findCommonsPhoto(vessel.name);
        // Photo trouvée : 30 jours. Aucune photo : 3 jours (on réessaiera plus tard).
        writeCache(cacheKey, found, found ? 30 : 3);
        return found;
      } catch {
        // Erreur réseau ou limitation de débit : on ne mémorise rien et on n'affiche pas de photo.
        return null;
      }
    },
    // Une photo ne change pas : on la garde pour toute la session et on ne réessaie pas en boucle.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
