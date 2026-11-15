import { describe, expect, it } from "vitest";
import { closeMatches, explainNoSailing, weekdayList } from "./reasons";

// 2027-07-12 est un lundi.
const mondaysThursdays = ["2027-07-05", "2027-07-08", "2027-07-12", "2027-07-15", "2027-07-19", "2027-07-22"];

describe("explainNoSailing", () => {
  it("date au-delà du dernier départ publié", () => {
    expect(
      explainNoSailing({ date: "2027-08-20", availableDays: mondaysThursdays, publishedUntil: "2027-07-22" }),
    ).toEqual({ kind: "notPublished", publishedUntil: "2027-07-22" });
  });
  it("jour de la semaine où la ligne ne part pas", () => {
    expect(explainNoSailing({ date: "2027-07-13", availableDays: mondaysThursdays, publishedUntil: "2027-07-22" })).toEqual({
      kind: "notThatDay",
      weekdays: [1, 4],
    });
  });
  it("trop peu de départs pour parler de rythme : on ne sait pas", () => {
    expect(explainNoSailing({ date: "2027-07-13", availableDays: ["2027-07-12"], publishedUntil: "2027-07-22" })).toEqual({
      kind: "unknown",
    });
  });
  it("sans date : on ne sait pas", () => {
    expect(explainNoSailing({ date: null, availableDays: mondaysThursdays })).toEqual({ kind: "unknown" });
  });
  it("complet passe avant tout quand la billetterie le dit", () => {
    expect(
      explainNoSailing({ date: "2027-07-12", availableDays: mondaysThursdays, soldOutCount: 2 }),
    ).toEqual({ kind: "soldOut", count: 2 });
  });
  it("le jour demandé fait partie du rythme : on ne sait pas", () => {
    expect(explainNoSailing({ date: "2027-07-26", availableDays: mondaysThursdays, publishedUntil: "2027-07-30" }).kind).toBe(
      "unknown",
    );
  });
});

describe("weekdayList", () => {
  it("liste lisible", () => {
    expect(weekdayList([1, 4, 6])).toBe("lun., jeu. et sam.");
    expect(weekdayList([3])).toBe("mer.");
  });
});

describe("closeMatches", () => {
  const ports = ["Béjaïa", "Alger", "Annaba", "Oran", "Marseille"];
  it("retrouve un nom mal tapé, accents ignorés", () => {
    expect(closeMatches("bejaya", ports, (p) => p)).toEqual(["Béjaïa"]);
    expect(closeMatches("marseile", ports, (p) => p)).toEqual(["Marseille"]);
  });
  it("compare chaque mot d'un nom", () => {
    expect(closeMatches("tasili", ["Tassili II", "El Djazair II"], (v) => v)).toEqual(["Tassili II"]);
  });
  it("rien pour une saisie trop courte ou trop éloignée", () => {
    expect(closeMatches("al", ports, (p) => p)).toEqual([]);
    expect(closeMatches("tokyo", ports, (p) => p)).toEqual([]);
  });
});
