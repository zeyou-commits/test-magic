import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  findPlanningIssues,
  suggestVessels,
  vesselBlocker,
  verificationLinks,
  type PlanningDeparture,
} from "./planning";

const dep = (
  id: string,
  at: string,
  extra: Partial<PlanningDeparture> = {},
): PlanningDeparture => ({
  id,
  route_id: "marseille-alger",
  company_id: "corsica",
  vessel_id: null,
  departure_at: at,
  arrival_at: null,
  duration_minutes: 20 * 60,
  status: "scheduled",
  ...extra,
});

describe("findPlanningIssues", () => {
  it("repère le même bateau deux fois sur la même liaison le même jour", () => {
    const issues = findPlanningIssues([
      dep("a", "2026-11-03T09:00:00Z", { vessel_id: "nicoli" }),
      dep("b", "2026-11-03T10:00:00Z", { vessel_id: "nicoli" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "duplicate", first: { id: "a" }, second: { id: "b" } });
  });

  it("signale un bateau qui repart avant d'être arrivé", () => {
    const issues = findPlanningIssues([
      dep("a", "2026-11-03T09:00:00Z", { vessel_id: "tariq" }),
      dep("b", "2026-11-03T20:00:00Z", { vessel_id: "tariq", route_id: "alger-marseille" }),
    ]);
    expect(issues.map((issue) => issue.kind)).toEqual(["conflict"]);
  });

  it("laisse tranquilles deux bateaux différents ou les départs annulés", () => {
    expect(
      findPlanningIssues([
        dep("a", "2026-11-03T09:00:00Z", { vessel_id: "nicoli" }),
        dep("b", "2026-11-03T10:00:00Z", { vessel_id: "casanova" }),
        dep("c", "2026-11-03T09:30:00Z", {
          vessel_id: "nicoli",
          status: "cancelled",
          route_id: "x",
        }),
      ]),
    ).toEqual([]);
  });
});

describe("suggestVessels", () => {
  const now = Date.parse("2026-10-30T00:00:00Z");

  it("propose le seul navire de la compagnie, sans le mettre sur deux départs à la fois", () => {
    const vessels = [
      { id: "cracovia", name: "Le Cracovia", company_id: "nouris", status: "active" },
    ];
    const suggestions = suggestVessels(
      [
        dep("a", "2026-11-02T17:00:00Z", { company_id: "nouris" }),
        dep("b", "2026-11-02T18:00:00Z", { company_id: "nouris", route_id: "alicante-oran" }),
        dep("c", "2026-11-05T17:00:00Z", { company_id: "nouris" }),
      ],
      vessels,
      now,
    );
    expect(suggestions).toEqual([
      { departureId: "a", vesselId: "cracovia", reason: "only-vessel" },
      { departureId: "c", vesselId: "cracovia", reason: "only-vessel" },
    ]);
  });

  it("reprend le bateau habituel du même créneau", () => {
    const vessels = [
      { id: "nicoli", name: "Jean Nicoli", company_id: "corsica", status: "active" },
      { id: "casanova", name: "Danielle Casanova", company_id: "corsica", status: "active" },
    ];
    const suggestions = suggestVessels(
      [
        dep("past", "2026-11-03T09:00:00Z", { vessel_id: "nicoli" }),
        dep("next", "2026-11-10T09:00:00Z"),
      ],
      vessels,
      now,
    );
    expect(suggestions).toEqual([
      { departureId: "next", vesselId: "nicoli", reason: "usual-slot" },
    ]);
  });
});

describe("verificationLinks", () => {
  it("construit la page Direct Ferries et une recherche datée", () => {
    const links = verificationLinks({
      from: "Valence",
      to: "Mostaganem",
      company: "Baleària",
      departureAt: "2026-11-06T16:00:00Z",
    });
    expect(links.directFerries).toBe("https://www.directferries.fr/valence_mostaganem_ferry.htm");
    expect(decodeURIComponent(links.search)).toContain(
      "Baleària ferry Valence Mostaganem horaires 6 novembre 2026",
    );
    expect(
      verificationLinks({
        from: "Béjaïa",
        to: "Marseille",
        company: "X",
        departureAt: "2026-11-06T16:00:00Z",
      }).directFerries,
    ).toBe("https://www.directferries.fr/bejaia_marseille_ferry.htm");
  });
});

describe("vesselBlocker", () => {
  it("renvoie le départ qui occupe le bateau", () => {
    const busy = dep("busy", "2026-11-02T11:00:00Z", { vessel_id: "tassili" });
    expect(vesselBlocker("tassili", dep("x", "2026-11-03T07:30:00Z"), [busy])?.id).toBe("busy");
    expect(vesselBlocker("tassili", dep("y", "2026-11-05T12:00:00Z"), [busy])).toBeNull();
  });
});
