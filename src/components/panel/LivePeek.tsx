import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { formatDateParts } from "@/lib/ferry/format";
import { dateKeyInZone, portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { VesselThumb } from "./LineOverview";
import type { TrafficCrossing } from "./TrafficCard";
import { tr, placeName } from "@/lib/i18n";

/**
 * Téléphone, tiroir replié : la traversée en cours (ou, sans navire en mer, la prochaine), en miniature.
 * Navire, trajet, avancement, heure d'arrivée estimée : on voit d'emblée ce que le suivi permet.
 * Masqué dès que le tiroir s'ouvre (la liste complète prend le relais) et sur ordinateur.
 */
export function LivePeek({
  crossing: c,
  kind,
  count,
  onSelect,
}: {
  crossing: TrafficCrossing;
  kind: "sea" | "next";
  /** Navires en mer en ce moment (pour « + 2 autres »). */
  count: number;
  onSelect: (selection: Selection) => void;
}) {
  const progress = crossingProgress(c.departure, c.from, c.to, c.live);
  const percent = progress.ratio === null ? null : Math.round(progress.ratio * 100);
  const estimated = progress.trust !== "live" && progress.trust !== "observed";
  const fromZone = portTimeZone(c.from);
  const toZone = portTimeZone(c.to);
  const when = (iso: string, zone: string) => {
    const parts = formatDateParts(iso, zone);
    const today = dateKeyInZone(new Date().toISOString(), zone) === dateKeyInZone(iso, zone);
    return today ? parts.time : `${parts.shortDate} ${parts.time}`;
  };
  const arrival = progress.times.arrival.iso;
  const departure = progress.times.departure.iso ?? c.departure.departure_at;
  const others = count - 1;
  return (
    <button
      type="button"
      className="bw-live-peek"
      data-kind={kind}
      onClick={() =>
        onSelect(
          c.vessel
            ? { type: "vessel", id: c.vessel.id }
            : { type: "departure", id: c.departure.id },
        )
      }
      aria-label={tr("ui.livePeek.suivreVers", { v: c.vessel?.name ?? "la traversée", name: c.from.name, name2: c.to.name })}
    >
      <span className="bw-live-peek__kicker">
        <i aria-hidden />
        {kind === "sea"
          ? tr("ui.livePeek.enMerMaintenant", { v: others > 0 ? ` · + ${others} ${others > 1 ? "autres" : "autre"}` : "" })
          : tr("ui.livePeek.prochainDepart")}
        <em>{tr("ui.livePeek.suivre")}</em>
      </span>
      <span className="bw-live-peek__ship" aria-hidden>
        <VesselThumb vessel={c.vessel} width={52} towardRight />
      </span>
      <span className="bw-live-peek__main">
        <strong>{c.vessel?.name ?? c.company?.name ?? tr("ui.livePeek.traversee")}</strong>
        <small>
          {placeName(c.from.name)} → {placeName(c.to.name)}
        </small>
      </span>
      <span className="bw-live-peek__eta">
        {kind === "sea" ? (
          arrival ? (
            <>
              <small>{estimated ? tr("ui.livePeek.arriveeEstimee") : tr("ui.livePeek.arrivee")}</small>
              <b>{when(arrival, toZone)}</b>
            </>
          ) : null
        ) : (
          <>
            <small>{tr("ui.livePeek.depart")}</small>
            <b>{when(departure, fromZone)}</b>
          </>
        )}
      </span>
      {kind === "sea" && percent !== null ? (
        <span
          className="bw-live-peek__bar"
          role="progressbar"
          aria-label={tr("ui.livePeek.avancementDeLaTraversee")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </button>
  );
}
