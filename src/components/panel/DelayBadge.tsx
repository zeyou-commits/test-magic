import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateParts } from "@/lib/ferry/format";
import type { TrackingTime } from "@/lib/ferry/tracking";
import { tr } from "@/lib/i18n";

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/** D'où vient l'heure annoncée, en une phrase. */
function sourceOf(time: TrackingTime, zone: string) {
  if (time.fromSignal)
    return time.signalAt
      ? tr("ui.delayBadge.calculeeSurLaPositionDu", { time: formatDateParts(time.signalAt, zone).time })
      : tr("ui.delayBadge.calculeeSurLaPositionDu2");
  if (time.reported) return tr("ui.delayBadge.dApresUnSignalementDe");
  if (time.updated) return tr("ui.delayBadge.horaireMisAJourPar");
  if (time.kind === "observed") return tr("ui.delayBadge.heureConstatee");
  return tr("ui.delayBadge.estimationBledwayDApresL");
}

/**
 * Le badge « Retardé » : un toucher ouvre le détail sur place, l'heure prévue et l'heure annoncée,
 * au départ et à l'arrivée, et d'où vient l'estimation.
 */
export function DelayBadge({
  label,
  times,
  fromZone,
  toZone,
  compact = false,
}: {
  label: string;
  times: { departure: TrackingTime; arrival: TrackingTime };
  fromZone: string;
  toZone: string;
  compact?: boolean;
}) {
  const rows = [
    { name: "Départ", time: times.departure, zone: fromZone },
    { name: "Arrivée", time: times.arrival, zone: toZone },
  ].filter((row) => row.time.scheduledIso || row.time.iso);
  const main =
    times.arrival.fromSignal ||
    (times.arrival.shiftMinutes ?? 0) >= (times.departure.shiftMinutes ?? 0)
      ? times.arrival
      : times.departure;
  const hour = (iso: string | null, zone: string) => (iso ? formatDateParts(iso, zone).time : "—");
  // Départ et arrivée souvent sur deux jours : le jour évite de lire deux fois « 12:00 ».
  const day = (iso: string | null, zone: string) =>
    iso ? formatDateParts(iso, zone).shortDate : "";
  return (
    <Popover>
      <PopoverTrigger asChild onClick={stop} onPointerDown={stop} onKeyDown={stop}>
        <button
          type="button"
          className={`bw-delay-badge${compact ? " bw-delay-badge--compact" : ""}`}
          aria-label={tr("ui.delayBadge.retardeVoirLeDetail", { label })}
        >
          {tr("ui.delayBadge.retarde")}{label}
          <ChevronRight className="bw-sea-chip__more" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bw-sea-pop bw-delay-pop"
        align="start"
        onClick={stop}
        onPointerDown={stop}
      >
        <p className="bw-sea-pop__title">{tr("ui.delayBadge.retard")}{label.replace(/^≈ /, "estimé à ")}</p>
        <dl className="bw-delay-pop__rows">
          {rows.map((row) => (
            <div key={row.name}>
              <dt>
                {row.name}
                <small>{day(row.time.iso ?? row.time.scheduledIso, row.zone)}</small>
              </dt>
              <dd>
                {row.time.scheduledIso && row.time.iso !== row.time.scheduledIso ? (
                  <s>{hour(row.time.scheduledIso, row.zone)}</s>
                ) : null}
                <b>
                  {row.time.notBefore ? tr("ui.delayBadge.pasAvant") : ""}
                  {hour(row.time.iso ?? row.time.scheduledIso, row.zone)}
                </b>
                <small>{tr("ui.delayBadge.heureLocale")}</small>
              </dd>
            </div>
          ))}
        </dl>
        {times.departure.notBefore ? (
          <p className="bw-sea-pop__lead">
            {tr("ui.delayBadge.leNavireEstEncoreA")}
          </p>
        ) : null}
        <p className="bw-sea-pop__lead">
          {sourceOf(main, main === times.arrival ? toZone : fromZone)}
        </p>
        <p className="bw-sea-pop__source">
          {tr("ui.delayBadge.unReperePourSOrganiser")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
