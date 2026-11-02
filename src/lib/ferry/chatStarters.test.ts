import { describe, expect, it } from "vitest";
import { fillStarter, startersFor, type Starter } from "./chatStarters";

const row = (moment: Starter["moment"], body: string, active = true): Starter => ({
  id: body,
  moment,
  body,
  sort: 0,
  active,
});

describe("phrases d'amorce", () => {
  it("se remplissent avec la traversée", () => {
    expect(fillStarter("La file au port de {depart}, ça avance ?", { depart: "Oran" })).toBe(
      "La file au port d'Oran, ça avance ?",
    );
  });
  it("ne sont pas proposées s'il manque un mot", () => {
    expect(fillStarter("Le restaurant du {navire} est ouvert ?", { depart: "Oran" })).toBeNull();
  });
  it("prennent les 3 premières actives du moment, sinon les phrases intégrées", () => {
    const list = [
      row("sea", "A {navire}"),
      row("sea", "B"),
      row("sea", "C", false),
      row("sea", "D"),
      row("sea", "E"),
      row("port", "F"),
    ];
    expect(startersFor("sea", list, {}, [])).toEqual(["B", "D", "E"]);
    expect(startersFor("sea", null, {}, ["Secours"])).toEqual(["Secours"]);
  });
});

describe("français des phrases", () => {
  it("élide et accorde les articles", () => {
    expect(fillStarter("Au port de {depart} ?", { depart: "Alicante" })).toBe("Au port d'Alicante ?");
    expect(fillStarter("Le restaurant du {navire} ?", { navire: "Le Cracovia" })).toBe(
      "Le restaurant du Cracovia ?",
    );
    expect(fillStarter("Qui part sur le {navire} ?", { navire: "Le Cracovia" })).toBe(
      "Qui part sur le Cracovia ?",
    );
    expect(fillStarter("La file à {port} ?", { port: "Oran" })).toBe("La file à Oran ?");
  });
});
