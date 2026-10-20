import { absoluteUrl } from "./site";
export const escapeXml = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (char) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char,
  );
export function sitemapXml(entries: { path: string; lastmod: string | null }[]) {
  const seen = new Set<string>();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .filter((e) => {
      if (seen.has(e.path)) return false;
      seen.add(e.path);
      return true;
    })
    .map(({ path, lastmod }) => {
      const date = lastmod?.slice(0, 10);
      return `  <url><loc>${escapeXml(absoluteUrl(path))}</loc>${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `<lastmod>${date}</lastmod>` : ""}</url>`;
    })
    .join("\n")}\n</urlset>`;
}
export function xmlResponse(body: string, maxAge = 3600) {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "x-content-type-options": "nosniff",
    },
  });
}
