import { describe, it, expect } from "vitest";
import { tripShareUrl, tripShareText } from "./tripShare";
import { reviewScore, reviewCriteria } from "./reviewCriteria";
import { bringTooltipToFront } from "@/components/map/tooltipStack";
describe("public journey tracking share", () => {
  it("retains only the exact departure, dropping personal filters and fragments", () => {
    const url = new URL(
      tripShareUrl(
        "https://test-magic.vercel.app/compte?origin=adresse-personnelle&children=2#profil",
        "dated-departure",
      ),
    );
    expect(url.pathname).toBe("/");
    expect([...url.searchParams]).toEqual([
      ["select", "departure"],
      ["id", "dated-departure"],
    ]);
    expect(url.hash).toBe("");
  });
  it("uses the departure port local time in the message", () => {
    const message = tripShareText("Marseille", "Alger", "2027-07-12T18:00:00Z", "Europe/Paris");
    expect(message).toContain("20:00");
    expect(message).toContain("heure du port de départ");
    expect(message).toContain("peuvent évoluer");
  });
});
describe("guided review scoring", () => {
  it("has five distinct criteria per entity", () => {
    for (const criteria of Object.values(reviewCriteria)) {
      expect(criteria).toHaveLength(5);
      expect(new Set(criteria.map((c) => c.code)).size).toBe(5);
    }
  });
  it("excludes unused criteria instead of assigning zero", () =>
    expect(
      reviewScore("vessel", { cleanliness: 5, comfort: 4, rest: 3, food: null, facilities: null }),
    ).toBe(4));
  it("requires three actual rated criteria", () =>
    expect(reviewScore("port", { access: 5, signage: 4, cleanliness: null })).toBeNull());
  it("rejects fabricated or out-of-range criteria", () => {
    for (const scores of [
      { information: 5, boarding: 4, value: 3, extra: 5 },
      { information: 5, boarding: 1.5, value: 3 },
      { information: 0, boarding: 4, value: 3 },
      { information: 6, boarding: 4, value: 3 },
    ])
      expect(reviewScore("company", scores)).toBeNull();
  });
});
describe("latest map tooltip stacking", () => {
  it("raises ports and vessel popups in the same order, including returning to a previous port", () => {
    const port = { style: { zIndex: "30" } },
      ship = { style: { zIndex: "35" } },
      signal = { style: { zIndex: "35" } };
    bringTooltipToFront(port);
    bringTooltipToFront(ship);
    expect(+ship.style.zIndex).toBeGreaterThan(+port.style.zIndex);
    bringTooltipToFront(port);
    expect(+port.style.zIndex).toBeGreaterThan(+ship.style.zIndex);
    bringTooltipToFront(signal);
    expect(+signal.style.zIndex).toBeGreaterThan(+port.style.zIndex);
    const unchanged = signal.style.zIndex;
    bringTooltipToFront(signal);
    expect(signal.style.zIndex).toBe(unchanged);
  });
});
