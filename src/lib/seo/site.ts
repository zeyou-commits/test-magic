import config from "../../../seo.config.json";

const origin = new URL(config.siteUrl);
if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error(
    "seo.config.json : siteUrl doit être une origine HTTPS, sans chemin ni paramètres.",
  );
}
export const SITE_URL = origin.origin;
export const EDITORIAL_DATE = config.editorialDate;
export const absoluteUrl = (path = "/") => new URL(path, `${SITE_URL}/`).href;
export const jsonLdString = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const SHARE_IMAGE = { path: "/bledway-brand.png", width: "2172", height: "724" };
const BRAND_SUFFIX = " | BledWay";
const MAX_TITLE = 65;
const MAX_DESCRIPTION = 160;

/** Retire la marque d'un titre trop long : c'est le sujet qui doit rester visible. */
export function fitTitle(title: string) {
  return title.length > MAX_TITLE && title.endsWith(BRAND_SUFFIX)
    ? title.slice(0, -BRAND_SUFFIX.length)
    : title;
}

/** Coupe une description trop longue sur un mot entier. */
export function fitDescription(text: string) {
  if (text.length <= MAX_DESCRIPTION) return text;
  const cut = text.slice(0, MAX_DESCRIPTION - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.]+$/, "")}…`;
}

export function seoHead(rawTitle: string, rawDescription: string, path: string, article = false) {
  const url = absoluteUrl(path);
  const title = fitTitle(rawTitle);
  const description = fitDescription(rawDescription);
  const image = absoluteUrl(SHARE_IMAGE.path);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      { property: "og:image:width", content: SHARE_IMAGE.width },
      { property: "og:image:height", content: SHARE_IMAGE.height },
      { property: "og:image:alt", content: "BledWay, le Waze du ferry Europe–Maghreb" },
      { property: "og:url", content: url },
      { property: "og:type", content: article ? "article" : "website" },
      { property: "og:locale", content: "fr_FR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: image },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Accueil", path: "/" }, ...items].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export const displayDate = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
