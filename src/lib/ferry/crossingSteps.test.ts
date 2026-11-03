import { describe, expect, it } from "vitest";
import { crossingSteps } from "./crossingProgress";

const base = { departed: false, arrived: false, pastDeparture: false, arrivalDue: false };

describe("les étapes d'une traversée", () => {
  it("attend l'embarquement avant l'heure", () => {
    expect(crossingSteps({ ...base, scene: "docked" })).toEqual({
      boarding: "todo",
      departure: "todo",
      sea: "todo",
      arrival: "todo",
      landing: "todo",
    });
    expect(crossingSteps({ ...base, scene: "boarding" })?.boarding).toBe("current");
  });

  it("sans preuve, part à l'heure prévue : départ « d'après l'horaire », traversée en cours", () => {
    const steps = crossingSteps({ ...base, scene: "sea", pastDeparture: true });
    expect(steps?.boarding).toBe("assumed");
    expect(steps?.departure).toBe("assumed");
    expect(steps?.sea).toBe("current");
  });

  it("passe en mer dès que le départ est prouvé (navire vu en mer)", () => {
    const steps = crossingSteps({ ...base, scene: "sea", pastDeparture: true, departed: true });
    expect(steps?.boarding).toBe("done");
    expect(steps?.departure).toBe("done");
    expect(steps?.sea).toBe("current");
  });

  it("marque l'arrivée à confirmer quand l'heure est passée sans signal", () => {
    const steps = crossingSteps({
      ...base,
      scene: "stale",
      pastDeparture: true,
      departed: true,
      arrivalDue: true,
    });
    expect(steps?.sea).toBe("done");
    expect(steps?.arrival).toBe("pending");
  });

  it("termine au débarquement, puis tout est fait", () => {
    const landing = crossingSteps({ ...base, scene: "disembarking", arrived: true, pastDeparture: true });
    expect(landing?.arrival).toBe("done");
    expect(landing?.landing).toBe("current");
    const done = crossingSteps({ ...base, scene: "docked", arrived: true, pastDeparture: true });
    expect(Object.values(done ?? {})).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("n'affiche rien pour un navire immobilisé", () => {
    expect(crossingSteps({ ...base, scene: "stopped", pastDeparture: true })).toBeNull();
  });
});
