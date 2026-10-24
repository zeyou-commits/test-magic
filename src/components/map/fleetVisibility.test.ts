import { describe, expect, it } from "vitest";
import { fleetGroups } from "./fleetVisibility";

describe("Bateaux proches sur la carte", () => {
  it("conserve un identifiant pour chaque bateau distinct", () => {
    const groups = fleetGroups([
      { id: "a", x: 0, y: 0, priority: 3 },
      { id: "b", x: 40, y: 0, priority: 3 },
    ]);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")).toEqual({ groupId: "a", groupCount: 0 });
  });
  it("signale tous les bateaux exactement superposés sans changer leur position", () => {
    const points = [
      { id: "a", x: 10, y: 20, priority: 3 },
      { id: "b", x: 10, y: 20, priority: 3 },
    ];
    const before = JSON.stringify(points),
      groups = fleetGroups(points);
    expect(groups.get("a")).toEqual({ groupId: "a", groupCount: 2 });
    expect(groups.get("b")).toEqual({ groupId: "a", groupCount: 0 });
    expect(JSON.stringify(points)).toBe(before);
  });
  it("donne le compteur au bateau sélectionné", () => {
    const groups = fleetGroups([
      { id: "a", x: 0, y: 0, priority: 3 },
      { id: "b", x: 5, y: 0, priority: 0 },
    ]);
    expect(groups.get("b")).toEqual({ groupId: "b", groupCount: 2 });
  });
  it("ne perd aucun membre dans une chaîne de bateaux proches", () => {
    const groups = fleetGroups([
      { id: "a", x: 0, y: 0, priority: 3 },
      { id: "b", x: 12, y: 0, priority: 3 },
      { id: "c", x: 24, y: 0, priority: 3 },
    ]);
    expect(groups.size).toBe(3);
    expect(groups.get("a")?.groupCount).toBe(3);
  });
  it("sépare les bateaux quand le zoom les éloigne visuellement", () => {
    const groups = fleetGroups([
      { id: "a", x: 0, y: 0, priority: 3 },
      { id: "b", x: 15, y: 0, priority: 3 },
    ]);
    expect([...groups.values()].every((group) => group.groupCount === 0)).toBe(true);
  });
});
