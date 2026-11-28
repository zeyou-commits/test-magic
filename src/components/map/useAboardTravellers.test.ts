import { describe, expect, it } from "vitest";
import { aroundOffset } from "./useAboardTravellers";

describe("aroundOffset", () => {
  it("pose les avatars sur le cercle, le haut à angle 0 et la droite à 90°", () => {
    const [x0, y0] = aroundOffset([10, 20], 50, 0);
    expect(x0).toBeCloseTo(10);
    expect(y0).toBeCloseTo(-30);
    const [x90, y90] = aroundOffset([10, 20], 50, 90);
    expect(x90).toBeCloseTo(60);
    expect(y90).toBeCloseTo(20);
    const [xl] = aroundOffset([0, 0], 50, -90);
    expect(xl).toBeCloseTo(-50);
  });
});
