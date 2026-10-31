// Lecture des sitemaps, flux RSS et métadonnées d'articles. Aucune dépendance : testable hors Supabase.
export interface FoundArticle {
  url: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);
}

const clean = (text: string) =>
  decodeEntities(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** Le sitemap d'articles le plus récent : le dernier numéro de `post-sitemap`. */
export function latestPostSitemap(index: string): string | null {
  const urls = [...index.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1]!)
    .filter((url) => /post-sitemap\d*\.xml$/.test(url));
  const rank = (url: string) => Number(/post-sitemap(\d*)\.xml$/.exec(url)?.[1] || 1);
  return urls.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

export function sitemapEntries(xml: string): { url: string; lastmod: string | null }[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap((match) => {
    const url = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(match[1]!)?.[1];
    return url
      ? [{ url, lastmod: /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(match[1]!)?.[1] ?? null }]
      : [];
  });
}

/** Page d'annonces d'une compagnie sans flux : les liens vers ses articles, sous la même adresse. */
export function pageLinks(pageUrl: string, html: string) {
  const page = new URL(pageUrl);
  const prefix = `${page.pathname.replace(/\/$/, "")}/`;
  const links = [...html.matchAll(/href=["']([^"'#?]+)["']/gi)].flatMap((match) => {
    try {
      const url = new URL(match[1]!, page);
      return url.origin === page.origin && url.pathname.startsWith(prefix) && url.pathname !== prefix
        ? [url.href]
        : [];
    } catch {
      return [];
    }
  });
  return [...new Set(links)];
}

export function rssEntries(xml: string): FoundArticle[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap((match) => {
    const body = match[1]!;
    const pick = (tag: string) =>
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body)?.[1] ?? null;
    const url = clean(pick("link") ?? "");
    const title = clean(pick("title") ?? "");
    const date = pick("pubDate");
    const parsed = date ? Date.parse(clean(date)) : NaN;
    if (!url.startsWith("https://") || !title) return [];
    return [
      {
        url,
        title,
        excerpt: clean(pick("description") ?? "").slice(0, 600) || null,
        publishedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
      },
    ];
  });
}

/** Titre, résumé et date publiés par la page : jamais son texte complet. */
export function articleMeta(url: string, html: string): FoundArticle | null {
  const meta = (property: string) => {
    const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
      .map((match) => match[0])
      .find((item) => new RegExp(`(?:property|name)=["']${property}["']`, "i").test(item));
    return tag ? (/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? null) : null;
  };
  const title = clean(meta("og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  if (!title) return null;
  const published = Date.parse(
    meta("article:published_time") ?? /<time\b[^>]*datetime=["']([^"']+)["']/i.exec(html)?.[1] ?? "",
  );
  return {
    url,
    title,
    excerpt: clean(meta("og:description") ?? meta("description") ?? "").slice(0, 600) || null,
    publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
  };
}

/** Mot-clé en début de mot : « port d » ne trouve pas « rapport de », « oran » ne trouve pas « Coran ». */
export function matchesKeywords(text: string, keywords: string[]) {
  if (!keywords.length) return true;
  const normalize = (value: string) => value.toLowerCase().normalize("NFC");
  const haystack = normalize(text);
  return keywords.some((keyword) => {
    const needle = normalize(keyword);
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      if (at === 0 || !/\p{L}/u.test(haystack[at - 1]!)) return true;
      at = haystack.indexOf(needle, at + 1);
    }
    return false;
  });
}

/** Une vieille annonce n'est jamais une actualité : sans date fiable, l'article est écarté. */
export function isRecent(publishedAt: string | null, now: number, maxDays = 14) {
  if (!publishedAt) return false;
  const at = Date.parse(publishedAt);
  return Number.isFinite(at) && at <= now + 3_600_000 && now - at <= maxDays * 86_400_000;
}
