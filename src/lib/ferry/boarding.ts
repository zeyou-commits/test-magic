import type { Port } from "./types";
import { portTimeZone, wallTimeInZone } from "./time";

export interface BoardingMilestones {
  callTime: Date;
  boardingTime: Date;
  lastBoardingTime: Date;
  departureTime: Date;
  timeZone: string;
  callLabel: string;
  boardingLabel: string;
  lastBoardingLabel: string;
  departureLabel: string;
}

export interface BoardingOptions {
  presentationMinutes?: number | null | undefined;
  /** Piéton : une heure de moins que les véhicules (repère 3 h au lieu de 4 h). */
  onFoot?: boolean;
}

/** Consigne véhicule renseignée si connue ; sinon repère de quatre heures avant le départ. */
export function presentationLeadMinutes(value?: number | null): number {
  return Number.isInteger(value) && value! >= 30 && value! <= 720 ? value! : 240;
}

/** Délai de présentation selon le mode : les piétons se présentent une heure plus tard (30 min avant au plus tôt). */
export function leadMinutesFor(value: number | null | undefined, onFoot: boolean): number {
  const vehicle = presentationLeadMinutes(value);
  return onFoot ? Math.max(30, vehicle - 60) : vehicle;
}

/** Jalons indicatifs, affichés dans le fuseau local du port de départ. */
export function getBoardingMilestones(
  departureIso: string,
  departurePort: Pick<Port, "country_code"> | null | undefined,
  options: BoardingOptions = {},
): BoardingMilestones | null {
  const departureMs = Date.parse(departureIso);
  if (!Number.isFinite(departureMs)) return null;
  const timeZone = portTimeZone(departurePort);
  const departureTime = new Date(departureMs);
  const callTime = new Date(
    departureMs - leadMinutesFor(options.presentationMinutes, options.onFoot === true) * 60_000,
  );
  const boardingTime = new Date(departureMs - 3 * 3_600_000);
  const lastBoardingTime = new Date(departureMs - 1 * 3_600_000);
  return {
    callTime, boardingTime, lastBoardingTime, departureTime, timeZone,
    callLabel: wallTimeInZone(callTime, timeZone),
    boardingLabel: wallTimeInZone(boardingTime, timeZone),
    lastBoardingLabel: wallTimeInZone(lastBoardingTime, timeZone),
    departureLabel: wallTimeInZone(departureTime, timeZone),
  };
}

/** Temps avant un jalon, en minutes (négatif une fois l'heure dépassée). */
export function minutesUntil(instant: string | Date, now = Date.now()): number {
  const ms = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  return Number.isFinite(ms) ? Math.round((ms - now) / 60_000) : 0;
}
