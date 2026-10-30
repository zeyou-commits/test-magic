import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutoAssign, visibleSuggestions, type AssignConfig } from "./autoAssign";
import { DEFAULT_RULES, suggestVessels, type PlanningDeparture } from "./planning";

const now = Date.parse("2026-10-30T00:00:00Z");
const dep = (
  id: string,
  company: string,
  extra: Partial<PlanningDeparture> = {},
): PlanningDeparture => ({
  id,
  route_id: "r",
  company_id: company,
  vessel_id: null,
  departure_at: "2026-11-05T10:00:00Z",
  arrival_at: null,
  duration_minutes: 600,
  status: "scheduled",
  ...extra,
});
const vessels = [
  { id: "cracovia", name: "Le Cracovia", company_id: "nouris", status: "active" },
  { id: "tariq", name: "Tariq Ibn Ziyad", company_id: "af", status: "active" },
  { id: "tassili", name: "Tassili II", company_id: "af", status: "active" },
];

describe("règles d'affectation", () => {
  it("reprend le bateau prévu par le calendrier récurrent", () => {
    const result = suggestVessels(
      [dep("a", "af", { schedule_id: "s1" })],
      vessels,
      now,
      DEFAULT_RULES,
      new Map([["s1", "tassili"]]),
    );
    expect(result).toEqual([{ departureId: "a", vesselId: "tassili", reason: "schedule" }]);
  });

  it("ne propose plus rien quand la règle est coupée", () => {
    expect(
      suggestVessels([dep("a", "nouris")], vessels, now, { ...DEFAULT_RULES, onlyVessel: false }),
    ).toEqual([]);
  });

  it("n'affiche aucune proposition pour une compagnie en Manuel", () => {
    const config = { rules: DEFAULT_RULES, modes: new Map([["nouris", "manual" as const]]) };
    expect(visibleSuggestions([dep("a", "nouris")], vessels, config, new Map(), now)).toEqual([]);
  });
});

describe("runAutoAssign", () => {
  // Faux client : enregistre les mises à jour et le journal.
  function fakeDb() {
    const calls: { table: string; values: unknown; ids?: string[] }[] = [];
    const db = {
      from(table: string) {
        const chain = {
          values: undefined as unknown,
          ids: [] as string[],
          update(values: unknown) {
            chain.values = values;
            return chain;
          },
          insert(values: unknown) {
            chain.values = values;
            return chain;
          },
          in(_column: string, ids: string[]) {
            chain.ids = ids;
            return chain;
          },
          is() {
            return chain;
          },
          select() {
            return chain;
          },
          single() {
            calls.push({ table, values: chain.values });
            return Promise.resolve({ data: { id: "log-1" }, error: null });
          },
          then(resolve: (value: unknown) => void) {
            calls.push({ table, values: chain.values, ids: chain.ids });
            resolve({ data: chain.ids.map((id) => ({ id })), error: null });
          },
        };
        return chain;
      },
    };
    return { db: db as unknown as SupabaseClient, calls };
  }

  it("n'affecte que les compagnies en Automatique et journalise le passage", async () => {
    const { db, calls } = fakeDb();
    const config: AssignConfig = {
      rules: DEFAULT_RULES,
      modes: new Map([["nouris", "auto"]]),
      installed: true,
    };
    const result = await runAutoAssign(db, {
      departures: [
        dep("n1", "nouris", { departure_at: new Date(Date.now() + 86_400_000).toISOString() }),
        dep("a1", "af", {
          schedule_id: "s1",
          departure_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ],
      vessels,
      config,
      scheduleVessel: new Map([["s1", "tassili"]]),
      source: "cron",
    });
    expect(result).toEqual({ count: 1, logId: "log-1" });
    expect(calls[0]).toMatchObject({
      table: "departures",
      values: { vessel_id: "cracovia" },
      ids: ["n1"],
    });
    expect(calls[1]).toMatchObject({
      table: "bw_assign_log",
      values: {
        source: "cron",
        items: [{ departure_id: "n1", vessel_id: "cracovia", reason: "only-vessel" }],
      },
    });
  });

  it("ne fait rien tant que le script SQL n'est pas installé", async () => {
    const { db, calls } = fakeDb();
    const result = await runAutoAssign(db, {
      departures: [dep("n1", "nouris")],
      vessels,
      config: { rules: DEFAULT_RULES, modes: new Map([["nouris", "auto"]]), installed: false },
      scheduleVessel: new Map(),
      source: "admin",
    });
    expect(result.count).toBe(0);
    expect(calls).toEqual([]);
  });
});
