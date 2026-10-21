import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Render the actual deployment function: a successful Vite compilation alone
// does not prove that SSR points to the production browser bundle.
export function browserAssets(html) {
  assert(!html.includes("/@id/"), "Le HTML contient une entrée Vite de développement.");
  assert(!html.includes("/@vite/client"), "Le HTML contient le client HMR de Vite.");
  assert(
    !html.includes("virtual:tanstack-start-dev-client-entry"),
    "Entrée TanStack de développement.",
  );
  assert(html.includes("bw-header"), "L’accueil compilé ne contient pas la refonte BledWay.");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  const styles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)].map((match) => match[1]);
  assert(
    scripts.some((src) => src.startsWith("/assets/")),
    "Bundle navigateur absent.",
  );
  assert(
    styles.some((src) => src.startsWith("/assets/")),
    "Feuille de style absente.",
  );
  return [...new Set([...scripts, ...styles].filter((src) => src.startsWith("/assets/")))];
}

async function checkBuild() {
  const output = new URL("../.vercel/output/", import.meta.url);
  const config = JSON.parse(await readFile(new URL("config.json", output), "utf8"));
  assert.equal(config.version, 3, "Sortie Vercel Build Output API absente.");
  const app = (await import(new URL("functions/__server.func/index.mjs", output).href)).default;
  const response = await app.fetch(new Request("http://localhost/"));
  assert.equal(response.status, 200, "L’accueil de production ne répond pas 200.");
  const assets = browserAssets(await response.text());
  for (const asset of assets) {
    await access(new URL(`static${asset}`, output));
  }
  console.log(
    `Production Vercel vérifiée : accueil 200, refonte et ${assets.length} ressources présentes.`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await checkBuild();
}
