import { describe, expect, it } from "vitest";
import { layoutCompanion, resolveSteps, shouldAutoStart, WELCOME_TOUR, type TourTarget } from "./steps";

type FakeEl = { id: string; visible: boolean };

describe("resolveSteps", () => {
  const pick = (map: Partial<Record<TourTarget, FakeEl[]>>) =>
    resolveSteps(WELCOME_TOUR, (t) => map[t] ?? [], (e) => e.visible);

  it("suit l'ordre du voyage : préparer, réserver, suivre", () => {
    expect(WELCOME_TOUR.map((s) => s.target)).toEqual(["prepare", "book", "filters"]);
  });

  it("prend l'élément visible quand le téléphone et l'ordinateur ont chacun le leur", () => {
    const res = pick({
      prepare: [{ id: "prep", visible: true }],
      book: [{ id: "pc", visible: false }, { id: "tel", visible: true }],
      filters: [{ id: "rail", visible: true }],
    });
    expect(res.map((r) => r.element.id)).toEqual(["prep", "tel", "rail"]);
  });

  it("saute une étape dont la cible n'est pas à l'écran, sans changer l'ordre", () => {
    const res = pick({ prepare: [{ id: "p", visible: true }], filters: [{ id: "f", visible: true }] });
    expect(res.map((r) => r.step.target)).toEqual(["prepare", "filters"]);
  });
});

describe("layoutCompanion", () => {
  const sizes = { car: 66, carHeight: 50, bubbleWidth: 240, bubbleHeight: 130, margin: 12 };
  const view = { width: 390, height: 844 };

  it("cible en bas (onglet) : la 504 juste au-dessus, la bulle au-dessus d'elle, rien ne couvre la cible", () => {
    const tab = { left: 6, top: 784, width: 74, height: 56 };
    const l = layoutCompanion(tab, view, sizes);
    expect(l.car.top + sizes.carHeight).toBeLessThanOrEqual(tab.top);
    expect(l.bubble.top + sizes.bubbleHeight).toBeLessThanOrEqual(l.car.top);
    expect(l.bubble.tailSide).toBe("bottom");
    expect(l.bubble.left).toBeGreaterThanOrEqual(12);
    expect(l.car.facingRight).toBe(true);
  });

  it("cible en haut (filtres) : la 504 en dessous, la bulle en dessous d'elle, dans l'écran", () => {
    const rail = { left: 1270, top: 130, width: 56, height: 240 };
    const l = layoutCompanion(rail, { width: 1366, height: 860 }, sizes);
    expect(l.car.top).toBeGreaterThanOrEqual(rail.top + rail.height);
    expect(l.bubble.top).toBeGreaterThan(l.car.top);
    expect(l.bubble.left + sizes.bubbleWidth).toBeLessThanOrEqual(1366 - 12);
    expect(l.bubble.tailSide).toBe("top");
    expect(l.car.facingRight).toBe(false);
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
