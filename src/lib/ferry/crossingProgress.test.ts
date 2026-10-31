import { describe, expect, it } from "vitest";
import { crossingProgress, ferryLeft, sceneLabel } from "./crossingProgress";
import type { Departure, Port } from "./types";
import type { LiveShip } from "./tracking";

const departure = {
  id: "trip",
  departure_at: "2026-10-21T08:00:00Z",
  arrival_at: "2026-10-21T18:00:00Z",
  duration_minutes: 600,
  status: "scheduled",
} as Departure;
const from = { longitude: 5, latitude: 43 } as Port;
const to = { longitude: 5, latitude: 37 } as Port;
const now = Date.parse("2026-10-21T13:00:00Z");
describe("signalements validés", () => {
  // Départ prévu 08:00, arrivée 18:00 (10 h).
  const at = "2026-10-21T09:00:00Z";
  it("recalcule l'arrivée à partir de l'heure du signalement « encore à quai »", () => {
    const late = { ...departure, reported_quay_at: "2026-10-21T09:30:00Z" };
    const p = crossingProgress(late, from, to, null, Date.parse("2026-10-21T10:00:00Z"));
    expect(p.times.arrival.iso).toBe("2026-10-21T19:30:00.000Z");
    expect(p.times.arrival.notBefore).toBe(true);
    expect(p.times.arrival.reported).toBe(true);
    expect(p.times.arrival.shiftMinutes).toBe(90);
    expect(p.times.departure.iso).toBe("2026-10-21T09:30:00.000Z");
    expect(p.ratio).toBe(0);
    expect(p.reportedQuay).toBe(true);
    expect(p.scene).toBe("docked");
    expect(p.trust).toBe("reported");
  });
  it("reprend l'avancement depuis le signalement une fois le délai à quai passé", () => {
    const late = { ...departure, reported_quay_at: "2026-10-21T09:30:00Z" };
    const p = crossingProgress(late, from, to, null, Date.parse("2026-10-21T14:30:00Z"));
    expect(p.ratio).toBe(0.5);
    expect(p.reportedQuay).toBe(false);
  });
  it("garde un « à quai » d'avant l'heure prévue sans rien changer", () => {
    const early = { ...departure, reported_quay_at: "2026-10-21T07:00:00Z" };
    const p = crossingProgress(early, from, to, null, Date.parse(at));
    expect(p.times.arrival.iso).toBe("2026-10-21T18:00:00.000Z");
    expect(p.times.arrival.kind).toBe("scheduled");
  });
  it("fait repartir la durée du départ signalé, plus récent que le signalement à quai", () => {
    const left = {
      ...departure,
      reported_quay_at: "2026-10-21T09:30:00Z",
      reported_departed_at: "2026-10-21T10:00:00Z",
    };
    const p = crossingProgress(left, from, to, null, Date.parse("2026-10-21T15:00:00Z"));
    expect(p.times.departure.kind).toBe("observed");
    expect(p.times.departure.reported).toBe(true);
    expect(p.times.arrival.iso).toBe("2026-10-21T20:00:00.000Z");
    expect(p.times.arrival.notBefore).toBeUndefined();
    expect(p.ratio).toBe(0.5);
  });
  it("applique un retard validé, et constate l'arrivée signalée", () => {
    const delayed = { ...departure, reported_delay_minutes: 120 };
    expect(crossingProgress(delayed, from, to, null, Date.parse(at)).times.arrival.iso).toBe(
      "2026-10-21T20:00:00.000Z",
    );
    const arrived = { ...departure, reported_arrived_at: "2026-10-21T17:40:00Z" };
    const p = crossingProgress(arrived, from, to, null, Date.parse("2026-10-21T18:00:00Z"));
    expect(p.times.arrival.kind).toBe("observed");
    expect(p.times.arrival.iso).toBe("2026-10-21T17:40:00.000Z");
    expect(p.ratio).toBe(1);
    expect(p.scene).toBe("disembarking");
  });
  it("n'invente aucun avancement pour un report signalé", () => {
    const off = { ...departure, reported_postponed_at: "2026-10-21T07:00:00Z" };
    const p = crossingProgress(off, from, to, null, Date.parse(at));
    expect(p.ratio).toBeNull();
    expect(p.scene).toBe("stopped");
    expect(p.reportedPostponed).toBe(true);
  });
});

