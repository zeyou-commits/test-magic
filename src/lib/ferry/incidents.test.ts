import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  alternativeDepartures,
  departureStopped,
  departuresToReview,
  immobilizedVessels,
  impactOnDeparture,
  incidentContradiction,
  incidentForVessel,
  incidentHeadline,
  type VesselIncident,
} from "./incidents";
import type { Departure } from "./types";

const now = Date.parse("2026-11-01T00:00:00Z");
const dep = (id: string, at: string, extra: Partial<Departure> = {}) =>
  ({
    id,
    route_id: "alg-mrs",
    vessel_id: "v2",
    departure_at: at,
    status: "scheduled",
    ...extra,
  }) as Departure;
const incident = (extra: Partial<VesselIncident> = {}) =>
  ({
    id: "i",
    vessel_id: "v1",
    status: "confirmed",
    bw_incident_departures: [{ departure_id: "d1", impact: "confirmed" }],
    ...extra,
  }) as VesselIncident;

describe("navire immobilisé", () => {
  it("un départ non qualifié reste sans conséquence connue", () => {
    expect(impactOnDeparture(incident(), "d1")).toBe("confirmed");
    expect(impactOnDeparture(incident(), "d2")).toBe("none");
  });
  it("préfère le dossier ouvert à un dossier levé", () => {
    const open = incident({ id: "open" });
    const old = incident({ id: "old", status: "resolved" });
    expect(incidentForVessel([old, open], "v1")?.id).toBe("open");
    expect(incidentForVessel([old], "v1")?.id).toBe("old");
    expect(incidentForVessel([open], "autre")).toBeNull();
  });
  it("ne propose au dossier que les départs à venir du navire, sur 14 jours", () => {
    const list = departuresToReview(
      [
        dep("past", "2026-10-30T10:00:00Z", { vessel_id: "v1" }),
        dep("ok", "2026-11-05T10:00:00Z", { vessel_id: "v1" }),
        dep("far", "2026-12-20T10:00:00Z", { vessel_id: "v1" }),
        dep("other", "2026-11-05T10:00:00Z"),
      ],
      "v1",
      now,
    );
    expect(list.map((d) => d.id)).toEqual(["ok"]);
  });
  it("dit où le navire est immobilisé, toujours selon la source", () => {
    expect(
      incidentHeadline(incident({ source_name: "Le Marin" }), "Tariq Ibn Ziyad", "Alicante"),
    ).toBe("Tariq Ibn Ziyad : immobilisé à Alicante selon Le Marin");
    expect(immobilizedVessels([incident({ location_port_id: "ali" })]).get("v1")).toBe("ali");
    expect(immobilizedVessels([incident({ status: "reported" })]).size).toBe(0);
  });
  it("un départ commencé ou touché n'est plus présenté en cours, sauf s'il était fini avant", () => {
    const open = incident({ created_at: "2026-10-27T00:00:00Z" });
    const at = (id: string, iso: string) => ({ id, departure_at: iso, arrival_at: iso });
    expect(departureStopped(open, at("d1", "2026-12-01T10:00:00Z"), now)).toBe(true);
    expect(departureStopped(open, at("d2", "2026-10-30T10:00:00Z"), now)).toBe(true);
    expect(departureStopped(open, at("d2", "2026-12-01T10:00:00Z"), now)).toBe(false);
    expect(departureStopped(open, at("d2", "2026-10-20T10:00:00Z"), now)).toBe(false);
  });
  it("signale à l'équipe un AIS récent qui contredit le dossier", () => {
    const open = incident({ updated_at: "2026-10-31T00:00:00Z", location_port_id: "ali" });
    const ports = [{ id: "ali", longitude: -0.48, latitude: 38.33 }];
    const signal = (reportedAt: string, speedKnots: number, longitude = -0.48) => ({
      reportedAt,
      speedKnots,
      latitude: 38.33,
      longitude,
    });
    expect(incidentContradiction(open, signal("2026-10-31T01:00:00Z", 14), ports)).toBe("moving");
    expect(incidentContradiction(open, signal("2026-10-31T01:00:00Z", 0, 5), ports)).toBe(
      "elsewhere",
    );
    expect(incidentContradiction(open, signal("2026-10-31T01:00:00Z", 0), ports)).toBeNull();
    expect(incidentContradiction(open, signal("2026-10-30T01:00:00Z", 14), ports)).toBeNull();
  });
  it("propose d'autres départs : même liaison d'abord, jamais le navire immobilisé", () => {
    const routes = [
      { id: "alg-mrs", arrival_port_id: "mrs" },
      { id: "ora-mrs", arrival_port_id: "mrs" },
      { id: "alg-sete", arrival_port_id: "sete" },
    ];
    const list = alternativeDepartures(
      dep("x", "2026-11-05T10:00:00Z", { vessel_id: "v1" }),
      [
        dep("near-other-port", "2026-11-05T12:00:00Z", { route_id: "ora-mrs" }),
        dep("same-route", "2026-11-08T10:00:00Z"),
        dep("same-vessel", "2026-11-06T10:00:00Z", { vessel_id: "v1" }),
        dep("wrong-arrival", "2026-11-05T11:00:00Z", { route_id: "alg-sete" }),
        dep("cancelled", "2026-11-05T11:00:00Z", { status: "cancelled" }),
      ],
      routes,
      now,
    );
    expect(list.map((d) => d.id)).toEqual(["same-route", "near-other-port"]);
  });
});
