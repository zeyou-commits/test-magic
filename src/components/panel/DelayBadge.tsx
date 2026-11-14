import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateParts } from "@/lib/ferry/format";
import type { TrackingTime } from "@/lib/ferry/tracking";

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/** D'où vient l'heure annoncée, en une phrase. */
function sourceOf(time: TrackingTime, zone: string) {
  if (time.fromSignal)
    return time.signalAt
      ? `Calculée sur la position du navire (signal de ${formatDateParts(time.signalAt, zone).time}).`
      : "Calculée sur la position du navire.";
  if (time.reported) return "D'après un signalement de voyageur vérifié par l'équipe.";
  if (time.updated) return "Horaire mis à jour par l'équipe BledWay.";
  if (time.kind === "observed") return "Heure constatée.";
  return "Estimation BledWay d'après l'horaire et les traversées précédentes.";
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
          aria-label={`Retardé ${label} : voir le détail`}
        >
          Retardé · {label}
          <ChevronRight className="bw-sea-chip__more" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bw-sea-pop bw-delay-pop"
        align="start"
        onClick={stop}
        onPointerDown={stop}
      >
        <p className="bw-sea-pop__title">Retard {label.replace(/^≈ /, "estimé à ")}</p>
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
                  {row.time.notBefore ? "pas avant " : ""}
                  {hour(row.time.iso ?? row.time.scheduledIso, row.zone)}
                </b>
                <small>heure locale</small>
              </dd>
            </div>
          ))}
        </dl>
        {times.departure.notBefore ? (
          <p className="bw-sea-pop__lead">
            Le navire est encore à quai : l'heure de départ est un minimum, pas une heure sûre.
          </p>
        ) : null}
        <p className="bw-sea-pop__lead">
          {sourceOf(main, main === times.arrival ? toZone : fromZone)}
        </p>
        <p className="bw-sea-pop__source">
          Un repère pour s'organiser : seule la compagnie confirme les horaires.
        </p>
      </PopoverContent>
    </Popover>
  );
}
