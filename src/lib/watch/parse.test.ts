import { describe, expect, it } from "vitest";
import {
  articleMeta,
  isRecent,
  latestPostSitemap,
  matchesKeywords,
  pageLinks,
  rssEntries,
  sitemapEntries,
} from "../../../supabase/functions/watch-collect/parse";

describe("collecte de la veille", () => {
  it("prend le sitemap d'articles le plus récent", () => {
    const index = `<sitemap><loc>https://a.test/post-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://a.test/post-sitemap2.xml</loc></sitemap>
      <sitemap><loc>https://a.test/page-sitemap.xml</loc></sitemap>`;
    expect(latestPostSitemap(index)).toBe("https://a.test/post-sitemap2.xml");
    expect(latestPostSitemap("<sitemap><loc>https://a.test/page-sitemap.xml</loc></sitemap>")).toBeNull();
  });
  it("lit les entrées d'un sitemap", () => {
    expect(
      sitemapEntries(
        "<url><loc>https://a.test/x/</loc><lastmod>2026-10-29T10:00:00+00:00</lastmod></url><url><loc>https://a.test/y/</loc></url>",
      ),
    ).toEqual([
      { url: "https://a.test/x/", lastmod: "2026-10-29T10:00:00+00:00" },
      { url: "https://a.test/y/", lastmod: null },
    ]);
  });
  it("lit un flux RSS et ignore les liens non sécurisés", () => {
    const xml = `<item><title><![CDATA[Report d&#8217;une travers&eacute;e]]></title><link>https://a.test/r/</link>
      <pubDate>Wed, 28 Oct 2026 07:51:45 +0000</pubDate><description><![CDATA[<p>Détails</p>]]></description></item>
      <item><title>Vieux</title><link>http://a.test/v/</link></item>`;
    const items = rssEntries(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://a.test/r/",
      excerpt: "Détails",
      publishedAt: "2026-10-28T07:51:45.000Z",
    });
  });
  it("se fie à la date publiée par la page, jamais à un « il y a X »", () => {
    const article = articleMeta(
      "https://a.test/a/",
      `<title>Secours</title><meta property="og:title" content="Algérie Ferries : report &amp; retard">
       <meta content="Résumé" property="og:description"><meta property="article:published_time" content="2026-10-28T07:51:45+00:00">il y a 12 minutes`,
    );
    expect(article).toEqual({
      url: "https://a.test/a/",
      title: "Algérie Ferries : report & retard",
      excerpt: "Résumé",
      publishedAt: "2026-10-28T07:51:45.000Z",
    });
  });
  it("cherche les mots-clés en début de mot", () => {
    expect(matchesKeywords("Départ d'Oran retardé", ["oran"])).toBe(true);
    expect(matchesKeywords("Lecture du Coran", ["oran"])).toBe(false);
    expect(matchesKeywords("Le rapport de la banque", ["port d"])).toBe(false);
    expect(matchesKeywords("Le port d'Alger", ["port d"])).toBe(true);
    expect(matchesKeywords("N'importe quoi", [])).toBe(true);
  });
  it("écarte les articles anciens, futurs ou sans date", () => {
    const now = Date.parse("2026-10-31T10:00:00Z");
    expect(isRecent("2026-10-28T00:00:00Z", now)).toBe(true);
    expect(isRecent("2026-09-01T00:00:00Z", now)).toBe(false);
    expect(isRecent("2026-11-05T00:00:00Z", now)).toBe(false);
    expect(isRecent(null, now)).toBe(false);
  });
  it("lit les annonces d'une compagnie sans flux, avec leur date", () => {
    const html = `<a href="/actualites/a">A</a><a href="/actualites/a#x">A</a><a href="/contact">C</a>
      <a href="https://autre.test/actualites/b">B</a><a href="/actualites/">Toutes</a>`;
    expect(pageLinks("https://c.test/actualites", html)).toEqual(["https://c.test/actualites/a"]);
    const article = articleMeta(
      "https://c.test/actualites/a",
      '<title>Report</title><time datetime="2026-10-30T10:00:00+00:00">30 octobre</time>',
    );
    expect(article?.publishedAt).toBe("2026-10-30T10:00:00.000Z");
  });
});
