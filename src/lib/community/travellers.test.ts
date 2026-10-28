import { describe, expect, it } from "vitest";
import { moodsFor, pseudoError, type MoodRow } from "./travellers";

const mood = (code: string, moments: string[], sort: number, active = true): MoodRow => ({
  code,
  label: code,
  emoji: "",
  image: `/cabas/humeurs/${code}.webp`,
  moments,
  sort,
  active,
});

describe("pseudo", () => {
  it("accepte un prénom, un surnom accentué ou le pseudo proposé", () => {
    expect(pseudoError("Lina 4821")).toBeNull();
    expect(pseudoError("Mâalem d'Oran")).toBeNull();
  });
  it("refuse trop court, trop long, les adresses et les liens", () => {
    expect(pseudoError("Li")).not.toBeNull();
    expect(pseudoError("x".repeat(25))).not.toBeNull();
    expect(pseudoError("lina@mail.fr")).not.toBeNull();
    expect(pseudoError("www.site")).not.toBeNull();
  });
});

describe("humeurs suggérées", () => {
  const moods = [
    mood("zen", ["toujours"], 30),
    mood("mal_de_mer", ["onboard"], 130),
    mood("reste_calme", ["port"], 40),
    mood("cachee", ["port"], 10, false),
  ];
  it("met d'abord celles du moment, puis celles de tout le temps, sans les masquées", () => {
    expect(moodsFor(moods, "port").map((m) => m.code)).toEqual([
      "reste_calme",
      "zen",
      "mal_de_mer",
    ]);
  });
  it("garde l'ordre de l'admin sans moment connu", () => {
    expect(moodsFor(moods, null).map((m) => m.code)).toEqual(["zen", "mal_de_mer", "reste_calme"]);
  });
});
