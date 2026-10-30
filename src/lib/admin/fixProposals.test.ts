import { describe, expect, it } from "vitest";
import { fixChanges, isOverlap, proposeFix } from "./fixProposals";
import type { PlanningDeparture, PlanningIssue } from "./planning";

const dep = (
  id: string,
  route_id: string,
  departure_at: string,
  hours: number,
  source_name = "Import Excel — a.xlsx",
): PlanningDeparture => ({
  id,
  route_id,
  company_id: "c",
  vessel_id: "v",
  departure_at,
  arrival_at: new Date(Date.parse(departure_at) + hours * 3_600_000).toISOString(),
  duration_minutes: hours * 60,
  status: "scheduled",
  source_name,
});
const issue = (first: PlanningDeparture, second: PlanningDeparture): PlanningIssue => ({
  kind: "conflict",
  key: `${first.id}:${second.id}`,
  first,
  second,
});

describe("proposeFix", () => {
  it("préfère le programme nommé à un fichier importé quand le navire est à deux endroits", () => {
    const named = dep("a", "r1", "2026-11-25T09:00:00Z", 22, "Programme Corsica Linea");
    const imported = dep("b", "r2", "2026-11-25T09:00:00Z", 24);
    const fix = proposeFix(issue(named, imported), [named, imported]);
    expect(fix).toMatchObject({ kind: "remove-vessel", departure: { id: "b" } });
  });

  it("propose l'heure habituelle quand elle résout le conflit", () => {
    // Quatre mercredis à 20:00 contre huit à 18:00, heure de Paris en hiver.
    const usual = Array.from({ length: 8 }, (_, i) =>
      dep(`u${i}`, "r1", `2026-12-${String(2 + i * 7 > 30 ? 30 : 2 + i * 7).padStart(2, "0")}T17:00:00Z`, 14),
    );
    const late = dep("late", "r1", "2026-11-11T19:00:00Z", 14);
    const next = dep("next", "r2", "2026-11-12T10:00:00Z", 22);
    const fix = proposeFix(issue(late, next), [late, next, ...usual]);
    expect(fix).toMatchObject({ kind: "shift", toTime: "18:00", deltaMinutes: -120 });
    expect(fixChanges(fix!).apply.departure_at).toBe("2026-11-11T17:00:00.000Z");
  });

  it("ne propose rien sans preuve", () => {
    const a = dep("a", "r1", "2026-12-01T09:00:00Z", 23);
    const b = dep("b", "r2", "2026-12-02T09:00:00Z", 23);
    expect(proposeFix(issue(a, b), [a, b])).toBeNull();
    expect(isOverlap(issue(a, b))).toBe(false);
  });

  it("sait annuler le retrait d'un navire", () => {
    const named = dep("a", "r1", "2026-11-25T09:00:00Z", 22, "Programme X");
    const imported = dep("b", "r2", "2026-11-25T09:00:00Z", 24);
    const changes = fixChanges(proposeFix(issue(named, imported), [named, imported])!);
    expect(changes).toMatchObject({ id: "b", apply: { vessel_id: null }, undo: { vessel_id: "v" } });
  });
});
