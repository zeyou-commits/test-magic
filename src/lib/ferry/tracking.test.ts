import { describe, expect, it } from "vitest";
import {
  departureForSignal,
  estimateArrival,
  projectedPosition,
  trackingTimes,
  type LivePosition,
  type LiveShip,
} from "./tracking";
import type { Departure, RouteLine, Vessel } from "./types";
import { getBoardingMilestones } from "./boarding";

const now = Date.parse("2026-10-20T00:00:00Z");
const position: LivePosition = {
  mmsi: 1,
  vesselName: null,
  status: null,
  latitude: 37,
  longitude: 2,
  speedKnots: 20,
  courseDeg: 0,
  reportedAt: new Date(now).toISOString(),
  fetchedAt: new Date(now).toISOString(),
};
const arrival = { latitude: 38, longitude: 2 };
const departure = {
  id: "d",
  vessel_id: "v",
  route_id: "r",
  status: "scheduled",
  departure_at: "2026-10-19T20:30:00Z",
  arrival_at: "2026-10-20T14:00:00Z",
} as Departure;
const live = (p = position): LiveShip => ({
  vessel: { id: "v" } as Vessel,
  departure,
  route: { id: "r" } as RouteLine,
  position: p,
  phase: "sea",
  ageMinutes: 0,
  ...estimateArrival(p, arrival, departure.arrival_at, now),
});

describe("fiabilité AIS", () => {
  it("un signal inchangé conserve exactement la même ETA après 20 minutes", () => {
    const first = estimateArrival(position, arrival, departure.arrival_at, now);
    const later = estimateArrival(
      { ...position, fetchedAt: new Date(now + 20 * 60_000).toISOString() },
      arrival,
      departure.arrival_at,
      now + 20 * 60_000,
    );
    expect(first.etaIso).not.toBeNull();
    expect(later.etaIso).toBe(first.etaIso);
    expect(later.delayMinutes).toBe(first.delayMinutes);
  });
  it("un ancien signal conserve son ETA ancrée, sans la repousser à chaque rafraîchissement", () => {
    expect(estimateArrival(position, arrival, departure.arrival_at, now + 31 * 60_000).etaIso).toBe(
      estimateArrival(position, arrival, departure.arrival_at, now).etaIso,
    );
  });
  it("une tentative récente sans date AIS ne crée pas une ETA", () => {
    expect(
      estimateArrival({ ...position, reportedAt: null }, arrival, departure.arrival_at, now).etaIso,
    ).toBeNull();
  });
  it("moins de 3 nœuds ne permet pas une ETA de croisière", () => {
    expect(
      estimateArrival({ ...position, speedKnots: 2 }, arrival, departure.arrival_at, now).etaIso,
    ).toBeNull();
  });
  it("le programme ne devient jamais une estimation", () => {
    const result = trackingTimes(departure, { ...live(), etaIso: null });
    expect(result.arrival.kind).toBe("scheduled");
    expect(result.arrival.iso).toBe("2026-10-20T14:00:00.000Z");
    expect(result.arrival.shiftMinutes).toBeNull();
  });
  it("un départ AIS antérieur au programme est prioritaire seulement pour sa traversée", () => {
    const p = { ...position, atdAt: "2026-10-19T20:00:00Z", eventDepartureId: "d" };
    expect(trackingTimes(departure, live(p)).departure.iso).toBe("2026-10-19T20:00:00Z");
    expect(trackingTimes(departure, live(p)).departure.shiftMinutes).toBe(-30);
    expect(trackingTimes(departure, live({ ...p, eventDepartureId: "old" })).departure.kind).toBe(
      "scheduled",
    );
  });
  it("une arrivée constatée prime sur l'ETA même si le signal vieillit", () => {
    const p = {
      ...position,
      eventDepartureId: "d",
      atdAt: "2026-10-19T20:00:00Z",
      ataAt: "2026-10-20T13:28:00Z",
    };
    expect(trackingTimes(departure, { ...live(p), ageMinutes: 120 }).arrival.iso).toBe(
      "2026-10-20T13:28:00Z",
    );
    expect(trackingTimes(departure, live(p)).arrival.kind).toBe("observed");
  });
  it("le rattachement ambigu est refusé", () => {
    expect(
      departureForSignal(
        [departure, { ...departure, id: "other" }],
        { id: "v" } as Vessel,
        position,
        [],
        now,
      ),
    ).toBeNull();
  });
  it("les événements liés préservent la traversée malgré un retard", () => {
    expect(
      departureForSignal(
        [departure],
        { id: "v" } as Vessel,
        { ...position, eventDepartureId: "d" },
        [],
        now + 24 * 3600_000,
      )?.id,
    ).toBe("d");
  });
  it("la projection convertit correctement 20 nœuds pendant une heure, plafonnée à 40 minutes", () => {
    expect(projectedPosition(position, now + 3600_000)[1]).toBeCloseTo(37.222, 2);
  });
  it("la HLE reste H−1 de l'horaire officiel, même avec une ETA retardée", () => {
    expect(
      getBoardingMilestones(departure.departure_at, {
        country_code: "ES",
      })?.lastBoardingTime.toISOString(),
    ).toBe("2026-10-19T19:30:00.000Z");
  });
});
describe("horaires compacts avec durée publiée", () => {
  it("retrouve une arrivée le lendemain sans la présenter comme un signal", () => {
    const result = trackingTimes({ ...departure, arrival_at: null, duration_minutes: 1440 });
    expect(result.arrival.iso).toBe("2026-10-20T20:30:00.000Z");
    expect(result.arrival.kind).toBe("scheduled");
  });
  it("n'invente pas d'arrivée sans durée ni horaire", () => {
    expect(
      trackingTimes({ ...departure, arrival_at: null, duration_minutes: null }).arrival.kind,
    ).toBe("unavailable");
  });
  it("conserve l'arrivée publiée même si la durée générique diffère", () => {
    expect(trackingTimes({ ...departure, duration_minutes: 1440 }).arrival.iso).toBe(
      "2026-10-20T14:00:00.000Z",
    );
  });
});

describe("projection de position sans déplacement fictif", () => {
  it("ne projette rien en l'absence de date du signal", () => {
    expect(projectedPosition({ ...position, reportedAt: null }, now + 3600_000)).toEqual([
      position.longitude,
      position.latitude,
    ]);
  });
  it("une heure ne parcourt pas mille fois la distance réelle", () => {
    const projected = projectedPosition(position, now + 3600_000);
    expect(projected[0]).toBeCloseTo(position.longitude, 6);
    expect(projected[1] - position.latitude).toBeGreaterThan(0.2);
    expect(projected[1] - position.latitude).toBeLessThan(0.25);
  });
  it("un signal futur ou une vitesse incohérente reste à sa dernière position", () => {
    expect(
      projectedPosition({ ...position, reportedAt: new Date(now + 3600_000).toISOString() }, now),
    ).toEqual([2, 37]);
    expect(projectedPosition({ ...position, speedKnots: 100 }, now + 3600_000)).toEqual([2, 37]);
  });
});
