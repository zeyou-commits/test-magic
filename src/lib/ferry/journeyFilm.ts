/**
 * Le film du trajet porte à porte : où se trouve le voyageur à chaque minute du voyage.
 * Tout est calculé ici, sans carte, pour que le curseur et l'animation disent la même chose.
 */
export type LngLat = [number, number];
export type FilmStage = "road" | "port" | "sea" | "disembark" | "last" | "done";

export interface JourneyFilm {
  key: string;
  road: LngLat[];
  sea: LngLat[];
  last: LngLat[];
  roadMin: number;
  boardMin: number;
  ferryMin: number;
  disembarkMin: number;
  lastMin: number;
  /** Image du navire (détourée), s'il y en a une. */
  shipImage: string;
  roadKm?: number;
  lastKm?: number;
  pins: { label: string; point: LngLat }[];
}

export function filmTimes(film: JourneyFilm) {
  const port = film.roadMin;
  const sea = port + film.boardMin;
  const disembark = sea + film.ferryMin;
  const last = disembark + film.disembarkMin;
  return { port, sea, disembark, last, total: last + film.lastMin };
}

export function stageAt(film: JourneyFilm, minute: number): FilmStage {
  const times = filmTimes(film);
  if (minute >= times.total) return "done";
  if (minute >= times.last) return "last";
  if (minute >= times.disembark) return "disembark";
  if (minute >= times.sea) return "sea";
  if (minute >= times.port) return "port";
  return "road";
}

const distance = (a: LngLat, b: LngLat) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Le début d'un tracé jusqu'à la fraction demandée ; le dernier point est la position atteinte. */
export function pathUntil(points: LngLat[], fraction: number): LngLat[] {
  if (points.length < 2) return [...points];
  const lengths = points.slice(1).map((point, index) => distance(points[index]!, point));
  let left = clamp01(fraction) * lengths.reduce((sum, length) => sum + length, 0);
  const path: LngLat[] = [points[0]!];
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    const from = points[index]!;
    const to = points[index + 1]!;
    if (left >= length) {
      path.push(to);
      left -= length;
      continue;
    }
    const part = length ? left / length : 0;
    path.push([from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part]);
    break;
  }
  return path;
}

export function filmFrame(film: JourneyFilm, minute: number) {
  const times = filmTimes(film);
  const stage = stageAt(film, minute);
  const roadDone = pathUntil(film.road, film.roadMin ? minute / film.roadMin : 1);
  const seaDone = pathUntil(film.sea, film.ferryMin ? (minute - times.sea) / film.ferryMin : 0);
  const lastDone = pathUntil(film.last, film.lastMin ? (minute - times.last) / film.lastMin : 1);
  const point =
    stage === "road"
      ? roadDone.at(-1)
      : stage === "port"
        ? film.road.at(-1)
        : stage === "sea"
          ? seaDone.at(-1)
          : stage === "disembark"
            ? film.sea.at(-1)
            : lastDone.at(-1);
  return {
    stage,
    point: point ?? film.road[0]!,
    roadDone,
    seaDone: minute > times.sea ? seaDone : [],
    lastDone: minute > times.last ? lastDone : [],
  };
}

const smooth = (value: number) => value * value * (3 - 2 * value);

/** Proche sur la route et au port, large en mer ; les changements se font en douceur. */
export function filmZoom(film: JourneyFilm, minute: number) {
  const times = filmTimes(film);
  const opening = Math.min(180, film.ferryMin / 4);
  const steps: [number, number][] = [
    [0, 7.4],
    [Math.max(0, times.port - 45), 7.4],
    [times.port, 9.2],
    [times.sea, 9.2],
    [times.sea + opening, 5.4],
    [times.disembark - opening, 5.4],
    [times.disembark, 9.2],
    [times.last, 9.2],
    [times.total, 8],
  ];
  for (let index = 1; index < steps.length; index += 1) {
    const [toTime, toZoom] = steps[index]!;
    if (minute > toTime) continue;
    const [fromTime, fromZoom] = steps[index - 1]!;
    const part = toTime > fromTime ? clamp01((minute - fromTime) / (toTime - fromTime)) : 1;
    return fromZoom + (toZoom - fromZoom) * smooth(part);
  }
  return steps.at(-1)![1];
}

