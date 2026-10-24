import { zonedTimeToUtc } from "@/lib/ferry/time";

/** Une durée reste une durée, même lorsque la traversée dépasse minuit ou change de fuseau. */
export function commercialArrival(
  date: string,
  time: string,
  durationMinutes: number,
  fromZone: string,
): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > 10080
  )
    return null;
  try {
    const start = zonedTimeToUtc(date, time, fromZone);
    return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
  } catch {
    return null;
  }
}
