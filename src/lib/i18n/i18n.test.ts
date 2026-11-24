import { describe, expect, it } from "vitest";
import { pickLocale, dirOf } from "./config";
import { lazyConst, loadCatalog, setCurrentLocale, translate, tr } from "./translate";
import { fr } from "./messages/fr";

describe("pickLocale", () => {
  it("reste en français pour une langue pas encore ouverte", () => {
    expect(pickLocale(["en-GB"], "en", ["fr", "ar"])).toBe("fr");
  });
  it("suit la langue du téléphone quand elle est ouverte", () => {
    expect(pickLocale(["ar-DZ", "fr-FR"], null, ["fr", "ar"])).toBe("ar");
    expect(pickLocale(["de-DE", "en_US"], null, ["fr", "en"])).toBe("en");
  });
  it("donne la priorité au choix du visiteur", () => {
    expect(pickLocale(["ar-DZ"], "fr", ["fr", "ar"])).toBe("fr");
  });
  it("ignore un choix enregistré invalide ou fermé", () => {
    expect(pickLocale(["en"], "xx", ["fr", "en"])).toBe("en");
    expect(pickLocale([], "ar", ["fr"])).toBe("fr");
  });
  it("revient au français par défaut", () => {
    expect(pickLocale(undefined, undefined)).toBe("fr");
  });
});

describe("translate", () => {
  it("donne le texte français", () => {
    expect(translate("fr", "nav.map")).toBe("Carte");
  });
  it("traduit en arabe et retombe sur le français pour une langue sans dictionnaire", async () => {
    await loadCatalog("ar");
    expect(translate("ar", "nav.map")).toBe("الخريطة");
    expect(translate("en", "nav.departures")).toBe("Départs");
  });
  it("remplace les variables", () => {
    expect(translate("fr", "footer.disclaimer", { year: 2026 })).toMatch(/^© 2026 BledWay · /);
  });
  it("le sens de lecture suit la langue", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("fr")).toBe("ltr");
  });
});

describe("dictionnaire français", () => {
  it("n'a aucun texte vide", () => {
    const walk = (node: unknown): string[] =>
      typeof node === "string" ? [node] : Object.values(node as object).flatMap(walk);
    expect(walk(fr).every((text) => text.trim().length > 0)).toBe(true);
  });
});

describe("lazyConst", () => {
  it("relit une liste déclarée une fois dans la langue affichée", async () => {
    await loadCatalog("ar");
    const labels = lazyConst(() => [tr("nav.map"), tr("nav.news")]);
    setCurrentLocale("fr");
    expect(labels.map((x) => x)).toEqual(["Carte", "Actualités"]);
    expect(Array.isArray(labels)).toBe(true);
    setCurrentLocale("ar");
    expect(labels[0]).toBe("الخريطة");
    expect([...labels]).toHaveLength(2);
    setCurrentLocale("fr");
  });
});

describe("pluriel français", () => {
  it("garde « s » en français et le retire dans les autres langues", async () => {
    await loadCatalog("ar");
    expect(translate("fr", "footer.disclaimer", { year: "s" })).toMatch(/^© s BledWay/);
    expect(translate("ar", "footer.disclaimer", { year: "s" })).not.toMatch(/\bs\b/);
  });
});

describe("noms de lieux", () => {
  it("traduit un port passé en variable et retourne la flèche en arabe", async () => {
    const { localizePlace } = await import("./places");
    expect(localizePlace("ar", "Béjaïa")).toBe("بجاية");
    expect(localizePlace("ar", "Marseille → Alger")).toBe("مرسيليا ← الجزائر العاصمة");
    expect(localizePlace("fr", "Marseille")).toBe("Marseille");
    expect(localizePlace("ar", "Inconnu")).toBe("Inconnu");
  });
});
