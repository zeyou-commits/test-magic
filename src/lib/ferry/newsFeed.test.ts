import { describe, expect, it } from "vitest";
import { isPublicNews, newsCompanyIds, newsIdFromSlug, newsPath } from "./newsFeed";

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

  it("publie les annonces de l'équipe BledWay, même sans source et même en bêta test", () => {
    const annonce = {
      title: "BledWay est en bêta test",
      summary: "Merci de nous signaler ce qui coince.",
      source_url: null,
      origin: "bledway" as const,
    };
    expect(isPublicNews(annonce)).toBe(true);
    expect(isPublicNews({ ...annonce, summary: "À vérifier : départs à contrôler" })).toBe(false);
  });

  it("donne une adresse lisible, dont l'identifiant se relit", () => {
    const path = newsPath({ id, title: "Agence Corsica Linea de Marseille fermée !" });
    expect(path).toBe(`/actualites/agence-corsica-linea-de-marseille-fermee-${id}`);
    expect(newsIdFromSlug(path.replace("/actualites/", ""))).toBe(id);
    expect(newsIdFromSlug("sans-identifiant")).toBeNull();
  });
});

describe("newsCompanyIds", () => {
  const companies = [
    { id: "af", name: "Algérie Ferries" },
    { id: "gnv", name: "GNV" },
    { id: "armas", name: "Naviera Armas - Trasmediterránea" },
  ];
  const item = (title: string) => ({ title, company_ids: [] as string[], vessel_id: null });
  it("reconnaît une compagnie nommée dans le titre, accents ou non", () => {
    expect(newsCompanyIds(item("Algérie Ferries vendrait des places"), [], companies)).toEqual(["af"]);
    expect(newsCompanyIds(item("Algerie Ferries : retard"), [], companies)).toEqual(["af"]);
    expect(newsCompanyIds(item("Trasmediterránea renforce Almería"), [], companies)).toEqual(["armas"]);
  });
  it("ne confond pas un nom avec un bout de mot", () => {
    expect(newsCompanyIds(item("Les GNVL arrivent"), [], companies)).toEqual([]);
  });
  it("garde en priorité le rattachement fait par l'équipe", () => {
    expect(
      newsCompanyIds({ title: "GNV", company_ids: ["af"], vessel_id: null }, [], companies),
    ).toEqual(["af"]);
  });
});
