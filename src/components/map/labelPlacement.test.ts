import { describe, expect, it } from "vitest";
import { labelSize, placeAlongLines, placeLabels, type LabelItem } from "./labelPlacement";

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

describe("point du port", () => {
  it("le nom évite de couvrir le point d'un port", () => {
    const dot = { left: 191, right: 209, top: 203, bottom: 221 };
    expect(placeLabels([ship("a", 200, 200)], 12, [dot]).get("a")!.anchor).not.toBe("top");
  });
});

describe("durée des lignes", () => {
  const view = { left: 0, top: 0, right: 1000, bottom: 1000 };
  const line = { id: "r", text: "≈ 24 h", points: [[100, 500], [900, 500]] as [number, number][] };
  it("se pose au milieu de la ligne quand rien ne gêne", () => {
    expect(placeAlongLines([line], 9, [], view).get("r")).toMatchObject({ x: 500, y: 500, angle: 0 });
  });
  it("se décale le long de la ligne pour ne pas couvrir un navire", () => {
    const ship = { left: 450, right: 550, top: 440, bottom: 520 };
    const spot = placeAlongLines([line], 9, [ship], view).get("r")!;
    expect(spot.y).toBe(500);
    expect(Math.abs(spot.x - 500)).toBeGreaterThan(60);
  });
  it("n'apparaît qu'une fois par ligne", () => {
    expect(placeAlongLines([line, { ...line, id: "s" }], 9, [], view).size).toBe(2);
  });
});
