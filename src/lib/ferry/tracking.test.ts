import { describe, expect, it } from "vitest";
import {
  departureForSignal,
  estimateArrival,
  dockedAt,
  estimateCrossingArrival,
  vesselElsewhere,
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

describe("ETA d'une traversée : départ réel + durée prévue", () => {
  const alger = { longitude: 3.07, latitude: 36.77 };
  const marseille = { longitude: 5.36, latitude: 43.3 };
  // Départ prévu 18:30 UTC, arrivée prévue le lendemain 07:30 : 13 h de traversée.
  const crossing = {
    id: "dep-1",
    departure_at: "2026-11-06T18:30:00Z",
    arrival_at: "2026-11-07T07:30:00Z",
    duration_minutes: 780,
  };
  const at = (iso: string) => Date.parse(iso);
  const signal = (extra: Partial<LivePosition>): LivePosition => ({
    ...position,
    latitude: 40,
    longitude: 4.5,
    speedKnots: 20,
    reportedAt: "2026-11-06T22:00:00Z",
    ...extra,
  });

  it("parti avec 1 h 10 de retard : arrivée = départ réel + 13 h", () => {
    const result = estimateCrossingArrival(
      signal({ atdAt: "2026-11-06T19:40:00Z", eventDepartureId: "dep-1" }),
      crossing,
      alger,
      marseille,
      at("2026-11-06T23:00:00Z"),
    );
    expect(result).toMatchObject({
      etaIso: "2026-11-07T08:40:00.000Z",
      delayMinutes: 70,
      etaBasis: "departure",
    });
  });

  it("même sans nouveau signal en pleine mer, l'estimation reste celle du départ réel", () => {
    const result = estimateCrossingArrival(
      signal({
        atdAt: "2026-11-06T19:40:00Z",
        eventDepartureId: "dep-1",
        reportedAt: "2026-11-06T20:30:00Z",
      }),
      crossing,
      alger,
      marseille,
      at("2026-11-07T03:00:00Z"),
    );
    expect(result.etaIso).toBe("2026-11-07T08:40:00.000Z");
  });

  it("encore à quai 45 min après l'heure prévue : arrivée repoussée d'autant", () => {
    const result = estimateCrossingArrival(
      signal({
        latitude: 36.77,
        longitude: 3.07,
        speedKnots: 0,
        reportedAt: "2026-11-06T19:15:00Z",
      }),
      crossing,
      alger,
      marseille,
      at("2026-11-06T19:20:00Z"),
    );
    expect(result).toMatchObject({ delayMinutes: 45, etaBasis: "docked" });
  });

  it("en approche finale, distance ÷ vitesse prend le relais", () => {
    const result = estimateCrossingArrival(
      signal({
        latitude: 43.2,
        longitude: 5.3,
        speedKnots: 15,
        reportedAt: "2026-11-07T07:00:00Z",
      }),
      crossing,
      alger,
      marseille,
      at("2026-11-07T07:05:00Z"),
    );
    expect(result.etaBasis).toBe("approach");
    expect(Date.parse(result.etaIso!)).toBeLessThan(at("2026-11-07T08:00:00Z"));
  });

  it("le départ réel d'une autre traversée n'est jamais utilisé", () => {
    expect(
      estimateCrossingArrival(
        signal({ atdAt: "2026-11-06T19:40:00Z", eventDepartureId: "autre" }),
        crossing,
        alger,
        marseille,
        at("2026-11-06T23:00:00Z"),
      ).etaIso,
    ).toBeNull();
  });
});

describe("cas réel : Jean Nicoli amarré à Marseille le 30/10 (VesselFinder : arrivé le 29 à 14:45 UTC)", () => {
  const ports = [
    { id: "alger", latitude: 36.77, longitude: 3.06 },
    { id: "marseille", latitude: 43.3, longitude: 5.36 },
  ];
  const routes = [
    { id: "alg-mrs", departure_port_id: "alger", arrival_port_id: "marseille" },
  ] as RouteLine[];
  const crossing = {
    id: "d-29",
    route_id: "alg-mrs",
    vessel_id: "nicoli",
    departure_at: "2026-10-29T08:00:00Z",
    arrival_at: "2026-10-30T08:00:00Z",
    duration_minutes: 1440,
    status: "modified",
  } as Departure;
  // Position réelle enregistrée : terminal ferry, à 4,3 km du point « Marseille », à l'arrêt.
  const moored: LivePosition = {
    ...position,
    latitude: 43.337395,
    longitude: 5.34466,
    speedKnots: 0,
    reportedAt: "2026-10-29T23:43:23Z",
    lastPortId: null,
    atdAt: null,
    ataAt: null,
  };
  const t = Date.parse("2026-10-30T01:36:00Z");

  it("le navire est reconnu à quai à Marseille malgré les 4,3 km", () => {
    expect(dockedAt(moored, ports)).toBe("marseille");
  });
  it("la traversée affiche « Arrivée constatée », à quai, et non 73 % d'avancement", () => {
    const departure = departureForSignal(
      [crossing],
      { id: "nicoli" } as Vessel,
      moored,
      routes,
      t,
      ports,
    );
    expect(departure?.id).toBe("d-29");
    const estimate = estimateCrossingArrival(moored, crossing, ports[0]!, ports[1]!, t);
    expect(estimate.etaBasis).toBe("arrived");
    const times = trackingTimes(crossing, {
      ...live(moored),
      departure: crossing,
      ...estimate,
    } as LiveShip);
    expect(times.arrival).toMatchObject({ kind: "observed", seenOnly: true, shiftMinutes: null });
  });
});

describe("navire vu dans un autre port que son départ", () => {
  const routes = [
    { id: "alg-mrs", departure_port_id: "alger", arrival_port_id: "marseille" },
    { id: "mrs-alg", departure_port_id: "marseille", arrival_port_id: "alger" },
  ] as RouteLine[];
  const vessel = { id: "tariq" } as Vessel;
  const fromAlger = {
    id: "d-alg",
    route_id: "alg-mrs",
    vessel_id: "tariq",
    departure_at: "2026-11-06T17:00:00Z",
    arrival_at: "2026-11-07T06:00:00Z",
    status: "scheduled",
  } as Departure;
  // À quai à Marseille, signal de 14:00, après une traversée Alger → Marseille terminée la veille.
  const atMarseille: LivePosition = {
    ...position,
    speedKnots: 0,
    reportedAt: "2026-11-06T14:00:00Z",
    lastPortId: "marseille",
    departurePortId: "alger",
    atdAt: "2026-11-05T09:00:00Z",
    ataAt: "2026-11-05T22:00:00Z",
  };
  const t = Date.parse("2026-11-06T15:00:00Z");

  it("n'est pas rattaché au départ d'Alger", () => {
    expect(departureForSignal([fromAlger], vessel, atMarseille, routes, t)).toBeNull();
  });
  it("est signalé « encore à Marseille » pour ce départ", () => {
    expect(vesselElsewhere(fromAlger, atMarseille, routes, t)).toEqual({
      portId: "marseille",
      reportedAt: "2026-11-06T14:00:00Z",
    });
  });
  it("reste rattaché à un départ de Marseille", () => {
    const fromMarseille = { ...fromAlger, id: "d-mrs", route_id: "mrs-alg" } as Departure;
    expect(departureForSignal([fromMarseille], vessel, atMarseille, routes, t)?.id).toBe("d-mrs");
    expect(vesselElsewhere(fromMarseille, atMarseille, routes, t)).toBeNull();
  });
  it("un signal de plus de 6 h ne déclenche rien", () => {
    expect(
      vesselElsewhere(fromAlger, atMarseille, routes, Date.parse("2026-11-06T21:00:00Z")),
    ).toBeNull();
  });
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
  it("présente quatre heures avant par défaut et respecte une consigne de compagnie", () => {
    const port = { country_code: "ES" };
    expect(getBoardingMilestones(departure.departure_at, port)?.callTime.toISOString()).toBe(
      "2026-10-19T16:30:00.000Z",
    );
    expect(
      getBoardingMilestones(departure.departure_at, port, {
        presentationMinutes: 180,
      })?.callTime.toISOString(),
    ).toBe("2026-10-19T17:30:00.000Z");
    // Piéton : une heure plus tard que le véhicule, avec ou sans consigne renseignée.
    expect(
      getBoardingMilestones(departure.departure_at, port, { onFoot: true })?.callTime.toISOString(),
    ).toBe("2026-10-19T17:30:00.000Z");
    expect(
      getBoardingMilestones(departure.departure_at, port, {
        presentationMinutes: 180,
        onFoot: true,
      })?.callTime.toISOString(),
    ).toBe("2026-10-19T18:30:00.000Z");
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
