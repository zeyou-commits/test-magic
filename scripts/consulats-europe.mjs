// Génère src/content/consulatsEurope.data.ts : ambassades et consulats d'Algérie dans les pays
// d'Europe où vivent les voyageurs (hors France, détaillée par département dans consulats.ts).
//   node scripts/consulats-europe.mjs
// Source : ministère algérien des Affaires étrangères (mfa.gov.dz, « Représentations à l'étranger »).
// Coordonnées des adresses : Photon (OpenStreetMap), pour classer les postes du plus proche au plus loin.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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

const COUNTRIES = {
  BE: "Belgique",
  ES: "Espagne",
  IT: "Italie",
  DE: "Allemagne",
  CH: "Suisse",
  NL: "Pays-Bas",
  GB: "Royaume-Uni",
  LU: "Luxembourg",
  AT: "Autriche",
  PT: "Portugal",
  SE: "Suède",
  DK: "Danemark",
  NO: "Norvège",
  IE: "Irlande",
};
const UA = { headers: { Accept: "application/json", "User-Agent": "bledway-consulats/1.0" } };
const TODAY = new Date().toISOString().slice(0, 10);

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const ENTITIES = {
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  icirc: "î",
  ucirc: "û",
  ugrave: "ù",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  Eacute: "É",
  laquo: "«",
  raquo: "»",
  ndash: "–",
  mdash: "—",
  ordm: "º",
  deg: "°",
  szlig: "ß",
  ntilde: "ñ",
  iacute: "í",
  oacute: "ó",
  aacute: "á",
  uacute: "ú",
};
const clean = (s) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/[؀-ۿݐ-ݿ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, " : ")
    .trim();

function parse(html) {
  const posts = [];
  let current = null;
  for (const [, inner] of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const strong = /<strong>/.test(inner);
    const line = clean(inner);
    if (!line) continue;
    if (strong && /ambassade|consulat|section consulaire|agence consulaire/i.test(line)) {
      current = {
        name: line.replace(/\s*:\s*$/, "").replace(/Lisbone$/, "Lisbonne"),
        address: [],
        phone: "",
        email: "",
        site: "",
      };
      posts.push(current);
      continue;
    }
    if (!current) continue;
    if (/^t[ée]l/i.test(line)) current.phone ||= line.replace(/^t[ée]l[ée]?(phone)?\s*:?\s*/i, "");
    else if (/^fax/i.test(line)) continue;
    else if (/@/.test(line) && !/\s/.test(line.replace(/\s*\/\s*/g, ""))) current.email ||= line;
    else if (/^(https?:\/\/|www\.)/i.test(line))
      current.site ||= line.startsWith("http") ? line : `https://${line}`;
    else if (/@/.test(line)) current.email ||= line.split(/\s/)[0];
    else current.address.push(line);
  }
  return (
    posts
      .filter((p) => /consulat|section consulaire|ambassade/i.test(p.name))
      // Une adresse par poste : la suite (autre mission, autre ville) n'est pas la sienne.
      .map((p) => ({
        ...p,
        address: p.address
          .join(", ")
          .split(/, (?:Mission|Représentation) /)[0]
          .replace(/\.$/, ""),
      }))
  );
}

async function geocode(address, cc) {
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");
  let data = null;
  for (let attempt = 0; attempt < 1 && !data; attempt++) {
    try {
      const res = await fetch(url, { ...UA, signal: AbortSignal.timeout(8000) });
      if (res.ok) data = await res.json();
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!data) return null;
  const feature = (data.features ?? []).find(
    (f) => f.properties?.countrycode?.toUpperCase() === cc,
  );
  const c = feature?.geometry?.coordinates;
  return c ? [Number(c[0].toFixed(4)), Number(c[1].toFixed(4))] : null;
}

const out = [];
for (const [cc, name] of Object.entries(COUNTRIES)) {
  const res = await fetch(`https://www.mfa.gov.dz/api/ambassies/api?countries=${cc}`, UA);
  if (!res.ok) {
    console.warn("indisponible", cc, res.status);
    continue;
  }
  const list = await res.json();
  const posts = list.flatMap((entry) => {
    const found = parse(entry.infos ?? "");
    // Les cartes intégrées par le ministère, dans l'ordre des postes : !2d longitude !3d latitude.
    const maps = [...(entry.maps ?? "").matchAll(/!2d(-?[\d.]+)!3d(-?[\d.]+)/g)].map((m) => [
      Number(Number(m[1]).toFixed(4)),
      Number(Number(m[2]).toFixed(4)),
    ]);
    if (maps.length === found.length) found.forEach((post, i) => (post.point = maps[i]));
    return found;
  });
  for (const post of posts) {
    if (post.point) continue;
    post.point = known.get(post.name) ?? (post.address ? await geocode(post.address, cc) : null);
    if (post.point) continue;
    // Adresse introuvable : la ville du poste suffit pour classer par distance.
    const city = post.name.match(/ à (.+)$/)?.[1];
    const LOCAL = {
      Barcelone: "Barcelona",
      Naples: "Napoli",
      Berne: "Bern",
      Lisbone: "Lisboa",
      Stockholm: "Stockholm",
      Oslo: "Oslo",
    };
    for (let attempt = 0; !post.point && city && attempt < 1; attempt++) {
      await new Promise((r) => setTimeout(r, 1200));
      post.point = await geocode(LOCAL[city] ?? city, cc);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  out.push({ country: cc, name, posts });
  console.log(cc, posts.map((p) => `${p.name}${p.point ? "" : " (sans coordonnées)"}`).join(" | "));
}

writeFileSync(
  DATA,
  `// Généré par scripts/consulats-europe.mjs le ${TODAY} : ne pas modifier à la main.\n` +
    `import type { EuropeCountryPosts } from "./consulatsEurope";\n\n` +
    `export const CONSULATS_EUROPE_CHECKED = ${JSON.stringify(TODAY)};\n\n` +
    `export const europePosts: EuropeCountryPosts[] = ${JSON.stringify(out, null, 2)};\n`,
);
