import { useQuery } from "@tanstack/react-query";
import { Waves } from "lucide-react";
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
      <Waves size={20} aria-hidden />
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
