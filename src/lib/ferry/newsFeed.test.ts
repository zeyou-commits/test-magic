import { describe, expect, it } from "vitest";
import { isPublicNews, newsIdFromSlug, newsPath } from "./newsFeed";

const id = "3ed1cf29-b8a5-4ee4-9b89-fee896950f88";

describe("fil d'actualités", () => {
  it("écarte ce qui n'a pas de source sûre, et les essais", () => {
    const base = {
      title: "Agence fermée",
      summary: "Inondations",
      source_url: "https://a.example/x",
    };
    expect(isPublicNews(base)).toBe(true);
    expect(isPublicNews({ ...base, source_url: null })).toBe(false);
    expect(isPublicNews({ ...base, source_url: "http://a.example" })).toBe(false);
    expect(isPublicNews({ ...base, title: "Information test" })).toBe(false);
    expect(isPublicNews({ ...base, summary: "Test notification" })).toBe(false);
  });

  it("donne une adresse lisible, dont l'identifiant se relit", () => {
    const path = newsPath({ id, title: "Agence Corsica Linea de Marseille fermée !" });
    expect(path).toBe(`/actualites/agence-corsica-linea-de-marseille-fermee-${id}`);
    expect(newsIdFromSlug(path.replace("/actualites/", ""))).toBe(id);
    expect(newsIdFromSlug("sans-identifiant")).toBeNull();
  });
});
