import { describe, expect, it } from "vitest";
import {
  bookingSearch,
  closestArrival,
  companionSteps,
  defaultPlan,
  departurePorts,
  haversineKm,
  planDay,
  planFare,
} from "./companion";
import type { Port, RouteLine } from "./types";

const port = (id: string, name: string, country_code: string, longitude: number, latitude: number) =>
  ({ id, name, country_code, country_name: country_code, longitude, latitude }) as Port;
const route = (id: string, from: string, to: string, minutes: number) =>
  ({ id, departure_port_id: from, arrival_port_id: to, typical_duration_minutes: minutes }) as RouteLine;

const marseille = port("mrs", "Marseille", "FR", 5.36, 43.3);
const sete = port("set", "Sète", "FR", 3.7, 43.4);
const barcelone = port("bcn", "Barcelone", "ES", 2.17, 41.38);
const alger = port("alg", "Alger", "DZ", 3.06, 36.77);
const oran = port("orn", "Oran", "DZ", -0.64, 35.7);
const bejaia = port("bja", "Béjaïa", "DZ", 5.08, 36.75);
const ports = [marseille, sete, barcelone, alger, oran, bejaia];
const routes = [
  route("r1", "mrs", "alg", 1200),
  route("r2", "mrs", "orn", 1500),
  route("r3", "set", "bja", 1260),
  route("r4", "bcn", "alg", 1080),
  // Le retour ne propose pas de port de départ en Algérie.
  route("r5", "alg", "mrs", 1200),
];

describe("compagnon : préparer mon voyage", () => {
  it("mesure à vol d'oiseau", () => {
    expect(Math.round(haversineKm([5.36, 43.3], [3.06, 36.77]))).toBeGreaterThan(740);
    expect(Math.round(haversineKm([5.36, 43.3], [3.06, 36.77]))).toBeLessThan(760);
  });

  it("classe les ports d'Europe du plus proche au plus loin, sans port algérien", () => {
    const lyon: [number, number] = [4.84, 45.76];
    const list = departurePorts(ports, routes, lyon);
    expect(list.map((c) => c.port.id)).toEqual(["mrs", "set", "bcn"]);
    expect(list[0]!.lines.map((l) => l.to.id)).toEqual(["alg", "orn"]);
  });

  it("sans domicile connu, garde l'ordre alphabétique", () => {
    expect(departurePorts(ports, routes, null).map((c) => c.port.name)).toEqual(["Barcelone", "Marseille", "Sète"]);
  });

  it("choisit l'arrivée la plus proche du bled", () => {
    const [mrs] = departurePorts(ports, routes, [5.36, 43.3]);
    expect(closestArrival(mrs!, [-0.6, 35.6])?.id).toBe("orn");
    expect(closestArrival(mrs!, null)?.id).toBe("alg");
  });

  it("sans voiture, pas d'étape voiture", () => {
    expect(companionSteps({ vehicle: "none" })).not.toContain("car");
    expect(companionSteps({ vehicle: "sedan" })).toContain("car");
  });

  it("prépare la recherche : ports, jour et ± 3 jours", () => {
    const plan = { ...defaultPlan(), month: "2027-07", date: "", fromPortId: "mrs", toPortId: "alg" };
    expect(planDay(plan)).toBe("2027-07-15");
    expect(planDay({ ...plan, date: "2027-07-04" })).toBe("2027-07-04");
    // Un jour d'un autre mois ne compte plus quand le mois change.
    expect(planDay({ ...plan, date: "2027-08-04" })).toBe("2027-07-15");
    expect(bookingSearch(plan)).toBe("/?from=mrs&to=alg&date=2027-07-15&flex=3");
  });

  it("estime plus cher en été qu'en hiver, et plus cher avec la voiture", () => {
    const base = { ...defaultPlan(), vehicle: "none" as const };
    const winter = planFare({ ...base, month: "2027-02" }, marseille, alger, { adults: 2, children: 0 });
    const summer = planFare({ ...base, month: "2027-08" }, marseille, alger, { adults: 2, children: 0 });
    const car = planFare({ ...base, vehicle: "sedan", month: "2027-08" }, marseille, alger, { adults: 2, children: 0 });
    expect(summer.amount).toBeGreaterThan(winter.amount);
    expect(car.amount).toBeGreaterThan(summer.amount);
    expect(summer.benchmarked).toBe(true);
  });
});
