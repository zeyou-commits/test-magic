// Génère src/content/consulatsEurope.data.ts : ambassades et consulats d'Algérie dans les pays
// d'Europe où vivent les voyageurs (hors France, détaillée par département dans consulats.ts).
//   node scripts/consulats-europe.mjs
// Source : ministère algérien des Affaires étrangères (mfa.gov.dz, « Représentations à l'étranger »).
// Coordonnées : cartes du ministère, sinon Photon (OpenStreetMap), pour classer du plus proche au
// plus loin. Le relevé est dans src/lib/reference/sources.ts, partagé avec l'admin.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fetchEuropePosts } from "../src/lib/reference/sources.ts";

// Coordonnées déjà trouvées : on ne redemande que les nouvelles adresses.
const DATA = "src/content/consulatsEurope.data.ts";
const known = new Map();
if (existsSync(DATA)) {
  const text = readFileSync(DATA, "utf8");
  const list = JSON.parse(
    text
      .slice(text.indexOf("= [") + 2)
      .trim()
      .replace(/;$/, ""),
  );
  for (const c of list) for (const p of c.posts) if (p.point) known.set(p.name, p.point);
}

const TODAY = new Date().toISOString().slice(0, 10);
const out = await fetchEuropePosts(known, (m) => console.warn(m));
for (const c of out) console.log(c.country, c.posts.map((p) => p.name).join(" | "));

writeFileSync(
  DATA,
  `// Généré par scripts/consulats-europe.mjs le ${TODAY} : ne pas modifier à la main.\n` +
    `import type { EuropeCountryPosts } from "./consulatsEurope";\n\n` +
    `export const CONSULATS_EUROPE_CHECKED = ${JSON.stringify(TODAY)};\n\n` +
    `export const europePosts: EuropeCountryPosts[] = ${JSON.stringify(out, null, 2)};\n`,
);
