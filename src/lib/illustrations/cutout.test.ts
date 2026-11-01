import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { illustrationSlots, slotForFileName } from "./catalog";
import { CutoutError, cutOut, subjectBox } from "./cutout";

const SIZE = 200;

/** Cabas rouge : corps plein avec un œil blanc, anse en boucle au-dessus. */
function drawing(background: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const body = (x - 100) ** 2 + (y - 130) ** 2 < 50 ** 2;
      const ring = (x - 100) ** 2 + (y - 60) ** 2;
      const handle = ring < 40 ** 2 && ring > 28 ** 2;
      const eye = (x - 85) ** 2 + (y - 130) ** 2 < 10 ** 2;
      const star = x > 180 && y > 180 && x < 190 && y < 190;
      const value = background(x, y);
      const color: number[] = eye
        ? [255, 255, 255]
        : body || handle
          ? [200, 40, 40]
          : star
            ? [150, 150, 150]
            : [value, value, value];
      data.set([...color, 255], i);
    }
  }
  return data;
}
const alpha = (data: Uint8ClampedArray, x: number, y: number) => data[(y * SIZE + x) * 4 + 3];

describe("détourage", () => {
  it("enlève le fond blanc, garde l'œil, vide l'anse et retire le filigrane", () => {
    const data = drawing(() => 255);
    const alerts = cutOut(data, SIZE, SIZE, { handles: true });
    expect(alpha(data, 0, 0)).toBe(0);
    expect(alpha(data, 85, 130)).toBe(255);
    expect(alpha(data, 100, 60)).toBe(0);
    expect(alpha(data, 185, 185)).toBe(0);
    expect(alerts.length).toBe(1);
    expect(subjectBox(data, SIZE, SIZE)?.top).toBeLessThan(25);
  });

  it("garde le blanc de l'anse sur un avatar", () => {
    const data = drawing(() => 255);
    cutOut(data, SIZE, SIZE, { handles: false });
    expect(alpha(data, 100, 60)).toBe(255);
  });

  it("enlève un faux damier, y compris entre les anses", () => {
    const data = drawing((x, y) => ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 255 : 204));
    cutOut(data, SIZE, SIZE, { handles: true });
    expect(alpha(data, 3, 3)).toBe(0);
    expect(alpha(data, 100, 60)).toBe(0);
    expect(alpha(data, 85, 130)).toBe(255);
  });

  it("refuse un fond coloré ou sombre", () => {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) data.set([40, 90, 200, 255], i * 4);
    expect(() => cutOut(data, SIZE, SIZE, { handles: true })).toThrow(CutoutError);
  });
});

describe("catalogue des illustrations", () => {
  it("couvre les 76 images, toutes présentes, sans la voiture 504", () => {
    expect(illustrationSlots).toHaveLength(76);
    expect(new Set(illustrationSlots.map((item) => item.file)).size).toBe(76);
    expect(illustrationSlots.some((item) => item.file === "voiture_504")).toBe(false);
    for (const item of illustrationSlots) expect(existsSync(`public${item.src}`)).toBe(true);
  });

  it("reconnaît le nom d'un fichier téléchargé", () => {
    expect(slotForFileName("01_valise_pleine.png")?.category).toBe("humeurs");
    expect(slotForFileName("Lina (1).JPG")?.category).toBe("persos");
    expect(slotForFileName("Gemini_Generated_Image.png")).toBeNull();
    expect(slotForFileName("voiture_504.png")).toBeNull();
  });
});
