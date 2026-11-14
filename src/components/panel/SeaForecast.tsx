import { useQuery } from "@tanstack/react-query";
import {
  peakWaves,
  SEA_FORECAST_DAYS,
  seaForecastQuery,
  seaHeight,
  seaLevel,
} from "@/lib/ferry/seaState";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tr } from "@/lib/i18n";

type Point = { latitude: number; longitude: number };
const ORIGIN: Point = { latitude: 0, longitude: 0 };

/** La plus forte hauteur de vagues prévue sur ce qu'il reste du trajet ; null hors de portée des prévisions. */
export function useSeaPeak(
  departureId: string | undefined,
  from: Point | null | undefined,
  to: Point | null | undefined,
  departureAt: string | undefined,
  arrivalAt: string | null | undefined,
) {
  const start = departureAt ? Date.parse(departureAt) : 0;
  const end = arrivalAt ? Date.parse(arrivalAt) : start + 24 * 3_600_000;
  const now = Date.now();
  const useful =
    Boolean(departureId && from && to && departureAt) &&
    end > now &&
    start - now < SEA_FORECAST_DAYS * 86_400_000;
  const { data } = useQuery({
    ...seaForecastQuery(from ?? ORIGIN, to ?? ORIGIN),
    enabled: useful,
    select: (responses) => peakWaves(responses, Math.max(start, now), end),
  });
  return useful ? (data ?? null) : null;
}

export const isLivelySea = (peak: number) => peak >= 1.25;

/**
 * Le picto de la mer : trois vagues qui ondulent, plus creusées et plus nombreuses quand la mer
 * se forme. Le motif se répète tous les 6 points : le glissement boucle sans à-coup.
 */
export function SeaIcon({ peak, size = 24 }: { peak: number; size?: number }) {
  const { rank, id } = seaLevel(peak);
  const swell = 0.5 + rank * 0.45;
  const wave = (y: number) => {
    let d = `M-6 ${y}`;
    for (let x = -6; x < 30; x += 6) d += ` q1.5 ${-swell} 3 0 t3 0`;
    return d;
  };
  return (
    <svg
      className="bw-sea-icon"
      data-level={id}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path className="bw-sea-icon__w1" d={wave(6.5)} opacity={rank >= 3 ? 1 : 0.35} />
        <path className="bw-sea-icon__w2" d={wave(12)} opacity={rank >= 2 ? 1 : 0.6} />
        <path className="bw-sea-icon__w3" d={wave(17.5)} />
      </g>
    </svg>
  );
}

/** L'échelle affichée dans le détail (échelle de Douglas, hauteur des vagues). */
const SEA_SCALE = [
  { id: "calm", label: "Belle", range: "moins de 0,5 m" },
  { id: "slight", label: "Peu agitée", range: "0,5 à 1,25 m" },
  { id: "moderate", label: "Agitée", range: "1,25 à 2,5 m" },
  { id: "rough", label: "Forte", range: "2,5 à 4 m" },
  { id: "high", label: "Très forte", range: "4 m et plus" },
] as const;

/**
 * Toute pastille de mer s'ouvre d'un toucher sur son détail, sur place : ce que veut dire le mot,
 * la hauteur des vagues, l'échelle et la source. Le toucher ne déclenche pas la carte en dessous.
 */
