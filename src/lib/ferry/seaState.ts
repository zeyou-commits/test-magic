import { queryOptions } from "@tanstack/react-query";

/** Échelle de Douglas, d'après la hauteur des vagues en mètres. */
export function seaLevel(height: number) {
  if (height < 0.5) return { id: "calm", label: "Mer belle", short: "Belle", rank: 1 } as const;
  if (height < 1.25) return { id: "slight", label: "Mer peu agitée", short: "Peu agitée", rank: 2 } as const;
  if (height < 2.5) return { id: "moderate", label: "Mer agitée", short: "Agitée", rank: 3 } as const;
  if (height < 4) return { id: "rough", label: "Mer forte", short: "Forte", rank: 4 } as const;
  return { id: "high", label: "Mer très forte", short: "Très forte", rank: 5 } as const;
}

type Point = { latitude: number; longitude: number };

/** Trois repères en mer, entre les deux ports. */
export function crossingPoints(from: Point, to: Point): Point[] {
  return [0.25, 0.5, 0.75].map((ratio) => ({
    latitude: Math.round((from.latitude + (to.latitude - from.latitude) * ratio) * 100) / 100,
    longitude: Math.round((from.longitude + (to.longitude - from.longitude) * ratio) * 100) / 100,
  }));
}

type MarineResponse = { hourly?: { time?: string[]; wave_height?: (number | null)[] } };

/** La plus forte hauteur de vagues prévue pendant la traversée. Null sans donnée sur ce créneau. */
export function peakWaves(responses: MarineResponse[], startMs: number, endMs: number) {
  let peak: number | null = null;
  for (const response of responses) {
    const times = response.hourly?.time ?? [];
    const heights = response.hourly?.wave_height ?? [];
    for (const [index, time] of times.entries()) {
      const at = Date.parse(`${time}Z`);
      const height = heights[index];
      if (at < startMs - 3_600_000 || at > endMs + 3_600_000 || height == null) continue;
      if (peak === null || height > peak) peak = height;
    }
  }
  return peak;
}

/** Au-delà, la source ne prévoit plus rien. */
export const SEA_FORECAST_DAYS = 7;

export const seaForecastQuery = (id: string, from: Point, to: Point, startMs: number, endMs: number) =>
  queryOptions({
    queryKey: ["sea-forecast", id],
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async () => {
      const points = crossingPoints(from, to);
      const url =
        "https://marine-api.open-meteo.com/v1/marine" +
        `?latitude=${points.map((p) => p.latitude).join(",")}` +
        `&longitude=${points.map((p) => p.longitude).join(",")}` +
        `&hourly=wave_height&timezone=GMT&forecast_days=${SEA_FORECAST_DAYS + 1}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Prévisions indisponibles");
      const data = (await response.json()) as MarineResponse | MarineResponse[];
      return peakWaves(Array.isArray(data) ? data : [data], startMs, endMs);
    },
  });
