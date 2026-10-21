import type { Departure } from "@/lib/ferry/types";
import { trackingTimes, type LiveShip, type TrackingTime } from "@/lib/ferry/tracking";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import { zoneLabel } from "@/lib/ferry/time";

function Time({ time, label, zone }: { time: TrackingTime; label: string; zone: string }) {
  if (!time.iso) return null;
  const shift = time.shiftMinutes;
  const changed = shift !== null && Math.abs(shift) >= 5;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground">
        {label}{" "}
        {time.kind === "observed"
          ? label === "Arrivée"
            ? "constatée (AIS)"
            : "constaté (AIS)"
          : time.kind === "estimated"
            ? label === "Arrivée"
              ? "estimée (AIS)"
              : "estimé (AIS)"
            : label === "Arrivée"
              ? "prévue"
              : "prévu"}
      </p>
      <p className="text-sm font-bold tabular-nums text-foreground">
        {time.iso ? formatDateTime(time.iso, zone) : "À confirmer"}
      </p>
      <p className="text-[10px] text-muted-foreground">{zoneLabel(zone)}</p>
      {changed && time.scheduledIso ? (
        <p className={`mt-0.5 text-[10px] text-muted-foreground ${changed ? "line-through" : ""}`}>
          Prévu {formatDateTime(time.scheduledIso, zone)}
        </p>
      ) : null}
      {changed && shift !== null ? (
        <p className={`text-[10px] font-semibold ${shift < 0 ? "text-success" : "text-warning"}`}>
          {shift < 0
            ? "En avance de "
            : time.kind === "observed"
              ? "Écart constaté : +"
              : "Retard estimé de "}
          {formatDuration(Math.abs(shift))}
        </p>
      ) : null}
    </div>
  );
}

export function TrackingTimes({
  departure,
  live,
  fromZone,
  toZone,
}: {
  departure: Departure;
  live?: LiveShip | null | undefined;
  fromZone: string;
  toZone: string;
}) {
  const times = trackingTimes(departure, live);
  return (
    <div
      className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3"
      aria-label="Horaires de la traversée"
    >
      <Time time={times.departure} label="Départ" zone={fromZone} />
      <Time time={times.arrival} label="Arrivée" zone={toZone} />
    </div>
  );
}
