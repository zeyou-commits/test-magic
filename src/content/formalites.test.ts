import { describe, expect, it } from "vitest";
import {
  consulatForDepartment,
  consulats,
  defaultAnswers,
  departmentFromPostcode,
  tasksFor,
  type Answers,
  type Traveller,
} from "./formalites";

const person = (p: Partial<Traveller> & Pick<Traveller, "id" | "kind">): Traveller => ({
  nat: "bi",
  dzDoc: "passeport",
  age: 30,
  man: false,
  residence: "titre",
  ...p,
});
const ids = (a: Partial<Answers>) => tasksFor({ ...defaultAnswers, ...a }).map((t) => t.id);

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

describe("papiers voyageur par voyageur", () => {
  it("binational avec carte d'identité : pas de visa, mesure jusqu'à fin 2026", () => {
    const list = ids({ travellers: [person({ id: "a", kind: "adult", dzDoc: "cnibe" })] });
    expect(list).toContain("entree-mesure-cnibe");
    expect(list.some((id) => id.startsWith("visa-"))).toBe(false);
    expect(list).toContain("retour-binational");
  });
  it("couple mixte marié : transcription d'abord, puis visa familial", () => {
    const tasks = tasksFor({
      ...defaultAnswers,
      couple: "married",
      transcribed: "no",
      travellers: [person({ id: "a", kind: "adult", nat: "dz" }), person({ id: "b", kind: "adult", nat: "etr" })],
    });
    expect(tasks[0]?.id).toBe("transcription-mariage");
    expect(tasks.find((t) => t.id === "visa-b")?.title).toMatch(/conjoint/);
    expect(tasks.some((t) => t.id === "certificat-hebergement")).toBe(true);
  });
  it("enfant avec sa mère : autorisation paternelle, sans AST", () => {
    const list = ids({ kidsWith: "mother", travellers: [person({ id: "m", kind: "adult" }), person({ id: "k", kind: "child", age: 10 })] });
    expect(list).toEqual(expect.arrayContaining(["autorisation-paternelle", "livret"]));
    expect(list).not.toContain("ast");
  });
  it("mère qui a la garde après divorce : dispense", () => {
    const list = ids({ kidsWith: "mother", separated: true, motherCustody: true, travellers: [person({ id: "m", kind: "adult" }), person({ id: "k", kind: "child", age: 10 })] });
    expect(list).toContain("dispense-autorisation");
    expect(list).not.toContain("autorisation-paternelle");
  });
  it("enfant seul : AST côté France ; jeune de 18 ans encore mineur en Algérie", () => {
    const list = ids({ kidsWith: "other", travellers: [person({ id: "g", kind: "adult" }), person({ id: "k", kind: "child", age: 12 }), person({ id: "y", kind: "child", age: 18 })] });
    expect(list).toEqual(expect.arrayContaining(["ast", "autorisation-paternelle", "majorite-19"]));
  });
  it("enfant binational de 15 ans ou moins sans papier algérien : livret de famille", () => {
    const list = ids({ travellers: [person({ id: "p", kind: "adult" }), person({ id: "k", kind: "child", age: 6, dzDoc: "aucun" })] });
    expect(list).toContain("entree-enfant-livret");
  });
  it("homme algérien : service national à faire confirmer", () => {
    const tasks = tasksFor({ ...defaultAnswers, travellers: [person({ id: "a", kind: "adult", nat: "dz", man: true })] });
    expect(tasks.find((t) => t.id === "service-national")?.toConfirm).toBe(true);
  });
});
