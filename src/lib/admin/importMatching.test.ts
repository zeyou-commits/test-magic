import { describe, expect, it } from "vitest";
import { matchName, normalizeName, aliasKey, SURE_SCORE, REVIEW_SCORE } from "./importMatching";
import { diffImport, type ImportedDeparture, type PublishedDeparture } from "./importDiff";
import { parseDay, parseTime, readRows, toDeparture } from "./seasonImport";

describe("lecture du fichier", () => {
  it("accepte les formats de date et d'heure courants", () => {
    expect(parseDay("2026-11-06")).toBe("2026-11-06");
    expect(parseDay("6/11/2026")).toBe("2026-11-06");
    expect(parseTime("9h30")).toBe("09:30");
    expect(parseTime("25:00")).toBe("");
  });

  it("reconnaît les colonnes sans accents ni majuscules", () => {
    const [row] = readRows([
      {
        Date: "06/11/2026",
        Heure: "18:30",
        "Heure arrivée": "05:30",
        "Port départ": "Alger",
        "Port arrivée": "Marseille",
        Statut: "annulé",
      },
    ]);
    expect(row).toMatchObject({
      date: "2026-11-06",
      time: "18:30",
      arrivalTime: "05:30",
      from: "Alger",
      status: "cancelled",
    });
  });

  it("calcule l'arrivée du lendemain en heure locale (Alger UTC+1 → Marseille UTC+1 en novembre)", () => {
    const [row] = readRows([{ date: "2026-11-06", heure: "18:30", heure_arrivee: "05:30" }]);
    const result = toDeparture(
      row!,
      {
        fromPort: { id: "alg", country_code: "DZ" },
        toPort: { id: "mrs", country_code: "FR" },
        routeId: "r",
        companyId: "c",
      },
      null,
    );
    expect(result).toMatchObject({
      departure: { departure_at: "2026-11-06T17:30:00.000Z", duration_minutes: 660 },
    });
  });

  it("garde le lendemain quand l'heure d'arrivée suit de peu l'heure de départ", () => {
    const [row] = readRows([{ date: "2026-11-06", heure: "18:30", heure_arrivee: "20:30" }]);
    const result = toDeparture(
      row!,
      {
        fromPort: { id: "set", country_code: "FR" },
        toPort: { id: "bja", country_code: "DZ" },
        routeId: "r",
        companyId: "c",
      },
      1560,
    );
    expect(result).toMatchObject({ departure: { duration_minutes: 26 * 60 } });
  });
});

const vessels = [
  { id: "tariq", name: "Tariq Ibn Ziyad", noise: ["Algérie Ferries"] },
  { id: "djazair", name: "El Djazaïr II", noise: ["Algérie Ferries"] },
  { id: "tassili", name: "Tassili II", noise: ["Algérie Ferries"] },
  { id: "fantastic", name: "Fantastic", noise: ["GNV"] },
  { id: "casanova", name: "Danielle Casanova", noise: ["Corsica Linea"] },
];

describe("matchName", () => {
  it.each([
    ["TARIQ IBN ZIAD", "tariq"],
    ["El Djazair 2", "djazair"],
    ["GNV FANTASTIC", "fantastic"],
    ["Danièle Casanova", "casanova"],
  ])("rattache « %s » sans hésiter", (raw, id) => {
    const result = matchName(raw, vessels);
    expect(result.id).toBe(id);
    expect(result.score).toBeGreaterThanOrEqual(SURE_SCORE);
  });

  it("laisse « Tassili » à vérifier (il a pu exister un Tassili I)", () => {
    const result = matchName("Tassili", vessels);
    expect(result.id).toBe("tassili");
    expect(result.score).toBeLessThan(SURE_SCORE);
    expect(result.score).toBeGreaterThanOrEqual(REVIEW_SCORE);
  });

  it("ne propose rien pour un navire inconnu", () => {
    expect(matchName("GNV Excelsior", vessels).id).toBeNull();
  });

  it("reconnaît une compagnie au nom officiel plus long", () => {
    const companies = [
      { id: "af", name: "Algérie Ferries" },
      { id: "gnv", name: "GNV" },
    ];
    expect(matchName("Algerie Ferries ENTMV", companies).id).toBe("af");
  });

  it("utilise d'abord les correspondances retenues", () => {
    const companies = [{ id: "armas", name: "Naviera Armas - Trasmediterránea" }];
    const aliases = new Map([[aliasKey("Trasmed"), "armas"]]);
    expect(matchName("TRASMED", companies, aliases)).toMatchObject({
      id: "armas",
      reason: "alias",
    });
  });

  it("normalise accents, ponctuation et chiffres romains", () => {
    expect(normalizeName("Béjaïa")).toBe("bejaia");
    expect(normalizeName("El Djazaïr II")).toBe("el djazair 2");
  });
});

describe("diffImport", () => {
  const row = (
    line: number,
    at: string,
    extra: Partial<ImportedDeparture> = {},
  ): ImportedDeparture => ({
    line,
    route_id: "r",
    company_id: "c",
    vessel_id: null,
    departure_at: at,
    arrival_at: at,
    duration_minutes: 600,
    status: "scheduled",
    ...extra,
  });
  const pub = (
    id: string,
    at: string,
    extra: Partial<PublishedDeparture> = {},
  ): PublishedDeparture => ({
    id,
    route_id: "r",
    company_id: "c",
    vessel_id: null,
    departure_at: at,
    arrival_at: at,
    duration_minutes: 600,
    status: "scheduled",
    ...extra,
  });
  const scope = { companyIds: ["c"], from: "2026-11-01T00:00:00Z", to: "2026-11-30T23:59:59Z" };

  it("classe nouveaux, inchangés, modifiés, déplacés et disparus", () => {
    const diff = diffImport(
      [
        row(2, "2026-11-02T10:00:00Z"),
        row(3, "2026-11-03T10:00:00Z", { vessel_id: "v" }),
        row(4, "2026-11-04T11:00:00Z"),
        row(5, "2026-11-05T10:00:00Z"),
        row(6, "2026-11-05T10:00:00Z"),
      ],
      [
        pub("same", "2026-11-02T10:00:00Z"),
        pub("boat", "2026-11-03T10:00:00Z"),
        pub("moved", "2026-11-04T10:00:00Z"),
        pub("gone", "2026-11-06T10:00:00Z"),
        pub("other-company", "2026-11-07T10:00:00Z", { company_id: "x" }),
      ],
      scope,
    );
    expect(diff.unchanged.map((d) => d.before.id)).toEqual(["same"]);
    expect(diff.changed.map((d) => [d.before.id, d.fields])).toEqual([
      ["boat", ["vessel"]],
      ["moved", ["time"]],
    ]);
    expect(diff.added.map((d) => d.line)).toEqual([5]);
    expect(diff.repeated.map((d) => d.line)).toEqual([6]);
    expect(diff.missing.map((d) => d.id)).toEqual(["gone"]);
  });
});
