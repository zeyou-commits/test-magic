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
const links = [
  ["Carte des ferries", "/"],
  ["Horaires", "/horaires"],
  ["Ports", "/ports"],
  ["Lignes", "/lignes"],
  ["Compagnies", "/compagnies"],
  ["Guide et dossiers", "/guide"],
  ["Véhicules de moins de trois ans", "/vehicules-moins-3-ans"],
  ["Voyage en Algérie", "/voyage-algerie"],
  ["Dossiers bateaux", "/bateaux"],
  ["Points de covoiturage", "/covoiturage"],
  ["Simulateurs", "/simulateurs"],
  ["Méthode et sources", "/methode-editoriale"],
];
await writeFile(
  new URL("public/llms.txt", root),
  `# Batogo\n\n> Information indépendante pour les ferries Europe–Algérie et la préparation du voyage.\n\n## Pages principales\n${links.map(([label, path]) => `- [${label}](${origin}${path})`).join("\n")}\n\n## Portée des informations\nLes horaires et affectations se confirment auprès des compagnies. Les formalités se confirment auprès des autorités compétentes. Les simulateurs utilisent les données saisies par le visiteur et ne certifient ni prix ni éligibilité.\n\nCe fichier est un sommaire documentaire facultatif. Il ne garantit aucune visibilité dans les moteurs de recherche ou les réponses d'IA.\n`,
);
console.log("robots.txt et llms.txt générés pour", origin);
