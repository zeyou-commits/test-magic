import { describe, expect, it } from "vitest";
import {
  compareSchedule,
  localToUtc,
  parseBerthed,
  parseCorsicaTimetable,
  portArrivals,
  type DepartureRow,
} from "./officialSchedule";

const ports = [
  { id: "mrs", name: "Marseille", country_code: "FR" },
  { id: "alg", name: "Alger", country_code: "DZ" },
  { id: "bja", name: "Béjaïa", country_code: "DZ" },
  { id: "set", name: "Sète", country_code: "FR" },
];
const routes = [
  { id: "r-ma", departure_port_id: "mrs", arrival_port_id: "alg" },
  { id: "r-am", departure_port_id: "alg", arrival_port_id: "mrs" },
  { id: "r-bm", departure_port_id: "bja", arrival_port_id: "mrs" },
];
const vessels = [
  { id: "jn", name: "Jean Nicoli" },
  { id: "dc", name: "Danielle Casanova" },
];
const now = new Date("2026-11-06T00:00:00Z");

const row = (dep: string, from: string, arr: string, to: string, vessel: string) =>
  `<tr><td>${dep}</td><td>${from}</td><td>${arr}</td><td>${to}</td><td></td><td>${vessel}</td><td>RÉSERVER</td></tr>`;

describe("localToUtc", () => {
  it("tient compte de l'heure d'hiver et d'été", () => {
    expect(localToUtc("2026-11-10T10:00", "Europe/Paris")).toBe("2026-11-10T09:00:00Z");
    expect(localToUtc("2026-07-10T10:00", "Europe/Paris")).toBe("2026-07-10T08:00:00Z");
    expect(localToUtc("2026-07-10T10:00", "Africa/Algiers")).toBe("2026-07-10T09:00:00Z");
  });
});

describe("parseCorsicaTimetable", () => {
  it("lit les lignes du tableau", () => {
    const html = `<table><tr><th>Date de départ</th></tr>${row("10.11.26 à 10:00", "Marseille", "11.11.26 à 09:00", "Alger", "Jean Nicoli")}</table>`;
    expect(parseCorsicaTimetable(html)).toEqual([
      {
        departureLocal: "2026-11-10T10:00",
        from: "Marseille",
        arrivalLocal: "2026-11-11T09:00",
        to: "Alger",
        vessel: "Jean Nicoli",
      },
    ]);
  });
});

describe("compareSchedule", () => {
  const sailings = [
    {
      from: "Béjaïa",
      to: "Marseille",
      departureLocal: "2026-11-06T12:00",
      arrivalLocal: "2026-11-07T12:00",
      vessel: "Jean Nicoli",
    },
    {
      from: "Marseille",
      to: "Alger",
      departureLocal: "2026-11-10T10:00",
      arrivalLocal: "2026-11-11T09:00",
      vessel: "Jean Nicoli",
    },
    {
      from: "Alger",
      to: "Marseille",
      departureLocal: "2026-11-11T10:00",
      arrivalLocal: "2026-11-12T16:00",
      vessel: "Jean Nicoli",
    },
    {
      from: "Marseille",
      to: "Alger",
      departureLocal: "2026-11-17T10:00",
      arrivalLocal: "2026-11-18T09:00",
      vessel: "Jean Nicoli",
    },
    { from: "Marseille", to: "Bastia", departureLocal: "2026-11-10T18:00", vessel: "Galeotta" },
  ];
  const departures: DepartureRow[] = [
    {
      id: "d1",
      route_id: "r-ma",
      vessel_id: "jn",
      departure_at: "2026-11-10T09:00:00Z",
      arrival_at: "2026-11-11T08:15:00Z",
      status: "modified",
    },
    {
      id: "d2",
      route_id: "r-am",
      vessel_id: null,
      departure_at: "2026-11-11T10:00:00Z",
      arrival_at: "2026-11-12T10:00:00Z",
      status: "modified",
    },
    {
      id: "d3",
      route_id: "r-am",
      vessel_id: "jn",
      departure_at: "2026-11-12T08:00:00Z",
      arrival_at: "2026-11-13T08:00:00Z",
      status: "modified",
    },
    {
      id: "d4",
      route_id: "r-ma",
      vessel_id: "jn",
      departure_at: "2026-11-24T09:00:00Z",
      arrival_at: null,
      status: "scheduled",
    },
  ];
  const result = compareSchedule({
    companyName: "Corsica Linea",
    sourceName: "Corsica Linea",
    sailings,
    ports,
    routes,
    vessels,
    departures,
    now,
    allowRemovals: true,
  });

  it("propose la traversée manquante", () => {
    const added = result.filter((p) => p.kind === "new_departure");
    expect(added).toHaveLength(2); // Béjaïa → Marseille le 06/11 et Marseille → Alger le 17/11
    expect(JSON.parse(added[0]!.proposed_value)).toEqual({
      route_id: "r-bm",
      departure_at: "2026-11-06T11:00:00Z",
      arrival_at: "2026-11-07T11:00:00Z",
      vessel_id: "jn",
    });
  });

  it("corrige l'arrivée, les heures et le navire", () => {
    const fixes = result
      .filter((p) => p.kind === "schedule_fix")
      .map((p) => p.kind === "schedule_fix" && `${p.departure_id}:${p.field}`);
    expect(fixes).toEqual(["d1:arrival_at", "d2:departure_at", "d2:arrival_at", "d2:vessel_id"]);
  });

  it("signale la traversée fantôme, mais pas au-delà de la période publiée", () => {
    const removed = result
      .filter((p) => p.kind === "remove_departure")
      .map((p) => p.kind === "remove_departure" && p.departure_id);
    expect(removed).toEqual(["d3"]); // d4 (24/11) est après la dernière date publiée : non jugée
  });

  it("ignore les ports hors BledWay et ne retire rien sans autorisation", () => {
    expect(result.some((p) => p.title.includes("Bastia"))).toBe(false);
    const partial = compareSchedule({
      companyName: "X",
      sourceName: "X",
      sailings,
      ports,
      routes,
      vessels,
      departures,
      now,
      allowRemovals: false,
    });
    expect(partial.some((p) => p.kind === "remove_departure")).toBe(false);
  });
});

describe("ports", () => {
  const html = `<table><tr><th>POSTE</th><th>NAVIRE</th><th>TYPE</th><th>ACCOSTAGE</th></tr>
    <tr><td>3</td><td>JEAN NICOLI</td><td>FERRY</td><td>06/11/2026 11:20:00</td></tr></table>`;
  it("lit les navires à quai et rapproche l'arrivée", () => {
    const berthed = parseBerthed(html);
    expect(berthed).toEqual([{ vessel: "JEAN NICOLI", berthedLocal: "2026-11-06T11:20" }]);
    const found = portArrivals("Béjaïa", "Africa/Algiers", berthed, [
      {
        departure_id: "d",
        vessel_id: "jn",
        vessel: "Jean Nicoli",
        arrival_at: "2026-11-06T10:00:00Z",
        web_arrived_at: null,
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.web_arrived_at).toBe("2026-11-06T10:20:00Z");
  });
});
