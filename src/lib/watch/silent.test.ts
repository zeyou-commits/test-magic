import { describe, expect, it } from "vitest";
import {
  MAX_CHECKS,
  parseClue,
  silentChecks,
  type PlannedCrossing,
  type SilentCheck,
  type SilentVessel,
} from "../../../supabase/functions/watch-silent/checks";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const vessel: SilentVessel = {
  id: "v1",
  name: "Rosalind Franklin",
  mmsi: 212805000,
  status: "active",
};
const crossing = (over: Partial<PlannedCrossing> = {}): PlannedCrossing => ({
  id: "d1",
  vessel_id: "v1",
  departure_at: hoursAgo(1),
  arrival_at: hoursAgo(-10),
  status: "scheduled",
  from_port: "Mostaganem",
  to_port: "Valence",
  ...over,
});
const run = (over: Partial<Parameters<typeof silentChecks>[0]> = {}) =>
  silentChecks({
    vessels: [vessel],
    crossings: [crossing()],
    signals: new Map([[212805000, hoursAgo(40)]]),
    incidents: new Set(),
    known: new Set(),
    now: NOW,
    ...over,
  });

describe("navires à contrôler", () => {
  it("cherche un navire muet après son heure de départ", () => {
    const [check] = run();
    expect(check).toMatchObject({ key: "d1:departure", phase: "departure", port: "Mostaganem" });
  });

  it("ne cherche pas si un signal est arrivé autour du départ", () => {
    expect(run({ signals: new Map([[212805000, hoursAgo(2)]]) })).toEqual([]);
  });

  it("attend 30 minutes après l'heure prévue", () => {
    expect(run({ crossings: [crossing({ departure_at: hoursAgo(0.25) })] })).toEqual([]);
  });

  it("arrête de chercher au bout de 6 heures", () => {
    expect(run({ crossings: [crossing({ departure_at: hoursAgo(7) })] })).toEqual([]);
  });

  it("contrôle aussi l'arrivée", () => {
    const crossings = [crossing({ departure_at: hoursAgo(20), arrival_at: hoursAgo(1) })];
    expect(run({ crossings })[0]).toMatchObject({ key: "d1:arrival", port: "Valence" });
  });

  it("ignore une traversée annulée, un navire inactif ou sous incident, un indice déjà trouvé", () => {
    expect(run({ crossings: [crossing({ status: "cancelled" })] })).toEqual([]);
    expect(run({ vessels: [{ ...vessel, status: "inactive" }] })).toEqual([]);
    expect(run({ incidents: new Set(["v1"]) })).toEqual([]);
    expect(run({ known: new Set(["d1:departure"]) })).toEqual([]);
  });

  it("limite le nombre de recherches par passage, les plus récentes d'abord", () => {
    const vessels = Array.from({ length: 8 }, (_, i) => ({
      ...vessel,
      id: `v${i}`,
      mmsi: 1000 + i,
    }));
    const crossings = vessels.map((v, i) =>
      crossing({
        id: `d${i}`,
        vessel_id: v.id,
        departure_at: hoursAgo(1 + i / 2),
        arrival_at: null,
      }),
    );
    const checks = run({ vessels, crossings, signals: new Map() });
    expect(checks).toHaveLength(MAX_CHECKS);
    expect(checks[0]?.key).toBe("d0:departure");
  });

  it("sans traversée, cherche un long silence une seule fois par jour, à l'heure du navire", () => {
    const hour = Math.floor(NOW / 3_600_000) % 24;
    const muted = { ...vessel, mmsi: 24_000 + hour };
    const base = {
      vessels: [muted],
      crossings: [],
      signals: new Map([[muted.mmsi, hoursAgo(72)]]),
    };
    const checks = run(base);
    expect(checks[0]).toMatchObject({ phase: "silence", departure_id: null });
    expect(run({ ...base, known: new Set([checks[0]?.key ?? ""]) })).toEqual([]);
    expect(run({ ...base, vessels: [{ ...muted, mmsi: muted.mmsi + 1 }] })).toEqual([]);
    expect(run({ ...base, signals: new Map([[muted.mmsi, hoursAgo(10)]]) })).toEqual([]);
  });
});

describe("indice trouvé sur le web", () => {
  const check = run()[0] as SilentCheck;
  const clue = {
    key: "d1:departure",
    event: "departure",
    port: "Mostaganem",
    event_at: hoursAgo(3),
    source_name: "MyShipTracking",
    source_url: "https://www.myshiptracking.com/vessels/rosalind-franklin",
    evidence: "Événement PORT DEPARTURE sur la fiche du navire.",
  };

  it("présente toujours l'information comme un indice à confirmer", () => {
    const parsed = parseClue(clue, [check], NOW);
    expect(parsed?.title).toBe(
      "Rosalind Franklin : départ de Mostaganem signalé par MyShipTracking",
    );
    expect(parsed?.summary).toMatch(/^Indice à confirmer/);
    expect(parsed?.confidence).toBe("medium");
  });

  it("n'accorde jamais une confiance haute, et baisse si le port diffère", () => {
    expect(parseClue({ ...clue, confidence: "high" }, [check], NOW)?.confidence).toBe("medium");
    expect(parseClue({ ...clue, port: "Oran" }, [check], NOW)?.confidence).toBe("low");
  });

  it("le même événement donne le même lien, deux événements deux liens", () => {
    const a = parseClue(clue, [check], NOW)?.url;
    expect(parseClue(clue, [check], NOW)?.url).toBe(a);
    expect(parseClue({ ...clue, event_at: hoursAgo(5) }, [check], NOW)?.url).not.toBe(a);
  });

  it.each([
    ["un navire hors de la liste", { key: "autre" }],
    ["une date absente", { event_at: "hier" }],
    ["une date future", { event_at: hoursAgo(-2) }],
    ["une date trop ancienne", { event_at: hoursAgo(24 * 8) }],
    ["un lien non sûr", { source_url: "http://exemple.com" }],
    ["un événement inconnu", { event: "position" }],
    ["une source sans nom", { source_name: "" }],
  ])("refuse %s", (_label, change) => {
    expect(parseClue({ ...clue, ...change }, [check], NOW)).toBeNull();
  });
});
