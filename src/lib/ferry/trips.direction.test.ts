import { describe, expect, it } from "vitest";
import type { Company, Departure, Port, RouteLine } from "./types";
import { buildSailings, legSailings } from "./trips";

const port = (id: string, country: string): Port => ({
  id,
  slug: id,
  name: id,
  country_code: country,
  country_name: country,
  city: null,
  latitude: 0,
  longitude: 0,
  label_anchor: "right",
  label_offset_x: 0,
  label_offset_y: 0,
  status: "active",
  facilities: null,
  notes: null,
  photo_url: null,
  info_source: null,
  info_source_url: null,
  info_verified_at: null,
  is_demo: false,
});

const route = (id: string, from: string, to: string): RouteLine => ({
  id,
  slug: id,
  departure_port_id: from,
  arrival_port_id: to,
  typical_duration_minutes: 600,
  distance_km: null,
  status: "active",
  notes: null,
  color: null,
  is_demo: false,
  company_ids: [],
});

const company: Company = {
  id: "c1",
  slug: "c1",
  name: "Compagnie",
  logo_url: null,
  description: null,
  website_url: null,
  status: "active",
  is_demo: false,
};

const departure = (id: string, routeId: string): Departure => ({
  id,
  route_id: routeId,
  company_id: "c1",
  vessel_id: null,
  schedule_id: null,
  departure_at: new Date(Date.now() + 86400000).toISOString(),
  arrival_at: null,
  duration_minutes: 600,
  status: "scheduled",
  source_name: null,
  source_url: null,
  last_verified_at: null,
  reliability: "verified",
  notes: null,
  is_demo: false,
});

const ports = [port("marseille", "FR"), port("valence", "ES"), port("alger", "DZ"), port("mostaganem", "DZ")];
const routes = [
  route("r1", "marseille", "alger"),
  route("r2", "mostaganem", "valence"),
  route("r3", "alger", "marseille"),
];
const sailings = buildSailings(
  [departure("d1", "r1"), departure("d2", "r2"), departure("d3", "r3")],
  routes,
  ports,
  [company],
  [],
);

describe("verrouillage du sens de traversée", () => {
  it("« Tous » vers « Tous » en Europe → Algérie ne propose jamais un départ algérien", () => {
    const result = legSailings(sailings, [], [], null, null, "eu-dz");
    expect(result.map((s) => s.departure.id)).toEqual(["d1"]);
    expect(result.every((s) => s.from.country_code !== "DZ")).toBe(true);
    expect(result.every((s) => s.to.country_code === "DZ")).toBe(true);
  });

  it("« Tous » vers « Tous » en Algérie → Europe ne propose jamais une arrivée européenne... inversée", () => {
    const result = legSailings(sailings, [], [], null, null, "dz-eu");
    expect(result.map((s) => s.departure.id).sort()).toEqual(["d2", "d3"]);
    expect(result.every((s) => s.from.country_code === "DZ")).toBe(true);
    expect(result.every((s) => s.to.country_code !== "DZ")).toBe(true);
  });

  it("un port précis des deux côtés n'est pas soumis au verrou pays", () => {
    const result = legSailings(sailings, ["mostaganem"], ["valence"], null, null, "eu-dz");
    expect(result.map((s) => s.departure.id)).toEqual(["d2"]);
  });
});
