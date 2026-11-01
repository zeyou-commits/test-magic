import { describe, expect, it } from "vitest";
import {
  clueDate,
  MAX_CHECKS,
  parseClue,
  RECHECK_MS,
  silentChecks,
  type PlannedCrossing,
  type SilentCheck,
  type SilentVessel,
} from "../../../supabase/functions/watch-silent/checks";

const NOW = Date.parse("2026-11-01T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const BUCKET = Math.floor(NOW / RECHECK_MS);

const vessel: SilentVessel = {
  id: "v1",
  name: "Rosalind Franklin",
  mmsi: 212805000,
  imo: 8707329,
  status: "active",
};
const crossing = (over: Partial<PlannedCrossing> = {}): PlannedCrossing => ({
  id: "d1",
  vessel_id: "v1",
  departure_at: hoursAgo(16),
  arrival_at: hoursAgo(-3),
  status: "modified",
  from_port: "Mostaganem",
  to_port: "Valence",
  ...over,
});
const run = (over: Partial<Parameters<typeof silentChecks>[0]> = {}) =>
  silentChecks({
    vessels: [vessel],
    crossings: [crossing()],
    signals: new Map([[212805000, hoursAgo(39)]]),
    incidents: new Set(),
    known: new Set(),
    now: NOW,
    ...over,
  });

describe("navires à contrôler", () => {
  it("contrôle un navire muet en pleine traversée, avec ce qu'il faut pour le chercher", () => {
    expect(run()[0]).toMatchObject({
      phase: "crossing",
      from_port: "Mostaganem",
      to_port: "Valence",
      imo: 8707329,
      mmsi: 212805000,
    });
  });

  it("ne contrôle pas un navire entendu récemment", () => {
    expect(run({ signals: new Map([[212805000, hoursAgo(1)]]) })).toEqual([]);
  });

  it("attend 30 minutes après le départ, et s'arrête 6 heures après l'arrivée", () => {
    expect(run({ crossings: [crossing({ departure_at: hoursAgo(0.25) })] })).toEqual([]);
    expect(run({ crossings: [crossing({ arrival_at: hoursAgo(5) })] })).toHaveLength(1);
    expect(run({ crossings: [crossing({ arrival_at: hoursAgo(7) })] })).toEqual([]);
  });

  it("après un indice, ne relit la fiche qu'à la période suivante", () => {
    const known = new Set([`d1:crossing:${BUCKET}`]);
    expect(run({ known })).toEqual([]);
    expect(run({ known, now: NOW + RECHECK_MS })).toHaveLength(1);
  });

  it("ignore une traversée annulée, un navire inactif ou sous incident", () => {
    expect(run({ crossings: [crossing({ status: "cancelled" })] })).toEqual([]);
    expect(run({ vessels: [{ ...vessel, status: "inactive" }] })).toEqual([]);
    expect(run({ incidents: new Set(["v1"]) })).toEqual([]);
  });

  it("ne garde que la traversée la plus récente d'un navire", () => {
    const checks = run({
      crossings: [crossing(), crossing({ id: "d0", departure_at: hoursAgo(30) })],
    });
    expect(checks.map((c) => c.departure_id)).toEqual(["d1"]);
  });

  it("limite le nombre de lectures par passage, les plus récentes d'abord", () => {
    const vessels = Array.from({ length: 8 }, (_, i) => ({
      ...vessel,
      id: `v${i}`,
      mmsi: 1000 + i,
    }));
    const crossings = vessels.map((v, i) =>
      crossing({ id: `d${i}`, vessel_id: v.id, departure_at: hoursAgo(1 + i / 2) }),
    );
    const checks = run({ vessels, crossings, signals: new Map() });
    expect(checks).toHaveLength(MAX_CHECKS);
    expect(checks[0]?.departure_id).toBe("d0");
  });

  it("sans traversée, contrôle un long silence une seule fois par jour, à l'heure du navire", () => {
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

describe("dates de fiche", () => {
  it("déduit l'année la plus proche quand elle manque", () => {
    expect(clueDate("10-31T20:53", NOW)).toBe(Date.parse("2026-10-31T20:53:00Z"));
    expect(clueDate("01-02T08:00", NOW)).toBe(Date.parse("2027-01-02T08:00:00Z"));
  });

  it("refuse ce qui n'est pas une date complète", () => {
    expect(clueDate("hier", NOW)).toBeNull();
    expect(clueDate("31 octobre", NOW)).toBeNull();
    expect(clueDate(null, NOW)).toBeNull();
  });
});

describe("indice lu sur la fiche", () => {
  const check = run()[0] as SilentCheck;
  const clue = {
    key: check.key,
    last_port: "Mostaganem",
    departed_at: "10-31T20:53",
    destination: "Valence",
    eta: "2026-11-01T13:00:00Z",
    position_age_minutes: 1,
    source_name: "MyShipTracking",
    source_url: "https://www.myshiptracking.com/vessels/rosalind-franklin",
  };

  it("écrit lui-même une ligne simple, présentée comme un indice", () => {
    const parsed = parseClue(clue, [check], NOW);
    expect(parsed?.title).toBe(
      "Rosalind Franklin : parti de Mostaganem le 31/10 à 20:53 UTC, attendu à Valence le 01/11 à 13:00 UTC",
    );
    expect(parsed?.summary).toMatch(
      /^Indice à confirmer, source MyShipTracking. Position vue il y a 1 min par MyShipTracking/,
    );
    expect(parsed?.confidence).toBe("medium");
  });

  it("n'invente pas l'âge de la position quand la fiche ne le donne pas", () => {
    const parsed = parseClue({ ...clue, position_age_minutes: null }, [check], NOW);
    expect(parsed?.summary).not.toMatch(/Position vue/);
  });

  it("accepte n'importe quelle source, à condition qu'elle soit nommée et en https", () => {
    const parsed = parseClue({ ...clue, source_url: "https://ailleurs.example/x" }, [check], NOW);
    expect(parsed?.url?.startsWith("https://ailleurs.example/x#")).toBe(true);
    expect(parseClue({ ...clue, source_url: "http://ailleurs.example" }, [check], NOW)).toBeNull();
    expect(parseClue({ ...clue, source_url: "pas un lien" }, [check], NOW)).toBeNull();
    expect(parseClue({ ...clue, source_name: "" }, [check], NOW)).toBeNull();
  });

  it("n'accorde jamais une confiance haute, et baisse si les ports diffèrent", () => {
    expect(parseClue({ ...clue, confidence: "high" }, [check], NOW)?.confidence).toBe("medium");
    expect(
      parseClue({ ...clue, last_port: "Oran", destination: "Alger" }, [check], NOW)?.confidence,
    ).toBe("low");
  });

  it("relève la confiance quand le navire est au port d'arrivée prévu", () => {
    const here = {
      key: check.key,
      current_port: "Valence",
      arrived_at: "2026-11-01T08:00:00Z",
      source_name: "Site",
      source_url: "https://site.example",
    };
    expect(parseClue(here, [check], NOW)?.confidence).toBe("medium");
    expect(parseClue({ ...here, current_port: "Oran" }, [check], NOW)?.confidence).toBe("low");
  });

  it("la même information donne le même lien, une nouvelle heure un autre lien", () => {
    const a = parseClue(clue, [check], NOW)?.url;
    expect(parseClue({ ...clue, position_age_minutes: 30 }, [check], NOW)?.url).toBe(a);
    expect(parseClue({ ...clue, eta: "2026-11-01T15:00:00Z" }, [check], NOW)?.url).not.toBe(a);
  });

  it("garde une arrivée estimée seule, si elle est plausible", () => {
    const only = {
      key: check.key,
      destination: "Valence",
      eta: "11-01T13:00",
      source_name: "Site",
      source_url: "https://site.example",
    };
    expect(parseClue(only, [check], NOW)?.title).toBe(
      "Rosalind Franklin : attendu à Valence le 01/11 à 13:00 UTC",
    );
    expect(parseClue({ ...only, eta: "2026-11-09T13:00:00Z" }, [check], NOW)).toBeNull();
    expect(parseClue({ ...only, eta: "2026-10-20T13:00:00Z" }, [check], NOW)).toBeNull();
  });

  it.each([
    ["un navire hors de la liste", { key: "autre" }],
    ["aucune date exploitable", { departed_at: "hier", eta: null }],
    ["un départ futur sans estimation", { departed_at: "2026-11-02T10:00:00Z", eta: null }],
    ["un départ trop ancien sans estimation", { departed_at: "2026-10-01T10:00:00Z", eta: null }],
  ])("refuse %s", (_label, change) => {
    expect(parseClue({ ...clue, ...change }, [check], NOW)).toBeNull();
  });
});
