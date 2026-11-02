// Inviter au salon quand le voyage change d'état, sans jamais harceler : une seule fois par état.
const HOUR = 3_600_000;
const STOPPED_KNOTS = 1.5;
const MOVING_KNOTS = 5;
const NEAR_PORT_KM = 6;
/** Passé ce délai après l'arrêt à quai, plus personne n'attend dans le port. */
const DOCKED_WINDOW = 8 * HOUR;
/** Sans signal de départ, l'invitation de l'embarquement ne traîne pas au-delà. */
const BOARDING_AFTER = 6 * HOUR;
/** Un salon animé : 2 rappels au plus par traversée. */
const ACTIVE_WAVES = [5, 15];

export type VoyageStage = "boarding" | "sea" | "docked";
export type Observation = {
  reported_at: string;
  latitude: number;
  longitude: number;
  speed_knots: number | null;
};
type Place = { latitude: number; longitude: number };

function km(a: Place, b: Place) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const stopped = (item: Observation) =>
  item.speed_knots !== null && item.speed_knots < STOPPED_KNOTS;

/** Vu à l'arrêt au port de départ, puis en route : c'est bien lui qui est parti, pas son voyage précédent. */
export function departedFromTrack(track: Observation[], port: Place, departureAt: string) {
  const start = Date.parse(departureAt);
  const atQuay = track.findIndex(
    (item) =>
      stopped(item) &&
      Date.parse(item.reported_at) >= start - 6 * HOUR &&
      km(item, port) < NEAR_PORT_KM,
  );
  if (atQuay < 0) return null;
  return (
    track
      .slice(atQuay + 1)
      .find((item) => (item.speed_knots ?? 0) >= MOVING_KNOTS && km(item, port) >= 1)
      ?.reported_at ?? null
  );
}

/** Premier arrêt près du port d'arrivée, après le départ prévu. */
export function dockedFromTrack(track: Observation[], port: Place, departureAt: string) {
  const start = Date.parse(departureAt);
  return (
    track.find(
      (item) =>
        stopped(item) && Date.parse(item.reported_at) > start && km(item, port) < NEAR_PORT_KM,
    )?.reported_at ?? null
  );
}

export function voyageStage(input: {
  departureAt: string;
  leadMinutes: number;
  departedAt: string | null;
  arrivedAt: string | null;
  postponed: boolean;
  now: number;
}): VoyageStage | null {
  const { departureAt, leadMinutes, departedAt, arrivedAt, postponed, now } = input;
  if (postponed) return null;
  if (arrivedAt) return now < Date.parse(arrivedAt) + DOCKED_WINDOW ? "docked" : null;
  if (departedAt) return "sea";
  const start = Date.parse(departureAt);
  return now >= start - leadMinutes * 60_000 && now < start + BOARDING_AFTER ? "boarding" : null;
}

/** Ce que reçoit chacun : les passagers tout, ceux qui suivent seulement l'arrivée. */
export const stageFor = (stage: VoyageStage | null, passenger: boolean) =>
  stage && (passenger || stage === "docked") ? stage : null;

export function stageNotice(stage: VoyageStage, line: string, passenger: boolean) {
  if (stage === "boarding")
    return {
      title: `${line} · l’embarquement approche`,
      body: "La file avance ? Le salon de votre traversée est ouvert : dites-le aux autres en un mot.",
    };
  if (stage === "sea")
    return {
      title: `${line} · vous voilà en mer`,
      body: "Restaurant, prises, état de la mer : échangez avec les autres passagers dans le salon.",
    };
  return {
    title: `${line} · le bateau est à quai`,
    body: passenger
      ? "Débarquement, douane : partagez où vous en êtes dans le salon, ça aide ceux qui attendent."
      : "Débarquement, douane : suivez ce que racontent les passagers dans le salon.",
  };
}

/** Le palier atteint par les messages des autres : 1, 2, ou 0 tant que le salon est calme. */
export const activeWave = (othersMessages: number) =>
  ACTIVE_WAVES.filter((threshold) => othersMessages >= threshold).length;

/** Rappels de salon animé : pas la nuit à Paris, sauf quand le voyage est en cours. */
export function quietHours(now: number) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  return hour >= 23 || hour < 7;
}

/** La phrase ajoutée aux rappels déjà envoyés avant le départ. */
export function reminderRoomLine(stage: "7j" | "48h" | "24h") {
  return stage === "24h"
    ? " Une question sur l’embarquement ? Demandez aux autres voyageurs dans le salon."
    : " Le salon de votre traversée est ouvert : qui voyage avec un fourgon ? Présentez-vous !";
}
