import { describe, expect, it } from "vitest";
import { articles } from "@/content/articles";
import { vesselDossiers } from "@/content/vessels";
import { carpoolPlaces } from "@/content/carpool";
import { toolsCatalog } from "@/content/tools";
import { sources } from "@/content/sources";
import { staticSitemapEntries } from "./paths";
import { fitDescription, fitTitle, jsonLdString, seoHead, SITE_URL } from "./site";
import { benchmarkFor, generalFaq, lineFaq } from "./answers";
import { llmsText } from "./llms";
import { escapeXml, sitemapXml } from "./sitemap";
describe("Cohérence du maillage éditorial et des sources", () => {
  it("donne un slug unique, des sections et des références résolues à chaque dossier", () => {
    expect(new Set(articles.map((a) => a.slug)).size).toBe(articles.length);
    const slugs = new Set(articles.map((a) => a.slug));
    for (const a of articles) {
      expect(a.sections.length).toBeGreaterThanOrEqual(3);
      expect(new Set(a.sections.map((s) => s.id)).size).toBe(a.sections.length);
      a.sources.forEach((id) => expect(sources[id], `${a.slug} : ${id}`).toBeDefined());
      a.related.forEach((slug) => expect(slugs.has(slug), `${a.slug} → ${slug}`).toBe(true));
      if (a.tool) expect(toolsCatalog.some((t) => t.slug === a.tool)).toBe(true);
    }
    toolsCatalog.forEach((t) => expect(slugs.has(t.guide)).toBe(true));
    vesselDossiers.forEach((v) => v.sources.forEach((id) => expect(sources[id]).toBeDefined()));
    carpoolPlaces.forEach((p) => expect(sources[p.source]).toBeDefined());
  });
  it("ne publie aucune URL privée dans le sitemap statique", () => {
    const paths = staticSitemapEntries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some((p) => /^\/(auth|admin|compte)(\/|$)/.test(p))).toBe(false);
    for (const a of articles) expect(paths).toContain(`/guide/${a.slug}`);
  });
});
describe("Encodage et canonical", () => {
  it("construit un canonical absolu et des métadonnées cohérentes", () => {
    const head = seoHead("Un titre", "Une description", "/guide");
    expect(head.links[0]?.href).toBe(`${SITE_URL}/guide`);
    expect(head.meta).toContainEqual({ property: "og:url", content: `${SITE_URL}/guide` });
  });
  it("échappe le XML et empêche une fermeture de script JSON-LD", () => {
    expect(escapeXml('A&B <x> "')).toBe("A&amp;B &lt;x&gt; &quot;");
    const encoded = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(encoded).not.toContain("</script>");
    expect(JSON.parse(encoded).name).toContain("</script>");
  });
  it("déduplique les URL et ne fabrique pas une date de modification", () => {
    const xml = sitemapXml([
      { path: "/guide", lastmod: null },
      { path: "/guide", lastmod: "2026-10-17" },
    ]);
    expect(xml.match(/<url>/g)?.length).toBe(1);
    expect(xml).not.toContain("<lastmod>");
  });
});

describe("Métadonnées et réponses factuelles", () => {
  const ports = [
    { id: "a", slug: "marseille", name: "Marseille", country_name: "France" },
    { id: "b", slug: "alger", name: "Alger", country_name: "Algérie" },
  ];
  const routes = [
    {
      slug: "marseille-alger",
      departure_port_id: "a",
      arrival_port_id: "b",
      typical_duration_minutes: 1320,
      company_ids: ["c"],
    },
  ];
  const companies = [{ id: "c", name: "Compagnie Test" }];
  it("garde des titres et descriptions courts, avec une image de partage absolue", () => {
    expect(fitTitle(`${"x".repeat(70)} | BledWay`)).toBe("x".repeat(70));
    expect(fitTitle("Court | BledWay")).toBe("Court | BledWay");
    expect(fitDescription("mot ".repeat(60)).length).toBeLessThanOrEqual(160);
    const image = seoHead("T", "D", "/").meta.find((m) => m.property === "og:image");
    expect(image?.content).toBe(`${SITE_URL}/bledway-brand.png`);
  });
  it("présente durées et prix comme des estimations, sans statut Vérifié", () => {
    const faq = lineFaq({
      from: "Marseille",
      to: "Alger",
      fromSlug: "marseille",
      toSlug: "alger",
      minutes: 1320,
      operators: ["Compagnie Test"],
      hasReverse: false,
    });
    const text = JSON.stringify([faq, generalFaq(ports, routes, companies)]);
    expect(text).toContain("environ 22 h");
    expect(text).toContain("estimation");
    expect(text).toContain("repère de 4 h");
    expect(text).not.toMatch(/undefined|NaN/);
    expect(benchmarkFor("marseille", "alger")?.withCar).toBeGreaterThan(0);
  });
  it("n'invente pas de prix pour une ligne sans repère", () => {
    const faq = lineFaq({
      from: "A",
      to: "B",
      fromSlug: "a",
      toSlug: "b",
      minutes: null,
      operators: [],
      hasReverse: false,
    });
    expect(faq.some((item) => item.a.includes("€"))).toBe(false);
    expect(faq.some((item) => item.q.startsWith("Combien de temps"))).toBe(false);
  });
  it("sert un llms.txt au nom de BledWay, même sans la base", () => {
    expect(llmsText(null)).toContain("# BledWay");
    expect(llmsText(null)).not.toContain("Batogo");
    const full = llmsText({ ports, routes, companies });
    expect(full).toContain("Marseille → Alger");
    expect(full).toContain(`${SITE_URL}/lignes/marseille-alger`);
  });
});