/** En lecture, chaque étape a sa part de temps : 24 h de mer ne doivent pas écraser la route. */
const PLAY_WEIGHTS = { road: 0.26, port: 0.08, sea: 0.38, disembark: 0.08, last: 0.2 };

export function minuteAtProgress(film: JourneyFilm, progress: number) {
  const times = filmTimes(film);
  const parts: [number, number, number][] = [
    [PLAY_WEIGHTS.road, 0, film.roadMin],
    [PLAY_WEIGHTS.port, times.port, film.boardMin],
    [PLAY_WEIGHTS.sea, times.sea, film.ferryMin],
    [PLAY_WEIGHTS.disembark, times.disembark, film.disembarkMin],
    [PLAY_WEIGHTS.last, times.last, film.lastMin],
  ];
  let left = clamp01(progress);
  for (const [weight, start, length] of parts) {
    if (left <= weight) return start + (length * left) / weight;
    left -= weight;
  }
  return times.total;
}

export function progressAtMinute(film: JourneyFilm, minute: number) {
  const times = filmTimes(film);
  const parts: [number, number, number][] = [
    [PLAY_WEIGHTS.road, 0, film.roadMin],
    [PLAY_WEIGHTS.port, times.port, film.boardMin],
    [PLAY_WEIGHTS.sea, times.sea, film.ferryMin],
    [PLAY_WEIGHTS.disembark, times.disembark, film.disembarkMin],
    [PLAY_WEIGHTS.last, times.last, film.lastMin],
  ];
  let done = 0;
  for (const [weight, start, length] of parts) {
    if (minute <= start + length) return done + (length ? weight * clamp01((minute - start) / length) : 0);
    done += weight;
  }
  return 1;
}

