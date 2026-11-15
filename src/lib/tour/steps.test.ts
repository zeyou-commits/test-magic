import { describe, expect, it } from "vitest";
import { resolveSteps, shouldAutoStart, WELCOME_TOUR, type TourTarget } from "./steps";

type FakeEl = { id: string; visible: boolean };

describe("resolveSteps", () => {
  const pick = (map: Partial<Record<TourTarget, FakeEl[]>>) =>
    resolveSteps(WELCOME_TOUR, (t) => map[t] ?? [], (e) => e.visible);

  it("prend l'élément visible quand le téléphone et l'ordinateur ont chacun le leur", () => {
    const res = pick({
      book: [{ id: "pc", visible: false }, { id: "tel", visible: true }],
      nav: [{ id: "nav-tel", visible: true }],
      profile: [{ id: "moi", visible: true }],
    });
    expect(res.map((r) => r.element.id)).toEqual(["tel", "nav-tel", "moi"]);
  });

  it("saute une étape dont la cible n'est pas à l'écran, sans changer l'ordre", () => {
    const res = pick({
      book: [{ id: "voyage", visible: false }],
      nav: [{ id: "nav", visible: true }],
      profile: [{ id: "moi", visible: true }],
    });
    expect(res.map((r) => r.step.target)).toEqual(["nav", "profile"]);
  });
});

describe("shouldAutoStart", () => {
  it("s'ouvre une seule fois, sur l'accueil", () => {
    expect(shouldAutoStart({ seen: false, pathname: "/", stepCount: 3 })).toBe(true);
    expect(shouldAutoStart({ seen: true, pathname: "/", stepCount: 3 })).toBe(false);
    expect(shouldAutoStart({ seen: false, pathname: "/horaires", stepCount: 3 })).toBe(false);
  });

  it("ne s'ouvre pas pour une seule étape", () => {
    expect(shouldAutoStart({ seen: false, pathname: "/", stepCount: 1 })).toBe(false);
  });
});
