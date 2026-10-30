import { describe, expect, it } from "vitest";
import { searchCatalog } from "./catalogSearch";

const source = {
  vessels: [
    { id: "t", name: "Tassili II", company_id: "af", status: "active" },
    { id: "a", name: "GNV Auriga", company_id: "gnv", status: "active" },
    { id: "x", name: "Tassili I", company_id: "af", status: "inactive" },
  ],
  companies: [
    { id: "af", name: "Algérie Ferries", status: "active" },
    { id: "gnv", name: "GNV", status: "active" },
  ],
  ports: [
    { id: "alg", name: "Alger", country_name: "Algérie", status: "active" },
    { id: "bej", name: "Béjaïa", country_name: "Algérie", status: "active" },
    { id: "mrs", name: "Marseille", country_name: "France", status: "active" },
  ],
  routes: [{ id: "r", departure_port_id: "alg", arrival_port_id: "mrs" }],
  departures: [
    {
      route_id: "r",
      company_id: "af",
      vessel_id: "t",
      departure_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: "scheduled",
    },
  ],
};

describe("recherche navire, compagnie, port, liaison", () => {
  it("trouve sans accents ni majuscules, et ignore un navire archivé", () => {
    expect(searchCatalog("TASSILI", source).map((r) => r.id)).toEqual(["t"]);
    expect(searchCatalog("bejaia", source).map((r) => r.id)).toEqual(["bej"]);
  });
  it("cherche une liaison par ses deux ports", () => {
    expect(searchCatalog("alger marseille", source).find((r) => r.kind === "route")?.id).toBe("r");
  });
  it("dit clairement si rien n'est programmé, sans masquer la fiche", () => {
    expect(searchCatalog("auriga", source)[0]?.hint).toContain("Aucune traversée programmée");
    expect(searchCatalog("tassili", source)[0]?.hint).toContain("1 à venir");
  });
  it("attend au moins 2 lettres", () => {
    expect(searchCatalog("a", source)).toEqual([]);
  });
});
