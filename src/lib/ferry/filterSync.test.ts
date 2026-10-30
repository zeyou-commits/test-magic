import { describe, expect, it } from "vitest";
import { counterFilters, matchesTraffic, syncFilters, vesselCompanyIds } from "./filterSync";

describe("compteurs de la carte", () => {
  const filters = { ...emptyFilters, vesselId: "a", companyId: "A" };
  it("ignorent le navire choisi et la compagnie posée par ce choix", () => {
    expect(counterFilters(filters, "A")).toMatchObject({ vesselId: null, companyId: null });
  });
  it("respectent une compagnie choisie par l'utilisateur", () => {
    expect(counterFilters(filters, null)).toMatchObject({ vesselId: null, companyId: "A" });
  });
});
import { emptyFilters, type Departure, type Port, type RouteLine, type Vessel } from "./types";
const vessels = [
  { id: "a", company_id: "A" },
  { id: "b", company_id: "B" },
] as Vessel[];
const departures = [
  { id: "d", vessel_id: "a", company_id: "A", route_id: "r", status: "scheduled" },
] as Departure[];
const routes = [{ id: "r", departure_port_id: "from", arrival_port_id: "to" }] as RouteLine[];
const ports = [
  { id: "from", name: "Sète", country_code: "FR" },
  { id: "to", name: "Béjaïa", country_code: "DZ" },
] as Port[];
describe("Sélection partagée compagnie et navire", () => {
  it("retire le navire incompatible après changement de compagnie", () => {
    const current = { ...emptyFilters, companyId: "A", vesselId: "a" };
    expect(syncFilters(current, { ...current, companyId: "B" }, vessels, departures)).toMatchObject(
      { companyId: "B", vesselId: null },
    );
  });
  it("conserve un navire compatible", () => {
    const current = { ...emptyFilters, vesselId: "a" };
    expect(syncFilters(current, { ...current, companyId: "A" }, vessels, departures).vesselId).toBe(
      "a",
    );
  });
  it("sélectionner un navire choisit sa compagnie", () => {
    expect(
      syncFilters(emptyFilters, { ...emptyFilters, vesselId: "b" }, vessels, departures),
    ).toMatchObject({ companyId: "B", vesselId: "b" });
  });
  it("changer de navire adapte la compagnie", () => {
    const current = { ...emptyFilters, companyId: "A", vesselId: "a" };
    expect(syncFilters(current, { ...current, vesselId: "b" }, vessels, departures)).toMatchObject({
      companyId: "B",
      vesselId: "b",
    });
  });
  it("retirer le filtre compagnie retire également le navire", () => {
    const current = { ...emptyFilters, companyId: "A", vesselId: "a" };
    expect(
      syncFilters(current, { ...current, companyId: null }, vessels, departures).vesselId,
    ).toBeNull();
  });
  it("respecte une compagnie d'affrètement déjà sélectionnée", () => {
    const charter = [...departures, { ...departures[0]!, company_id: "B" }];
    expect(
      syncFilters(
        { ...emptyFilters, companyId: "B" },
        { ...emptyFilters, companyId: "B", vesselId: "a" },
        vessels,
        charter,
      ).companyId,
    ).toBe("B");
  });
  it("n'ajoute pas une compagnie à partir d'une traversée annulée", () => {
    expect(
      vesselCompanyIds("a", vessels, [{ ...departures[0]!, company_id: "B", status: "cancelled" }]),
    ).toEqual(["A"]);
  });
  it("la carte et l'accueil utilisent le même contexte de compagnie, navire et ports", () => {
    expect(
      matchesTraffic(departures[0]!, routes, ports, {
        ...emptyFilters,
        companyId: "A",
        vesselId: "a",
        departurePortIds: ["from"],
      }),
    ).toBe(true);
    for (const patch of [
      { companyId: "B" },
      { vesselId: "b" },
      { arrivalPortIds: ["other"] },
      { search: "Marseille" },
    ])
      expect(matchesTraffic(departures[0]!, routes, ports, { ...emptyFilters, ...patch })).toBe(
        false,
      );
  });
});
