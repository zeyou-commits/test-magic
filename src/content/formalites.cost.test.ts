import { describe, expect, it } from "vitest";
import { consulats } from "@/content/consulats";
import { totalCost, visaCost, type Task } from "@/content/formalites";
import { groupWho } from "@/lib/papers/planCategories";

describe("coût des démarches", () => {
  it("suit le tarif de l'ambassade selon l'âge, frais de dossier compris", () => {
    expect(visaCost(3).eur).toBe(30);
    expect(visaCost(8).eur).toBe(70);
    expect(visaCost(14).eur).toBe(110);
    expect(visaCost(40).label).toBe("80 € + 30 € de dossier");
  });
  it("additionne les frais connus", () => {
    const task = (eur?: number) =>
      ({ id: "x", when: "weeks", title: "", detail: "", who: [], sources: [], ...(eur === undefined ? {} : { cost: { label: "", eur } }) }) as Task;
    expect(totalCost([task(110), task(30), task(), task(0)])).toBe(140);
  });
});

describe("regroupement des enfants", () => {
  it("remplace tous les enfants par « Les N enfants »", () => {
    expect(groupWho(["Anne", "Lina", "Sami", "Yanis"], ["Lina", "Sami", "Yanis"])).toEqual(["Anne", "Les 3 enfants"]);
  });
  it("garde les prénoms quand un enfant fait exception", () => {
    expect(groupWho(["Lina", "Sami"], ["Lina", "Sami", "Yanis"])).toEqual(["Lina", "Sami"]);
  });
});

describe("liens de rendez-vous", () => {
  it("sont en https quand ils existent", () => {
    for (const c of consulats) if (c.rdv) expect(c.rdv).toMatch(/^https:\/\//);
  });
});
