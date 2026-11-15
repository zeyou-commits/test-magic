import { describe, expect, it } from "vitest";
import { crossingNewsExpired, DISMISS_FOR_MS, encodeDismiss, isDismissed } from "./tickerRules";

const H = 3_600_000;
const dep = Date.parse("2026-11-11T11:00:00Z");
const times = new Map([["d1", { departure_at: "2026-11-11T11:00:00Z", arrival_at: "2026-11-12T08:00:00Z" }]]);

describe("crossingNewsExpired", () => {
  const item = { departure_ids: ["d1"], ends_at: null };
  it("reste affichée avant et juste après la traversée", () => {
    expect(crossingNewsExpired(item, times, dep)).toBe(false);
    expect(crossingNewsExpired(item, times, Date.parse("2026-11-12T19:00:00Z"))).toBe(false);
  });
  it("s'efface 12 h après l'arrivée", () => {
    expect(crossingNewsExpired(item, times, Date.parse("2026-11-12T20:01:00Z"))).toBe(true);
  });
  it("sans heure d'arrivée : départ + 24 h, puis 12 h", () => {
    const noArr = new Map([["d1", { departure_at: "2026-11-11T11:00:00Z", arrival_at: null }]]);
    expect(crossingNewsExpired(item, noArr, dep + 35 * H)).toBe(false);
    expect(crossingNewsExpired(item, noArr, dep + 37 * H)).toBe(true);
  });
  it("une traversée inconnue : on ne présume rien", () => {
    expect(crossingNewsExpired({ departure_ids: ["d1", "x"], ends_at: null }, times, dep + 100 * H)).toBe(false);
  });
  it("date de fin posée par l'équipe ou info sans traversée : règle inchangée", () => {
    expect(crossingNewsExpired({ departure_ids: ["d1"], ends_at: "2027-01-01T00:00:00Z" }, times, dep + 100 * H)).toBe(false);
    expect(crossingNewsExpired({ departure_ids: [], ends_at: null }, times, dep + 100 * H)).toBe(false);
  });
});

describe("isDismissed", () => {
  const now = Date.parse("2026-11-16T10:00:00Z");
  it("fermé : reste fermé pour les mêmes infos pendant 24 h", () => {
    const stored = encodeDismiss("a|b", now);
    expect(isDismissed(stored, "a|b", now + DISMISS_FOR_MS - 1)).toBe(true);
    expect(isDismissed(stored, "a|b", now + DISMISS_FOR_MS)).toBe(false);
  });
  it("revient dès qu'une info change", () => {
    expect(isDismissed(encodeDismiss("a|b", now), "a|b|c", now + 1)).toBe(false);
  });
  it("anciennes fermetures sans horodatage : le bandeau revient", () => {
    expect(isDismissed("a|b", "a|b", now)).toBe(false);
  });
  it("jamais fermé", () => {
    expect(isDismissed(null, "a", now)).toBe(false);
  });
});
