import { describe, expect, it } from "vitest";
import { papersSteps } from "@/components/papers/PapersFlow";
import {
  consulateReasons,
  consulateTasks,
  defaultAnswers,
  newTraveller,
  tasksFor,
  type Answers,
} from "./formalites";

const withTraveller = (p: Partial<ReturnType<typeof newTraveller>>): Answers => ({
  ...defaultAnswers,
  travellers: [{ ...newTraveller("adult"), ...p }],
});

describe("le consulat seulement quand il sert", () => {
  it("binational, passeport algérien valable au retour : rien au consulat, pas de question", () => {
    const a = withTraveller({ nat: "bi", dzDoc: "passeport", dzValid: "yes" });
    expect(consulateTasks(a)).toEqual([]);
    expect(tasksFor(a).some((t) => t.id === "carte-consulaire")).toBe(false);
    expect(papersSteps(a, "companion")).not.toContain("home");
  });

  it("passeport qui expire avant le retour : renouvellement, carte consulaire d'abord, consulat demandé", () => {
    const a = withTraveller({ nat: "dz", dzValid: "no" });
    const renew = tasksFor(a).find((t) => t.id === "renouveler-passeport-dz")!;
    expect(renew.needs).toEqual(["carte-consulaire"]);
    expect(tasksFor(a).some((t) => t.id === "carte-consulaire")).toBe(true);
    expect(papersSteps(a, "companion").at(-1)).toBe("home");
    expect(consulateReasons(a)).toBe("le renouvellement du passeport (Vous)");
  });

  it("date inconnue : on la vérifie soi-même, sans rendez-vous au consulat", () => {
    const a = withTraveller({ nat: "dz", dzValid: "unknown" });
    expect(tasksFor(a).find((t) => t.id === "validite-passeport-dz")!.consulate).toBeUndefined();
    expect(consulateTasks(a)).toEqual([]);
  });

  it("anciennes réponses sans la question : « je ne sais pas »", () => {
    const { dzValid: _drop, ...old } = newTraveller("adult");
    const a: Answers = { ...defaultAnswers, travellers: [{ ...old, nat: "dz" }] };
    expect(tasksFor(a).some((t) => t.id === "validite-passeport-dz")).toBe(true);
  });

  it("deux démarches : la raison les cite toutes", () => {
    const a: Answers = {
      ...defaultAnswers,
      travellers: [
        { ...newTraveller("adult"), nat: "dz", dzValid: "no" },
        { ...newTraveller("adult"), nat: "etr" },
      ],
    };
    expect(consulateReasons(a)).toMatch(
      /^le visa \(Adulte 2\) et le renouvellement du passeport \(Vous\)$|renouvellement du passeport \(Vous\) et le visa \(Adulte 2\)/,
    );
  });
});
