import { describe, expect, it } from "vitest";
import {
  delayLabel,
  estimateCrossingArrival,
  trackingTimes,
  type CrossingSchedule,
  type LivePosition,
  type LiveShip,
} from "./tracking";

// Cas réel du Rosalind Franklin, 01/11/2026 : parti en retard, le signal revient à 58 km de Valence.
const crossing: CrossingSchedule = {
  id: "d1",
  departure_at: "2026-10-31T17:30:00Z",
  arrival_at: "2026-11-01T13:00:00Z",
  duration_minutes: 1170,
  status: "modified",
  reported_quay_at: "2026-10-31T18:55:30Z",
  reported_delay_minutes: 120,
};
const valence = { latitude: 39.45, longitude: -0.32 };
const mostaganem = { latitude: 35.94, longitude: 0.09 };
const position = (over: Partial<LivePosition> = {}): LivePosition => ({
  mmsi: 212805000,
  vesselName: "ROSALIND FRANKLIN",
  status: "0",
  latitude: 39.0697,
  longitude: 0.1557,
  speedKnots: 14.4,
  courseDeg: 320.2,
  reportedAt: "2026-11-01T10:16:37Z",
  fetchedAt: "2026-11-01T10:17:00Z",
  ...over,
});
const NOW = Date.parse("2026-11-01T10:20:00Z");

const estimate = (p: LivePosition, now = NOW) =>
  estimateCrossingArrival(
    p,
    { ...crossing, duration_minutes: crossing.duration_minutes ?? null },
    mostaganem,
    valence,
    now,
  );
const times = (p: LivePosition, now = NOW) => {
  const eta = estimate(p, now);
  return trackingTimes(crossing, {
    departure: crossing,
    position: p,
    etaIso: eta.etaIso,
    etaBasis: eta.etaBasis,
  } as unknown as LiveShip);
};

describe("indices web approuvés", () => {
  const tassili: CrossingSchedule = {
    id: "d2",
    departure_at: "2026-10-31T11:00:00Z",
    arrival_at: "2026-11-01T11:00:00Z",
    duration_minutes: 1440,
    status: "scheduled",
  };

  it("le départ approuvé décale l'arrivée de la même durée", () => {
    const result = trackingTimes({ ...tassili, web_departed_at: "2026-10-31T11:51:00Z" });
    expect(result.departure).toMatchObject({ kind: "observed", reported: true, shiftMinutes: 51 });
    expect(result.arrival).toMatchObject({ iso: "2026-11-01T11:51:00.000Z", shiftMinutes: 51 });
  });

  it("l'arrivée approuvée est présentée comme constatée", () => {
    const result = trackingTimes({ ...tassili, web_arrived_at: "2026-11-01T10:30:00Z" });
    expect(result.arrival).toMatchObject({ kind: "observed", shiftMinutes: -30 });
  });

  it("l'arrivée estimée approuvée remplace le calcul par la durée", () => {
    const result = trackingTimes({
      ...tassili,
      web_departed_at: "2026-10-31T11:51:00Z",
      web_eta_at: "2026-11-01T13:00:00Z",
    });
    expect(result.arrival).toMatchObject({ iso: "2026-11-01T13:00:00.000Z", shiftMinutes: 120 });
  });

  it("un signalement validé passe avant l'indice web", () => {
    const result = trackingTimes({
      ...tassili,
      reported_departed_at: "2026-10-31T12:30:00Z",
      web_departed_at: "2026-10-31T11:51:00Z",
    });
    expect(result.departure.iso).toBe("2026-10-31T12:30:00.000Z");
  });

  it("le signal AIS récent en approche passe avant l'indice web", () => {
    const web = { ...crossing, web_eta_at: "2026-11-01T16:00:00Z" };
    const p = position();
    const eta = estimate(p);
    const result = trackingTimes(web, {
      departure: web,
      position: p,
      etaIso: eta.etaIso,
      etaBasis: eta.etaBasis,
    } as unknown as LiveShip);
    expect(result.arrival.fromSignal).toBe(true);
  });
});

describe("le signal AIS récent prime sur le signalement", () => {
  it("calcule l'arrivée d'un navire en route vers le port, même à plus de 30 km", () => {
    const result = estimate(position());
    expect(result.etaBasis).toBe("approach");
    expect(result.remainingKm).toBeGreaterThan(50);
    expect(Date.parse(result.etaIso!)).toBeLessThan(Date.parse("2026-11-01T13:00:00Z"));
  });

  it("remplace l'arrivée +2 h du signalement, et retire le badge de retard", () => {
    const result = times(position());
    expect(result.arrival.fromSignal).toBe(true);
    expect(result.arrival.reported).toBeUndefined();
    expect(result.arrival.shiftMinutes).toBeLessThan(0);
    expect(delayLabel(result)).toBeNull();
  });

  it("retire le retard signalé du départ, et revient à l'heure prévue sans retard", () => {
    const { departure } = times(position());
    expect(departure).toMatchObject({ kind: "scheduled", shiftMinutes: null });
    expect(departure.reported).toBeUndefined();
    expect(departure.notBefore).toBeUndefined();
  });

  it("garde un départ réellement constaté ou signalé", () => {
    const web = { ...crossing, web_departed_at: "2026-10-31T20:42:00Z" };
    const p = position();
    const eta = estimate(p);
    const { departure } = trackingTimes(web, {
      departure: web,
      position: p,
      etaIso: eta.etaIso,
      etaBasis: eta.etaBasis,
    } as unknown as LiveShip);
    expect(departure).toMatchObject({ kind: "observed", reported: true, shiftMinutes: 192 });
  });

  it("annonce le retard si le signal le montre", () => {
    const result = times(position({ speedKnots: 4, reportedAt: "2026-11-01T10:16:37Z" }));
    expect(result.arrival.fromSignal).toBe(true);
    expect(delayLabel(result)).toMatch(/^≈ \+/);
  });

  it("ne suit pas un navire qui ne va pas vers le port", () => {
    const result = times(position({ courseDeg: 150 }));
    expect(result.arrival.fromSignal).toBeUndefined();
    expect(result.arrival.reported).toBe(true);
    expect(delayLabel(result)).toBe("≈ +2 h");
  });

  it("garde l'estimation du dernier signal tant que son heure n'est pas passée", () => {
    const result = times(position(), Date.parse("2026-11-01T11:10:00Z"));
    expect(result.arrival.fromSignal).toBe(true);
    expect(result.arrival.signalAt).toBe("2026-11-01T10:16:37Z");
    expect(delayLabel(result)).toBeNull();
  });

  it("revient au signalement une fois l'heure estimée passée", () => {
    const result = times(position(), Date.parse("2026-11-01T13:00:00Z"));
    expect(result.arrival.fromSignal).toBeUndefined();
    expect(result.arrival.reported).toBe(true);
  });

  it("ne suit pas un navire trop loin pour que la ligne droite soit fiable", () => {
    expect(estimate(position({ latitude: 37.5, longitude: 0.8 })).etaBasis).toBeNull();
  });
});