export function SeaDetails({ peak, children }: { peak: number; children: ReactNode }) {
  const level = seaLevel(peak);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <Popover>
      <PopoverTrigger asChild onClick={stop} onPointerDown={stop} onKeyDown={stop}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="bw-sea-pop"
        data-level={level.id}
        align="start"
        onClick={stop}
        onPointerDown={stop}
      >
        <p className="bw-sea-pop__title">
          <SeaIcon peak={peak} size={22} />
          {level.label} prévue sur le trajet
        </p>
        <p className="bw-sea-pop__lead">
          Vagues jusqu'à <b>{seaHeight(peak)}</b>, au plus fort de ce qu'il reste de la traversée.
        </p>
        {isLivelySea(peak) ? (
          <p className="bw-sea-pop__advice">{tr("ui.seaForecast.siVousEtesSensibleAu")}</p>
        ) : null}
        <ol className="bw-sea-pop__scale" aria-label="Échelle de la mer">
          {SEA_SCALE.map((step) => (
            <li key={step.id} data-level={step.id} aria-current={step.id === level.id || undefined}>
              <span>{step.label}</span>
              <small>{step.range}</small>
            </li>
          ))}
        </ol>
        <p className="bw-sea-pop__source">
          Prévision Open-Meteo, relue toutes les 30 min. Une information de confort : seule la
          compagnie confirme le départ.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** La mer d'une traversée, sur une ligne : présente partout, plus visible dès que la mer s'agite. */
export function SeaChip({
  departureId,
  from,
  to,
  departureAt,
  arrivalAt,
}: {
  departureId: string;
  from: Point | null | undefined;
  to: Point | null | undefined;
  departureAt: string | undefined;
  arrivalAt: string | null | undefined;
}) {
  const peak = useSeaPeak(departureId, from, to, departureAt, arrivalAt);
  if (peak == null) return null;
  const level = seaLevel(peak);
  return (
    <SeaDetails peak={peak}>
      <button
        type="button"
        className="bw-sea-chip"
        data-level={level.id}
        aria-label={`${level.label}, vagues jusqu'à ${seaHeight(peak)} : voir le détail`}
      >
        <SeaIcon peak={peak} size={16} />
        {level.short} · {seaHeight(peak)}
        <ChevronRight className="bw-sea-chip__more" aria-hidden />
      </button>
    </SeaDetails>
  );
}

/** Pastille posée sur la photo du navire. */
export function SeaPhotoBadge({ peak }: { peak: number }) {
  const level = seaLevel(peak);
  return (
    <SeaDetails peak={peak}>
      <button
        type="button"
        className="bw-sea-badge"
        data-level={level.id}
        aria-label={`${level.label} prévue sur le trajet : voir le détail`}
      >
        <SeaIcon peak={peak} size={16} />
      </button>
    </SeaDetails>
  );
}

/** Fiche bateau : la mer de sa traversée en cours ou de la prochaine, détaillée juste en dessous. */
export function VesselSeaBadge({
  departureId,
  from,
  to,
  departureAt,
  arrivalAt,
}: {
  departureId: string;
  from: Point;
  to: Point;
  departureAt: string;
  arrivalAt: string | null;
}) {
  const peak = useSeaPeak(departureId, from, to, departureAt, arrivalAt);
  if (peak == null) return null;
  const level = seaLevel(peak);
  return (
    <SeaDetails peak={peak}>
      <button
        type="button"
        className="bw-sea-pill"
        data-level={level.id}
        aria-label={`${level.label}, vagues jusqu'à ${seaHeight(peak)} : voir le détail`}
      >
        <SeaIcon peak={peak} size={24} />
        {level.label} · {seaHeight(peak)}
        <ChevronRight className="bw-sea-chip__more" aria-hidden />
      </button>
    </SeaDetails>
  );
}

/** La mer prévue sur le trajet : une information de confort, sans prédire le comportement du navire. */
export function SeaForecast({
  departureId,
  from,
  to,
  departureAt,
  arrivalAt,
}: {
  departureId: string;
  from: Point;
  to: Point;
  departureAt: string;
  arrivalAt: string | null;
}) {
  const peak = useSeaPeak(departureId, from, to, departureAt, arrivalAt);
  if (peak == null) return null;
  const level = seaLevel(peak);
  const lively = isLivelySea(peak);
  return (
    <section
      className="bw-sea"
      data-level={level.id}
      aria-label={tr("ui.seaForecast.previsionsDeMer")}
    >
      <SeaIcon peak={peak} size={26} />
      <div>
        <strong>
          {level.label}{" "}
          <span>
            {tr("ui.seaForecast.vaguesJusquA")}
            {peak.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m
          </span>
        </strong>
        {lively ? <p>{tr("ui.seaForecast.siVousEtesSensibleAu")}</p> : null}
        <small>
          {tr("ui.seaForecast.previsionsIndicativesSurLeTrajet")}{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            {tr("ui.seaForecast.openMeteo")}
          </a>
          {tr("ui.seaForecast.seuleLaCompagnieConfirmeLe")}
        </small>
      </div>
    </section>
  );
}
