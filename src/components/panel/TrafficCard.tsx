import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { MiniFerry } from "./MiniFerry";
import { crossingProgress, ferryLeft, replacedTime } from "@/lib/ferry/crossingProgress";
import { SeaChip } from "./SeaForecast";
import { delayLabel, type LiveShip, type trackingTimes } from "@/lib/ferry/tracking";
import { formatDateParts } from "@/lib/ferry/format";
import { portTimeZone, dateKeyInZone } from "@/lib/ferry/time";
import type { Company, Departure, Port, Selection, Vessel } from "@/lib/ferry/types";
import type { MapPreview } from "@/lib/ferry/mapPresentation";
import { CompanyBadge } from "./CompanyBadge";
import { FollowButton } from "./FollowButton";
import { tr } from "@/lib/i18n";

export type TrafficCrossing = {
  departure: Departure;
  from: Port;
  to: Port;
  live: LiveShip | null | undefined;
  times: ReturnType<typeof trackingTimes>;
  company: Company | undefined;
  vessel: Vessel | undefined;
};

/**
 * La carte « En navigation » : compagnie, navire, trajet, état de la mer, retard, et le petit bateau
 * qui avance sur sa barre. Toute la carte ouvre la fiche du navire. Partagée par l'accueil et
 * « Ma traversée ».
 */
export function TrafficCard({
  crossing: c,
  onSelect,
  onPreview,
  compact = false,
}: {
  crossing: TrafficCrossing;
  onSelect: (selection: Selection) => void;
  onPreview?: (preview: MapPreview | null) => void;
  /** Téléphone, « Ma traversée » : la même carte, resserrée. */
  compact?: boolean;
}) {
  const ferrySize = compact ? 46 : 58;
  const previewEvents = (preview: MapPreview) => ({
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview?.(preview);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview?.(null);
    },
    onFocusCapture: () => onPreview?.(preview),
    onBlurCapture: (event: React.FocusEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onPreview?.(null);
    },
  });
  const progress = crossingProgress(c.departure, c.from, c.to, c.live);
  // Avant le départ, le bateau attend au début de la barre : « À quai » plutôt qu'un tiret.
  const waiting = progress.ratio === null && Date.now() < Date.parse(c.departure.departure_at);
  const percent = progress.ratio === null ? null : Math.round(progress.ratio * 100);
  const estimated = progress.trust !== "live" && progress.trust !== "observed";
  const preview = {
    routeId: c.departure.route_id,
    ...(c.vessel ? { vesselId: c.vessel.id } : {}),
  };
  const target: Selection = c.vessel
    ? { type: "vessel", id: c.vessel.id }
    : { type: "departure", id: c.departure.id };
  const time = (iso: string | null, port: typeof c.from) =>
    iso ? formatDateParts(iso, portTimeZone(port)).time : "À confirmer";
  const startDay = c.times.departure.iso
    ? dateKeyInZone(c.times.departure.iso, portTimeZone(c.from))
    : "";
  const endDay = c.times.arrival.iso
    ? dateKeyInZone(c.times.arrival.iso, portTimeZone(c.to))
    : "";
  const dayDelta =
    startDay && endDay
      ? Math.round((Date.parse(endDay) - Date.parse(startDay)) / 86_400_000)
      : 0;
  return (
    <article
      className="bw-compact-crossing !py-2"
      data-compact={compact || undefined}
      {...previewEvents(preview)}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => onSelect(target)}
        aria-label={`Ouvrir la fiche ${c.vessel?.name ?? "de la traversée"}, ${c.from.name} vers ${c.to.name}`}
      />
      <div className="pointer-events-none relative z-[1]">
        <div className="bw-tc-company mb-1 flex min-w-0 items-center gap-2">
          <CompanyBadge
            name={c.company?.name ?? "Compagnie à confirmer"}
            logoUrl={c.company?.logo_url ?? null}
            size={25}
          />
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-xs">
              {c.company?.name ?? tr("ui.trafficCard.compagnieAConfirmer")}
            </strong>
            <span className="block truncate text-[10px] text-muted-foreground">
              {c.vessel?.name ?? tr("ui.trafficCard.bateauAConfirmer")}
            </span>
          </div>
          {c.vessel && (
            <span className="pointer-events-auto flex items-center gap-1.5">
              <VesselAlertTag vesselId={c.vessel.id} />
              {/* Le cœur d'une ligne de trafic suit CETTE traversée : pas de date à rechoisir. */}
              <FollowButton
                kind="departure"
                targetId={c.departure.id}
                label={`${c.from.name} → ${c.to.name}`}
                iconOnly
                demo={Boolean(c.departure.is_demo)}
              />
            </span>
          )}
        </div>
        <div className="bw-tc-ports flex justify-between gap-3 text-sm font-bold">
          {[c.from, c.to].map((port) => (
            <button
              key={port.id}
              type="button"
              onClick={() => onSelect({ type: "port", id: port.id })}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") onPreview?.({ portId: port.id });
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") onPreview?.(preview);
              }}
              onFocus={() => onPreview?.({ portId: port.id })}
              className="pointer-events-auto truncate rounded-md leading-tight underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {port.name}
            </button>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <SeaChip
            departureId={c.departure.id}
            from={c.from}
            to={c.to}
            departureAt={c.departure.departure_at}
            arrivalAt={progress.times.arrival.iso}
          />
          {delayLabel(progress.times) ? (
            <b className="bw-delay-badge bw-delay-badge--compact">
              {tr("ui.trafficCard.retarde")}{delayLabel(progress.times)}
            </b>
          ) : null}
        </div>
        <div
          className="bw-compact-track"
          data-estimated={estimated || undefined}
          role="progressbar"
          aria-label={tr("ui.trafficCard.avancementDeLaTraversee")}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(percent === null ? {} : { "aria-valuenow": percent })}
        >
          <span style={{ width: `${percent ?? 0}%` }} />
          <i style={{ left: ferryLeft(percent ?? 0, ferrySize, progress.scene, 8) }}>
            <MiniFerry size={ferrySize} scene={progress.scene} />
            <b>
              {percent === null
                ? waiting
                  ? tr("ui.trafficCard.aQuai")
                  : "—"
                : `${estimated ? "≈ " : ""}${percent} %`}
            </b>
          </i>
        </div>
        <div className="flex justify-between text-[11px] tabular-nums">
          <span>
            {tr("ui.trafficCard.depart")}<b>{time(c.times.departure.iso, c.from)}</b>
            {replacedTime(c.times.departure) ? (
              <s className="bw-old-time">{time(replacedTime(c.times.departure), c.from)}</s>
            ) : null}
          </span>
          <span className="text-right">
            {tr("ui.trafficCard.arrivee")}<b>{time(c.times.arrival.iso, c.to)}</b>
            {dayDelta > 0 && <sup className="ml-0.5 text-primary">+{dayDelta} j</sup>}
            {replacedTime(c.times.arrival) ? (
              <s className="bw-old-time">{time(replacedTime(c.times.arrival), c.to)}</s>
            ) : null}
          </span>
        </div>
        {/* Sans position captée, le « ≈ » et les horaires barrés disent déjà tout. */}
        {progress.trust === "live" || progress.trust === "aged" || progress.trust === "observed" ? (
          <p className="bw-trust">{progress.trustLabel}</p>
        ) : null}
      </div>
    </article>
  );
}