describe("crossing scene", () => {
  const at = (iso: string) => crossingProgress(departure, from, to, null, Date.parse(iso)).scene;
  it("déduit les états à quai de l'horaire, sans les présenter comme constatés", () => {
    expect(at("2026-10-21T03:00:00Z")).toBe("docked");
    expect(at("2026-10-21T06:00:00Z")).toBe("boarding");
    expect(at("2026-10-21T07:30:00Z")).toBe("closed");
    expect(sceneLabel("boarding")).toContain("estimé");
    expect(sceneLabel("disembarking")).toContain("estimé");
  });
  it("suit l'horaire en mer, puis ne prétend pas que le navire est arrivé", () => {
    expect(at("2026-10-21T13:00:00Z")).toBe("sea");
    expect(at("2026-10-21T19:00:00Z")).toBe("stale");
  });
  it("montre un navire immobilisé et n'anime pas une traversée annulée", () => {
    expect(crossingProgress(departure, from, to, null, now, true).scene).toBe("stopped");
    expect(crossingProgress({ ...departure, status: "cancelled" }, from, to, null, now).scene).toBeNull();
  });
  it("laisse la place du quai seulement au départ", () => {
    expect(ferryLeft(0, 62, "boarding", 4)).toBe("max(71px, 4%)");
    expect(ferryLeft(100, 62, "docked", 4)).toBe("96%");
    expect(ferryLeft(40, 62, "sea", 4)).toBe("40%");
  });
});

describe("crossing progress provenance", () => {
  it("labels timetable progress without claiming a live position", () => {
    const p = crossingProgress(departure, from, to, null, now);
    expect(p.ratio).toBe(0.5);
    expect(p.source).toBe("Repère horaire");
    expect(p.times.arrival.kind).toBe("scheduled");
  });
  it("does not invent a duration when arrival and duration are absent", () => {
    expect(
      crossingProgress(
        { ...departure, arrival_at: null, duration_minutes: null },
        from,
        to,
        null,
        now,
      ).ratio,
    ).toBeNull();
  });
  it("bounds progress and hides a cancelled crossing's bar", () => {
    expect(crossingProgress(departure, from, to, null, now + 86400000).ratio).toBe(1);
    expect(crossingProgress(departure, from, to, null, now - 86400000).ratio).toBe(0);
    expect(
      crossingProgress({ ...departure, status: "cancelled" }, from, to, null, now).ratio,
    ).toBeNull();
  });
  it("ignores signals from another crossing", () => {
    const other = {
      departure: { ...departure, id: "other" },
      ageMinutes: 1,
      remainingKm: 0,
    } as LiveShip;
    const p = crossingProgress(departure, from, to, other, now);
    expect(p.signal).toBeNull();
    expect(p.ratio).toBe(0.5);
  });
  it("uses recent geographic data, and falls back explicitly when old", () => {
    const live = {
      departure,
      position: { eventDepartureId: "trip" },
      ageMinutes: 2,
      remainingKm: 200,
      etaIso: null,
    } as unknown as LiveShip;
    expect(crossingProgress(departure, from, to, live, now).source).toContain("AIS");
    expect(crossingProgress(departure, from, to, { ...live, ageMinutes: 45 }, now).source).toBe(
      "Repère horaire",
    );
  });
  it("dit toujours si la position est réelle ou estimée", () => {
    const live = {
      departure,
      position: { eventDepartureId: "trip" },
      ageMinutes: 12,
      remainingKm: 200,
      etaIso: null,
    } as unknown as LiveShip;
    expect(crossingProgress(departure, from, to, null, now).trust).toBe("schedule");
    const fresh = crossingProgress(departure, from, to, live, now);
    expect(fresh.trust).toBe("live");
    expect(fresh.trustLabel).toBe("Position réelle · il y a 12 min");
    const old = crossingProgress(departure, from, to, { ...live, ageMinutes: 130 }, now);
    expect(old.trust).toBe("aged");
    expect(old.trustLabel).toBe("Estimation · dernière position il y a 2 h 10");
  });
  it("l'heure passée ne vaut pas arrivée, et un navire resté à quai n'est jamais « arrivé »", () => {
    const after = Date.parse("2026-10-21T20:00:00Z");
    expect(crossingProgress(departure, from, to, null, after).arrivalDue).toBe(true);
    const quay = {
      departure,
      position: {
        latitude: 43,
        longitude: 5,
        speedKnots: 0,
        reportedAt: "2026-10-21T19:50:00Z",
      },
      ageMinutes: 10,
      remainingKm: 660,
      etaIso: null,
    } as unknown as LiveShip;
    const stuck = crossingProgress(departure, from, to, quay, after);
    expect(stuck.hold).toMatchObject({ fresh: true });
    expect(stuck.arrivalDue).toBe(false);
    expect(stuck.ratio).toBe(0);
  });
  it("labels an observed arrival as AIS rather than timetable progress", () => {
    const live = {
      departure,
      position: {
        eventDepartureId: "trip",
        atdAt: departure.departure_at,
        ataAt: departure.arrival_at,
      },
      ageMinutes: 45,
      remainingKm: 0,
      etaIso: null,
    } as unknown as LiveShip;
    const progress = crossingProgress(departure, from, to, live, now);
    expect(progress.ratio).toBe(1);
    expect(progress.source).toBe("Arrivée constatée (AIS)");
  });
});
