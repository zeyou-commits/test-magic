import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const config = JSON.parse(await readFile(new URL("seo.config.json", root), "utf8"));
const url = new URL(config.siteUrl);
if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash)
  throw new Error("siteUrl doit être une origine HTTPS sans chemin ni paramètres");
const origin = url.origin;
// Les pages privées restent explorables pour que leur meta noindex soit lue.
await writeFile(
  new URL("public/robots.txt", root),
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`,
);
// llms.txt est servi par la route /llms.txt, à partir des données publiées.
console.log("robots.txt généré pour", origin);
