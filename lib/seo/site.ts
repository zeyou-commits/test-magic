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

export function seoHead(title: string, description: string, path: string, article = false) {
  const url = absoluteUrl(path);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: article ? "article" : "website" },
      { property: "og:locale", content: "fr_FR" },
      { name: "twitter:card", content: "summary" },
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
