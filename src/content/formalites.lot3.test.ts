import { describe, expect, it } from "vitest";
import {
  ageBandOf,
  ageBands,
  defaultAnswers,
  dzChoiceOf,
  dzChoices,
  fromDzChoice,
  newTraveller,
  tasksFor,
  visaCost,
  type Answers,
  type SnStatus,
} from "@/content/formalites";

describe("âge des enfants en tranches", () => {
  it("range chaque âge dans sa tranche", () => {
    expect(ageBandOf(0).label).toBe("Moins de 6 ans");
    expect(ageBandOf(5).label).toBe("Moins de 6 ans");
    expect(ageBandOf(6).label).toBe("6 à 11 ans");
    expect(ageBandOf(12).label).toBe("12 à 15 ans");
    expect(ageBandOf(15).label).toBe("12 à 15 ans");
    expect(ageBandOf(17).label).toBe("16 ou 17 ans");
    expect(ageBandOf(18).label).toBe("18 ans");
  });
  it("garde dans chaque tranche le même prix de visa que les âges réels", () => {
    for (let age = 0; age <= 18; age++)
      expect(visaCost(ageBandOf(age).age).eur).toBe(visaCost(age).eur);
  });
  it("retombe sur sa propre tranche", () => {
    for (const band of ageBands) expect(ageBandOf(band.age)).toBe(band);
  });
});

describe("document algérien et passeport en une question", () => {
  it("fait l'aller-retour sans perte", () => {
    for (const { value } of dzChoices) {
      const t = { ...newTraveller("adult"), ...fromDzChoice(value) };
      expect(dzChoiceOf(t)).toBe(value);
    }
  });
  it("garde le passeport laissé à la maison", () => {
    expect(fromDzChoice("foreignPass")).toEqual({ dzDoc: "passeport", dzTravel: "foreign" });
  });
});

describe("service national", () => {
  const man = (nat: "bi" | "dz", sn: SnStatus): Answers => ({
    ...defaultAnswers,
    travellers: [{ ...newTraveller("adult"), nat, man: true, sn }],
  });
  const ids = (a: Answers) => tasksFor(a).map((t) => t.id);
  it("déclaration d'option : en règle, la copie part dans la pochette", () => {
    const task = tasksFor(man("bi", "option")).find((t) => t.id === "service-national-option");
    expect(task?.when).toBe("pack");
    expect(task?.sources).toContain("accord-1983");
  });
  it("JDC : à régulariser au consulat, à faire confirmer", () => {
    const task = tasksFor(man("bi", "jdc")).find((t) => t.id === "service-national-jdc");
    expect(task?.toConfirm).toBe(true);
    expect(task?.detail).toMatch(/certificat des services/);
  });
  it("un Algérien seulement n'a pas l'accord de 1983", () => {
    expect(ids(man("dz", "jdc"))).toContain("service-national");
    expect(ids(man("dz", "jdc"))).not.toContain("service-national-jdc");
  });
  it("recensé : l'attestation dans la pochette", () => {
    expect(ids(man("bi", "ok"))).toContain("service-national-papier");
  });
});
