import { describe, expect, it } from "vitest";
import { genderFromName } from "./genderFromName";
import { defaultAnswers, newTraveller, tasksFor, type Answers } from "@/content/formalites";

describe("Prénom → homme ou femme présélectionné", () => {
  it("reconnaît les prénoms courants, sinon ne devine pas", () => {
    expect(genderFromName("Youssef")).toBe("m");
    expect(genderFromName(" anne ")).toBe("f");
    expect(genderFromName("Yasmina")).toBe("f");
    expect(genderFromName("Camille-Marie")).toBe("f");
    expect(genderFromName("Zx")).toBeNull();
    expect(genderFromName("")).toBeNull();
  });
});

describe("Service national dans la liste", () => {
  const withMan = (sn?: "ok" | "exempt" | "todo" | "unknown"): Answers => ({
    ...defaultAnswers,
    postcode: "75001",
    travellers: [{ ...newTraveller("adult"), name: "Youssef", nat: "dz", man: true, ...(sn ? { sn } : {}) }],
  });
  it("en règle : l'attestation part dans la pochette, pas de démarche", () => {
    const ids = tasksFor(withMan("ok")).map((t) => t.id);
    expect(ids).toContain("service-national-papier");
    expect(ids).not.toContain("service-national");
  });
  it("pas à jour ou ne sait pas : la démarche au consulat reste", () => {
    expect(tasksFor(withMan("todo")).map((t) => t.id)).toContain("service-national");
    expect(tasksFor(withMan()).map((t) => t.id)).toContain("service-national");
  });
});
