import { useQuery } from "@tanstack/react-query";
import { SEA_FORECAST_DAYS, seaForecastQuery, seaLevel } from "@/lib/ferry/seaState";

type Point = { latitude: number; longitude: number };
const ORIGIN: Point = { latitude: 0, longitude: 0 };

/** La plus forte hauteur de vagues prévue sur la traversée ; null hors de portée des prévisions. */
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
    ...seaForecastQuery(departureId ?? "", from ?? ORIGIN, to ?? ORIGIN, start, end),
    enabled: useful,
  });
  return useful ? (data ?? null) : null;
}

export const isLivelySea = (peak: number) => peak >= 1.25;

/** Le picto de la mer : la houle se creuse à mesure que la mer se forme. */
export function SeaIcon({ peak, size = 24 }: { peak: number; size?: number }) {
  const { rank, id } = seaLevel(peak);
  const swell = 1 + rank * 1.1;
  const wave = (y: number) =>
    `M1 ${y} q5.5 ${-swell} 11 0 t11 0 t11 0 t11 0`;
  return (
    <svg className="bw-sea-icon" data-level={id} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g strokeWidth="2.3" strokeLinecap="round" stroke="currentColor">
        <path className="bw-sea-icon__w1" d={wave(7)} opacity={rank >= 3 ? 1 : 0.35} />
        <path className="bw-sea-icon__w2" d={wave(13)} opacity={rank >= 2 ? 1 : 0.5} />
        <path className="bw-sea-icon__w3" d={wave(19)} />
      </g>
    </svg>
  );
}

/** Pastille posée sur la photo du navire. */
export function SeaPhotoBadge({ peak }: { peak: number }) {
  const level = seaLevel(peak);
  return (
    <span className="bw-sea-badge" data-level={level.id} title={`${level.label} prévue sur le trajet`}>
      <SeaIcon peak={peak} size={16} />
      {level.label}
    </span>
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
    <span className="bw-sea-pill" data-level={level.id}>
      <SeaIcon peak={peak} size={24} />
      {level.label}
    </span>
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
    <section className="bw-sea" data-level={level.id} aria-label="Prévisions de mer">
      <SeaIcon peak={peak} size={26} />
      <div>
        <strong>
          {level.label} <span>· vagues jusqu’à {peak.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m</span>
        </strong>
        {lively ? <p>Si vous êtes sensible au mal de mer, prévoyez de quoi vous soulager.</p> : null}
        <small>
          Prévisions indicatives sur le trajet,{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          . Seule la compagnie confirme le départ.
        </small>
      </div>
    </section>
  );
}
