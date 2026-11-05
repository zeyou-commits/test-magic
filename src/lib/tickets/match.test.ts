import { describe, expect, it } from "vitest";
import { bestDeparture, legIssues, type CandidateDeparture } from "./match";

const leg = { fromPortId: "mrs", toPortId: "alg", date: "2026-07-12", time: "19:00" };
// 19:00 à Marseille en juillet = 17:00 UTC.
const deps: CandidateDeparture[] = [
  {
    id: "matin",
    route_id: "r",
    company_id: "c",
    vessel_id: "v1",
    departure_at: "2026-07-12T08:00:00Z",
    status: "scheduled",
  },
  {
    id: "soir",
    route_id: "r",
    company_id: "c",
    vessel_id: "v1",
    departure_at: "2026-07-12T17:30:00Z",
    status: "scheduled",
  },
  {
    id: "lendemain",
    route_id: "r",
    company_id: "c",
    vessel_id: "v1",
    departure_at: "2026-07-13T17:00:00Z",
    status: "scheduled",
  },
];
const names = (id: string | null) => (id === "v1" ? "Jean Nicoli" : null);

describe("rapprochement billet ↔ BledWay", () => {
  it("retient le départ du même jour le plus proche de l'heure du billet", () => {
    expect(bestDeparture(leg, deps, "Europe/Paris", "c")?.id).toBe("soir");
  });
  it("sans heure : seulement s'il n'y a qu'un départ ce jour-là", () => {
    expect(bestDeparture({ ...leg, time: null }, deps, "Europe/Paris", "c")).toBeNull();
    expect(
      bestDeparture({ ...leg, date: "2026-07-13", time: null }, deps, "Europe/Paris", "c")?.id,
    ).toBe("lendemain");
  });
  it("aucune date, aucune autre compagnie : rien d'inventé", () => {
    expect(bestDeparture({ ...leg, date: null }, deps, "Europe/Paris", "c")).toBeNull();
    expect(bestDeparture(leg, deps, "Europe/Paris", "autre")).toBeNull();
  });
  it("signale l'écart d'heure (+30 min) et de navire", () => {
    const issues = legIssues(
      leg,
      deps[1]!,
      "Europe/Paris",
      { companyId: "c", vesselName: "Tassili II" },
      names,
    );
    expect(issues).toEqual([
      { kind: "time", ticket: "19:00", bledway: "19:30" },
      { kind: "vessel", ticket: "Tassili II", bledway: "Jean Nicoli" },
    ]);
  });
  it("aucun écart sous 15 minutes", () => {
    const close = { ...deps[1]!, departure_at: "2026-07-12T17:10:00Z" };
    expect(
      legIssues(leg, close, "Europe/Paris", { companyId: "c", vesselName: "Jean Nicoli" }, names),
    ).toEqual([]);
  });
});
