import { describe, expect, it } from "vitest";
import { adminDayRange, adminSearch, matchesDepartureScope } from "./navigation";

describe("navigation depuis les indicateurs admin", () => {
  it("conserve le contexte sans navire au rechargement", () => {
    expect(adminSearch({ tab: "departures", filter: "unassigned" })).toEqual({
      tab: "departures",
      filter: "unassigned",
    });
  });
  it("ne transporte pas un filtre vers une autre rubrique", () => {
    expect(adminSearch({ tab: "vessels", filter: "unassigned" })).toEqual({ tab: "vessels" });
    expect(adminSearch({ tab: "reports", filter: "pending" })).toEqual({ tab: "reports" });
    expect(adminSearch({ tab: "unknown", filter: "today" })).toEqual({ tab: "overview" });
  });
});

describe("départs concernés par les indicateurs", () => {
  const now = new Date(2026, 9, 23, 12);
  const departure = (offset: number, vessel_id: string | null = null, status = "scheduled") => ({
    departure_at: new Date(now.getTime() + offset).toISOString(),
    vessel_id,
    status,
  });
  it("exclut les départs déjà partis, annulés ou affectés de la vue sans navire", () => {
    expect(matchesDepartureScope(departure(3600000), "unassigned", now)).toBe(true);
    expect(matchesDepartureScope(departure(-1), "unassigned", now)).toBe(false);
    expect(matchesDepartureScope(departure(3600000, null, "cancelled"), "unassigned", now)).toBe(
      false,
    );
    expect(matchesDepartureScope(departure(3600000, "vessel"), "unassigned", now)).toBe(false);
  });
  it("conserve les départs modifiés sans navire", () => {
    expect(matchesDepartureScope(departure(3600000, null, "modified"), "unassigned", now)).toBe(
      true,
    );
  });
  it("affiche la journée entière, avec une borne de fin exclusive", () => {
    const { start, end } = adminDayRange(now);
    expect(matchesDepartureScope({ ...departure(0), departure_at: start }, "today", now)).toBe(
      true,
    );
    expect(
      matchesDepartureScope(
        { ...departure(0), departure_at: new Date(Date.parse(end) - 1).toISOString() },
        "today",
        now,
      ),
    ).toBe(true);
    expect(matchesDepartureScope({ ...departure(0), departure_at: end }, "today", now)).toBe(false);
  });
  it("n'applique plus de restriction après Voir tout", () => {
    expect(matchesDepartureScope(departure(-3600000, null, "cancelled"), undefined, now)).toBe(
      true,
    );
  });
});
