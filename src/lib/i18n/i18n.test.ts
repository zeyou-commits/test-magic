import { describe, expect, it } from "vitest";
import { pickLocale, dirOf } from "./config";
import { translate } from "./translate";
import { fr } from "./messages/fr";

describe("pickLocale", () => {
  it("reste en français tant que seul le français est ouvert", () => {
    expect(pickLocale(["ar-DZ", "en-GB"], "ar")).toBe("fr");
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
  it("retombe sur le français pour une langue sans dictionnaire", () => {
    expect(translate("ar", "nav.departures")).toBe("Départs");
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
