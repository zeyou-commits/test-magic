import { describe, expect, it } from "vitest";
import {
  DEMO_FILM,
  boardingBlend,
  drivingPauses,
  filmChips,
  filmFrame,
  filmTimes,
  filmZoom,
  minuteAtProgress,
  pathUntil,
  pausingAt,
  progressAtMinute,
  raceRanking,
  stageAt,
} from "./journeyFilm";

const film = DEMO_FILM;
const times = filmTimes(film);

describe("durées et pauses du film", () => {
  it("conseille une pause par tranche de deux heures de conduite", () => {
    expect(drivingPauses(110)).toBe(0);
    expect(drivingPauses(125)).toBe(0);
    expect(drivingPauses(210)).toBe(1);
    expect(drivingPauses(690)).toBe(5);
  });
  it("affiche la durée de chaque portion, dans l'ordre du voyage", () => {
    const chips = filmChips(film);
    expect(chips.map((chip) => chip.label)).toEqual([
      "3 h 30 · 312 km",
      "Pause 15 min",
      "4 h au port",
      "24 h de mer",
      "4 h de sortie",
      "1 h 50 · 140 km",
    ]);
    for (let index = 1; index < chips.length; index += 1)
      expect(chips[index]!.at).toBeGreaterThanOrEqual(chips[index - 1]!.at);
  });
});

describe("le film respecte les pauses et l'embarquement", () => {
  it("arrête le véhicule pendant la pause, puis repart", () => {
    expect(pausingAt(film, 119)).toBe(false);
    expect(pausingAt(film, 125)).toBe(true);
    expect(filmFrame(film, 121).point).toEqual(filmFrame(film, 134).point);
    expect(filmFrame(film, 136).point).not.toEqual(filmFrame(film, 134).point);
    expect(pausingAt(film, 200)).toBe(false);
  });
  it("arrive au port à la fin de la route, pauses comprises", () => {
    expect(filmFrame(film, times.port - 0.01).point[1]).toBeCloseTo(film.road.at(-1)![1], 1);
  });
  it("fait embarquer la voiture à la fin de l'attente et la fait ressortir", () => {
    expect(boardingBlend(film, 10)).toBe(0);
    expect(boardingBlend(film, times.port + 10)).toBe(0);
    expect(boardingBlend(film, times.sea - 0.01)).toBeGreaterThan(0.9);
    expect(boardingBlend(film, times.sea + 60)).toBe(1);
    expect(boardingBlend(film, times.disembark + 1)).toBeGreaterThan(0.9);
    expect(boardingBlend(film, times.last - 1)).toBe(0);
  });
});

describe("course entre les trajets", () => {
  it("fait gagner le premier arrivé, pas le plus court", () => {
    const ranking = raceRanking([
      { id: "court", label: "Court", startMin: 3000, totalMin: 1500, estimated: false },
      { id: "long", label: "Long", startMin: 0, totalMin: 2400, estimated: false },
    ]);
    expect(ranking.map((entry) => [entry.id, entry.arriveMin, entry.gapMin])).toEqual([
      ["long", 2400, 0],
      ["court", 4500, 2100],
    ]);
  });
  it("désigne le plus rapide et l'écart des autres", () => {
    const ranking = raceRanking([
      { id: "a", label: "Marseille", totalMin: 2200, estimated: false },
      { id: "b", label: "Sète", totalMin: 2100, estimated: false },
      { id: "c", label: "Barcelone", totalMin: 2400, estimated: true },
    ]);
    expect(ranking.map((entry) => [entry.label, entry.rank, entry.gapMin])).toEqual([
      ["Sète", 1, 0],
      ["Marseille", 2, 100],
      ["Barcelone", 3, 300],
    ]);
    expect(raceRanking([])).toEqual([]);
  });
});

describe("film du trajet porte à porte", () => {
  it("enchaîne les cinq étapes dans le bon ordre", () => {
    expect(stageAt(film, 0)).toBe("road");
    expect(stageAt(film, times.port)).toBe("port");
    expect(stageAt(film, times.sea + 1)).toBe("sea");
    expect(stageAt(film, times.disembark)).toBe("disembark");
    expect(stageAt(film, times.last)).toBe("last");
    expect(stageAt(film, times.total)).toBe("done");
  });
  it("place le voyageur au port pendant l'attente, et à destination à la fin", () => {
    expect(filmFrame(film, times.port + 30).point).toEqual(film.road.at(-1));
    expect(filmFrame(film, times.disembark + 30).point).toEqual(film.sea.at(-1));
    expect(filmFrame(film, times.total).point).toEqual(film.last.at(-1));
  });
  it("ne trace la mer et la dernière route qu'une fois commencées", () => {
    expect(filmFrame(film, 10).seaDone).toEqual([]);
    expect(filmFrame(film, 10).lastDone).toEqual([]);
    expect(filmFrame(film, times.sea + 60).seaDone.length).toBeGreaterThan(1);
  });
  it("coupe un tracé à la fraction demandée", () => {
    const path = pathUntil(
      [
        [0, 0],
        [10, 0],
      ],
      0.5,
    );
    expect(path.at(-1)).toEqual([5, 0]);
  });
  it("reste proche sur la route et s'élargit en mer", () => {
    expect(filmZoom(film, 30)).toBeGreaterThan(7);
    expect(filmZoom(film, times.sea + film.ferryMin / 2)).toBeLessThan(6);
    expect(filmZoom(film, times.last)).toBeGreaterThan(9);
  });
  it("donne sa part à chaque étape en lecture, dans les deux sens", () => {
    expect(minuteAtProgress(film, 0)).toBe(0);
    expect(minuteAtProgress(film, 1)).toBe(times.total);
    expect(stageAt(film, minuteAtProgress(film, 0.1))).toBe("road");
    expect(stageAt(film, minuteAtProgress(film, 0.5))).toBe("sea");
    expect(progressAtMinute(film, minuteAtProgress(film, 0.6))).toBeCloseTo(0.6, 5);
  });
});
