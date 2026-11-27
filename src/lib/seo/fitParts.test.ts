import { describe, expect, it } from "vitest";
import { fitParts } from "./site";

describe("fitParts", () => {
  const debut = "Bateau Marseille → Alger : programme des départs";
  const parts = [
    { rank: 0, options: [debut] },
    { rank: 1, options: ["environ 22 h de traversée"] },
    { rank: 3, options: ["Algérie Ferries, Corsica Linea, Nouris Elbahr Ferries", "3 compagnies"] },
    { rank: 2, options: ["repère dès 308 € à pied, 652 € avec voiture"] },
    { rank: 4, options: ["prochains départs datés"] },
  ];

  it("tient en 160 signes sans couper de phrase ni ajouter « … »", () => {
    const text = fitParts(parts);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).not.toContain("…");
    expect(text.startsWith(debut)).toBe(true);
    expect(text).toContain("environ 22 h de traversée · ");
    expect(text).toContain("3 compagnies");
  });

  it("garde l'ordre de lecture et tout le texte quand il y a la place", () => {
    expect(fitParts(parts.slice(0, 2))).toBe(`${debut} · environ 22 h de traversée.`);
  });
});
