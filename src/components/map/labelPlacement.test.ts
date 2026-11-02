import { describe, expect, it } from "vitest";
import { labelSize, placeLabels, type LabelItem } from "./labelPlacement";

const ship = (id: string, x: number, y: number, text = "Tariq Ibn Ziyad"): LabelItem => ({
  id,
  x,
  y,
  standing: true,
  width: 160,
  height: 80,
  text,
  lines: 1,
  priority: 2,
});

describe("nom des navires sur la carte", () => {
  it("se place sous la coque quand la place est libre, collé à elle", () => {
    const spot = placeLabels([ship("a", 200, 200)], 12).get("a")!;
    expect(spot.anchor).toBe("top");
    expect(spot.offset[1]).toBeLessThan(0.5);
  });
  it("change de côté pour ne pas couvrir le navire juste en dessous", () => {
    const spots = placeLabels([ship("a", 200, 200), ship("b", 200, 290)], 12);
    expect(spots.get("a")!.anchor).not.toBe("top");
  });
  it("grandit avec le zoom", () => {
    expect(labelSize(3)).toBe(8);
    expect(labelSize(13)).toBe(18);
    expect(labelSize(8)).toBeCloseTo(11);
  });
});