/** Ce que montre l'écran vide : un exemple, annoncé comme tel. */
export const DEMO_FILM: JourneyFilm = {
  key: "demo",
  road: [
    [4.84, 45.76],
    [4.87, 45.1],
    [4.82, 44.3],
    [5.0, 43.75],
    [5.37, 43.3],
  ],
  sea: [
    [5.37, 43.3],
    [4.9, 41.6],
    [2.8, 38.9],
    [0.6, 36.9],
    [-0.64, 35.7],
  ],
  last: [
    [-0.64, 35.7],
    [-0.95, 35.4],
    [-1.2, 35.15],
    [-1.32, 34.88],
  ],
  roadMin: 210,
  boardMin: 240,
  ferryMin: 1440,
  disembarkMin: 240,
  lastMin: 110,
  roadKm: 312,
  lastKm: 140,
  shipImage: "/vessel-visuals/map/tassili-ii.webp",
  pins: [
    { label: "Lyon", point: [4.84, 45.76] },
    { label: "Marseille", point: [5.37, 43.3] },
    { label: "Oran", point: [-0.64, 35.7] },
    { label: "Tlemcen", point: [-1.32, 34.88] },
  ],
};
export const DEMO_CAPTIONS: Record<FilmStage, string> = {
  road: "De chez vous au port",
  port: "Attente et formalités au port",
  sea: "La traversée",
  disembark: "Débarquement et sortie du port",
  last: "La dernière route jusqu'au bled",
  done: "Vous êtes arrivé",
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  return `${hours} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
};

/** Repère de sécurité routière : une pause toutes les deux heures de conduite. */
export const PAUSE_EVERY_MIN = 120;
export const PAUSE_MIN = 15;
/** Pas de pause conseillée à moins d'une demi-heure de l'arrivée. */
export function drivingPauses(driveMin: number) {
  return Math.max(0, Math.floor((driveMin - 30) / PAUSE_EVERY_MIN));
}

export interface FilmChip {
  id: string;
  kind: "road" | "port" | "sea" | "pause";
  label: string;
  point: LngLat;
  /** Minute à partir de laquelle cette portion est commencée. */
  at: number;
}

/** Les étiquettes posées sur le trajet : la durée de chaque portion et les pauses conseillées. */
export function filmChips(film: JourneyFilm): FilmChip[] {
  const times = filmTimes(film);
  const middle = (points: LngLat[]) => pathUntil(points, 0.5).at(-1) ?? points[0]!;
  // Avant la première pause s'il y en a une : les deux étiquettes ne tombent pas au même endroit.
  const roadLabelPoint = (points: LngLat[], driveMin: number) =>
    drivingPauses(driveMin)
      ? (pathUntil(points, PAUSE_EVERY_MIN / driveMin / 2).at(-1) ?? points[0]!)
      : middle(points);
  const km = (value?: number) => (value ? ` · ${Math.round(value)} km` : "");
  const pauses = (points: LngLat[], driveMin: number, start: number, prefix: string): FilmChip[] =>
    Array.from({ length: drivingPauses(driveMin) }, (_, index) => {
      const fraction = ((index + 1) * PAUSE_EVERY_MIN) / driveMin;
      return {
        id: `${prefix}-pause-${index}`,
        kind: "pause" as const,
        label: `Pause ${PAUSE_MIN} min`,
        point: pathUntil(points, fraction).at(-1) ?? points[0]!,
        at: start + driveMin * fraction,
      };
    });
  return [
    {
      id: "road",
      kind: "road",
      label: `${formatMinutes(film.roadMin)}${km(film.roadKm)}`,
      point: roadLabelPoint(film.road, film.roadMin),
      at: 0,
    },
    ...pauses(film.road, film.roadMin, 0, "road"),
    {
      id: "port",
      kind: "port",
      label: `${formatMinutes(film.boardMin)} au port`,
      point: film.road.at(-1) ?? film.sea[0]!,
      at: times.port,
    },
    { id: "sea", kind: "sea", label: `${formatMinutes(film.ferryMin)} de mer`, point: middle(film.sea), at: times.sea },
    {
      id: "disembark",
      kind: "port",
      label: `${formatMinutes(film.disembarkMin)} de sortie`,
      point: film.sea.at(-1) ?? film.last[0]!,
      at: times.disembark,
    },
    {
      id: "last",
      kind: "road",
      label: `${formatMinutes(film.lastMin)}${km(film.lastKm)}`,
      point: roadLabelPoint(film.last, film.lastMin),
      at: times.last,
    },
    ...pauses(film.last, film.lastMin, times.last, "last"),
  ];
}

/** La course : tous les trajets partent ensemble, seul compte le temps de porte à porte. */
export interface RaceEntry {
  id: string;
  label: string;
  totalMin: number;
  estimated: boolean;
}
export function raceRanking<T extends RaceEntry>(entries: T[]) {
  const ordered = [...entries].sort((a, b) => a.totalMin - b.totalMin);
  const best = ordered[0]?.totalMin ?? 0;
  return ordered.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    gapMin: entry.totalMin - best,
  }));
}

/** Le dialogue entre le volet et la carte. */
export const JOURNEY_FILM_EVENT = "bledway:journey-film";
export const JOURNEY_PICK_EVENT = "bledway:journey-pick";
export const JOURNEY_PICKED_EVENT = "bledway:journey-picked";

export interface JourneyFilmFrame {
  film: JourneyFilm;
  minute: number;
  /** 1 : tout le trajet à l'écran ; 0 : la caméra suit le voyageur. */
  wide: number;
  /** Exemple : le reste de la carte s'efface pour ne pas passer pour de vraies données. */
  demo: boolean;
  caption: string;
  /** Exemple en boucle : plus large, pour que le fond de carte suive sans se vider. */
  maxZoom?: number;
  /** Course : ces trajets avancent ensemble à la place du voyage choisi. */
  racers?: { film: JourneyFilm; label: string; winner: boolean }[];
}

export function publishFilmFrame(frame: JourneyFilmFrame | null) {
  window.dispatchEvent(new CustomEvent(JOURNEY_FILM_EVENT, { detail: frame }));
}

export type PickTarget = "origin" | "destination";
export function requestPick(target: PickTarget | null) {
  window.dispatchEvent(new CustomEvent(JOURNEY_PICK_EVENT, { detail: target }));
}
