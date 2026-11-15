import { describe, expect, it } from "vitest";
import { resolveSteps, shouldAutoStart, WELCOME_TOUR, type TourTarget } from "./steps";

type FakeEl = { id: string; visible: boolean };

describe("resolveSteps", () => {
  const pick = (map: Partial<Record<TourTarget, FakeEl[]>>) =>
    resolveSteps(WELCOME_TOUR, (t) => map[t] ?? [], (e) => e.visible);

  it("commence par l'accueil, sans élément, puis prend l'élément visible", () => {
    const res = pick({
      book: [{ id: "pc", visible: false }, { id: "tel", visible: true }],
      nav: [{ id: "nav-tel", visible: true }],
      profile: [{ id: "moi", visible: true }],
    });
    expect(res.map((r) => r.element?.id ?? null)).toEqual([null, "nav-tel", "moi", "tel"]);
  });

  it("saute une étape dont la cible n'est pas à l'écran, sans changer l'ordre", () => {
    const res = pick({
      book: [{ id: "voyage", visible: false }],
      nav: [{ id: "nav", visible: true }],
      profile: [{ id: "moi", visible: true }],
    });
    expect(res.map((r) => r.step.target)).toEqual([null, "nav", "profile"]);
  });

  it("finit par la recherche de traversée", () => {
    expect(WELCOME_TOUR[WELCOME_TOUR.length - 1]?.target).toBe("book");
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
