import { describe, expect, it } from "vitest";
import { consulatForDepartment, consulats, departmentFromPostcode, formalitesFor } from "./formalites";

describe("consulat compétent", () => {
  it("couvre chaque département de métropole une seule fois", () => {
    const deps = consulats.flatMap((c) => c.departments);
    const metro = Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, "0")).filter((d) => d !== "20");
    for (const d of [...metro, "2A", "2B"]) expect(consulatForDepartment(d), d).not.toBeNull();
    expect(new Set(deps).size).toBe(deps.length);
  });
  it("lit le département d'un code postal", () => {
    expect(departmentFromPostcode("13008")).toBe("13");
    expect(departmentFromPostcode("20000")).toBe("2A");
    expect(departmentFromPostcode("20200")).toBe("2B");
    expect(departmentFromPostcode("97400")).toBe("974");
    expect(departmentFromPostcode("1300")).toBeNull();
    expect(consulatForDepartment("93")?.id).toBe("bobigny");
    expect(consulatForDepartment("66")?.id).toBe("montpellier");
  });
});

describe("liste des papiers", () => {
  it("visa pour un passeport étranger, pas pour un binational", () => {
    const base = { children: "none", married: false, stay: "family" } as const;
    expect(formalitesFor({ ...base, nationality: "foreign" }).some((f) => f.id === "visa")).toBe(true);
    const bi = formalitesFor({ ...base, nationality: "binational" });
    expect(bi.some((f) => f.id === "visa")).toBe(false);
    expect(bi.some((f) => f.id === "retour-france")).toBe(true);
  });
  it("autorisation paternelle sans le père ; AST seulement sans aucun parent", () => {
    const ids = formalitesFor({ nationality: "algerian", children: "withoutFather", married: true, stay: "hotel" }).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["autorisation-paternelle", "livret", "hotel"]));
    expect(ids).not.toContain("ast");
    const alone = formalitesFor({ nationality: "algerian", children: "alone", married: false, stay: "family" }).map((f) => f.id);
    expect(alone).toContain("ast");
  });
});
