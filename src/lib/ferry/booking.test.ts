import { describe, expect, it } from "vitest";
import { bookingUrl } from "./booking";
import type { Sailing } from "./trips";

const leg = (slug: string, dayKey: string, fromCc = "FR", toCc = "DZ") =>
  ({
    company: { id: slug, slug, name: slug, website_url: "https://www.example.com" },
    from: { country_code: fromCc },
    to: { country_code: toCc },
    dayKey,
  }) as unknown as Sailing;
const profile = {
  vehicle: "van",
  accessories: [],
  passengers: { adults: 2, seniors: 0, children: 1, babies: 0, pets: 0 },
} as never;

describe("bookingUrl", () => {
  it("pré-remplit Corsica Linea avec dates, véhicule et passagers", () => {
    const url = bookingUrl(leg("corsica-linea", "2026-10-17"), profile, leg("corsica-linea", "2026-10-31"))!;
    expect(url).toBe(
      "https://www.corsicalinea.com/tsw/search/departure/crossing?route=CONTINENT_ALGERIE&outwardDate=2026-10-17&returnDate=2026-10-31&vehicles=VAN&passengers=ADULT,ADULT,CHILD",
    );
  });
  it("renvoie le site officiel pour les autres compagnies", () => {
    expect(bookingUrl(leg("gnv", "2026-10-17"), profile)).toBe("https://www.example.com/");
  });
});
