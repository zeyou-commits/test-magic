import { useAuth } from "@/hooks/useAuth";
import type { Departure } from "@/lib/ferry/types";
import { trackingTimes, type LiveShip, type TrackingTime } from "@/lib/ferry/tracking";
import { formatDateParts, formatDateTime, formatDuration } from "@/lib/ferry/format";
import { zoneLabel } from "@/lib/ferry/time";
import { VesselElsewhereNotice } from "./VesselElsewhereNotice";
import { tr } from "@/lib/i18n";

function Time({ time, label, zone }: { time: TrackingTime; label: string; zone: string }) {
  const { isAdmin } = useAuth();
  if (!time.iso) return null;
  const shift = time.shiftMinutes;
  const changed = shift !== null && Math.abs(shift) >= 5;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground">
        {label}{" "}
        {time.updated
          ? label === "Arrivée"
            ? time.kind === "observed"
              ? tr("ui.trackingTimes.constatee")
              : tr("ui.trackingTimes.estimee")
            : tr("ui.trackingTimes.constate")
          : time.kind === "observed" && time.reported
          ? label === "Arrivée"
            ? tr("ui.trackingTimes.signalee")
            : tr("ui.trackingTimes.signale")
          : time.kind === "observed"
          ? label === "Arrivée"
            ? `constatée${isAdmin ? " (AIS)" : ""}`
            : `constaté${isAdmin ? " (AIS)" : ""}`
          : time.notBefore
            ? tr("ui.trackingTimes.pasAvant")
            : time.kind === "estimated"
              ? label === "Arrivée"
                ? `estimée${isAdmin && !time.reported ? " (AIS)" : ""}`
                : `estimé${isAdmin && !time.reported ? " (AIS)" : ""}`
              : label === "Arrivée"
                ? tr("ui.trackingTimes.prevue")
                : tr("ui.trackingTimes.prevu")}
      </p>
      <p className="text-sm font-bold tabular-nums text-foreground">
        {time.seenOnly ? tr("ui.trackingTimes.aQuai") : time.iso ? formatDateTime(time.iso, zone) : tr("ui.trackingTimes.aConfirmer")}
      </p>
      {time.seenOnly && time.iso ? (
        <p className="text-[10px] text-muted-foreground">
          {tr("ui.trackingTimes.vuAQuai")}{formatDateTime(time.iso, zone)}
        </p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">{zoneLabel(zone)}</p>
      {time.fromSignal && time.signalAt ? (
        <p className="text-[10px] text-muted-foreground">
          {tr("ui.trackingTimes.dApresLeSignalDe")}{formatDateParts(time.signalAt, zone).time}
        </p>
      ) : null}
      {changed && time.scheduledIso ? (
        <p className={`mt-0.5 text-[10px] text-muted-foreground ${changed ? "line-through" : ""}`}>
          {tr("ui.trackingTimes.prevu2")}{formatDateTime(time.scheduledIso, zone)}
        </p>
      ) : null}
      {changed && shift !== null ? (
        <p className={`text-[10px] font-semibold ${shift < 0 ? "text-success" : "text-warning-foreground"}`}>
          {time.reported ? tr("ui.trackingTimes.signalementValide") : ""}
          {shift < 0
            ? tr("ui.trackingTimes.enAvanceDe")
            : time.kind === "observed" && !time.reported
              ? tr("ui.trackingTimes.ecartConstate")
              : time.notBefore
                ? tr("ui.trackingTimes.retardDAuMoins")
                : tr("ui.trackingTimes.retardEstimeDe")}
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
    <>
      <VesselElsewhereNotice departure={departure} />
      <div
        className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3"
        aria-label={tr("ui.trackingTimes.horairesDeLaTraversee")}
      >
        <Time time={times.departure} label={tr("ui.trackingTimes.depart")} zone={fromZone} />
        <Time time={times.arrival} label={tr("ui.trackingTimes.arrivee")} zone={toZone} />
      </div>
    </>
  );
}
