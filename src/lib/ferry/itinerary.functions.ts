import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const portSchema = z.object({
  id: z.string().uuid(),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

const requestSchema = z.object({
  origin: z.string().trim().min(5).max(180),
  destination: z.string().trim().min(5).max(180),
  departurePorts: z.array(portSchema).min(1).max(20),
  arrivalPorts: z.array(portSchema).min(1).max(20),
});

type Place = { label: string; point: [number, number] };
type PortPoint = z.infer<typeof portSchema>;
type MatrixResponse = { code?: string; distances?: (number | null)[][]; durations?: (number | null)[][] };
const geocodeCache = new Map<string, Place>();
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();

function roadEstimate(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to[1] - from[1]);
  const dLon = radians(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from[1])) * Math.cos(radians(to[1])) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.32;
  return { distanceKm: Math.round(distanceKm), durationMin: Math.ceil(distanceKm / 68 * 60) };
}

async function geocode(text: string): Promise<Place> {
  const coordinateMatch = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]?.replace(",", "."));
    const longitude = Number(coordinateMatch[2]?.replace(",", "."));
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { label: text, point: [longitude, latitude] };
  }
  const cacheKey = text.trim().toLocaleLowerCase("fr");
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;
  const previous = geocodeQueue;
  let release!: () => void;
  geocodeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", text);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "fr");
  const response = await fetch(url, { headers: { "User-Agent": "BledWay/1.0 (https://test-magic.vercel.app)" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("La recherche d'adresse est momentanément indisponible.");
  const data = await response.json() as { features?: { geometry?: { coordinates?: number[] }; properties?: { name?: string; city?: string; country?: string } }[] };
  const first = data.features?.[0];
  const longitude = Number(first?.geometry?.coordinates?.[0]);
  const latitude = Number(first?.geometry?.coordinates?.[1]);
  if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw new Error(`Adresse introuvable : ${text}. Précisez la ville et le pays.`);
  const place: Place = { label: [first.properties?.name, first.properties?.city, first.properties?.country].filter(Boolean).join(", ") || text, point: [longitude, latitude] };
  if (geocodeCache.size > 500) geocodeCache.clear();
  geocodeCache.set(cacheKey, place);
  return place;
  } finally { release(); }
}

function osrmBase() {
  const configured = process.env["OSRM_BASE_URL"];
  if (!configured) return null;
  const url = new URL(configured);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("OSRM_BASE_URL doit utiliser HTTPS.");
  return url.href.replace(/\/$/, "");
}

async function matrix(points: [number, number][], sources: string[], destinations: string[], base: string) {
  const coordinates = points.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = new URL(`${base}/table/v1/driving/${coordinates}`);
  url.searchParams.set("sources", sources.join(";"));
  url.searchParams.set("destinations", destinations.join(";"));
  url.searchParams.set("annotations", "distance,duration");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Le calcul des trajets routiers est momentanément indisponible.");
  const data = await response.json() as MatrixResponse;
  if (!data.distances || !data.durations) throw new Error("Aucun trajet routier exploitable n'a été trouvé.");
  return data;
}

function roadLeg(port: PortPoint, distanceMeters: number | null | undefined, durationSeconds: number | null | undefined) {
  if (distanceMeters == null || durationSeconds == null || !Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;
  return { portId: port.id, distanceKm: Math.round(distanceMeters / 100) / 10, durationMin: Math.ceil(durationSeconds / 60) };
}

/** La clé reste sur le serveur. Les adresses ne sont envoyées qu'après validation du formulaire. */
export const calculateRoadAccess = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const base = osrmBase();
    const origin = await geocode(data.origin);
    const destination = await geocode(data.destination);
    const firstPoints: [number, number][] = [origin.point, ...data.departurePorts.map((port) => [port.longitude, port.latitude] as [number, number])];
    const lastPoints: [number, number][] = [...data.arrivalPorts.map((port) => [port.longitude, port.latitude] as [number, number]), destination.point];
    const [outward, onward] = base ? await Promise.all([
      matrix(firstPoints, ["0"], data.departurePorts.map((_, index) => String(index + 1)), base),
      matrix(lastPoints, data.arrivalPorts.map((_, index) => String(index)), [String(data.arrivalPorts.length)], base),
    ]) : [null, null];
    return {
      origin: origin.label,
      destination: destination.label,
      originPoint: origin.point,
      destinationPoint: destination.point,
      roadMode: base ? "osrm" as const : "estimate" as const,
      toDeparturePorts: data.departurePorts.flatMap((port, index) => {
        const estimate = roadEstimate(origin.point, [port.longitude, port.latitude]);
        const leg = base ? roadLeg(port, outward?.distances?.[0]?.[index], outward?.durations?.[0]?.[index]) : { portId: port.id, ...estimate };
        return leg ? [leg] : [];
      }),
      fromArrivalPorts: data.arrivalPorts.flatMap((port, index) => {
        const estimate = roadEstimate([port.longitude, port.latitude], destination.point);
        const leg = base ? roadLeg(port, onward?.distances?.[index]?.[0], onward?.durations?.[index]?.[0]) : { portId: port.id, ...estimate };
        return leg ? [leg] : [];
      }),
    };
  });

const geometrySchema = z.object({
  origin: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  destination: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  departurePort: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  arrivalPort: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

async function directions(from: [number, number], to: [number, number], base: string): Promise<[number, number][]> {
  const url = new URL(`${base}/route/v1/driving/${from.join(",")};${to.join(",")}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Le tracé routier est momentanément indisponible.");
  const data = await response.json() as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (!coordinates?.length) throw new Error("Le tracé routier n'a pas été trouvé.");
  return coordinates;
}

export const calculateRoadGeometry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => geometrySchema.parse(input))
  .handler(async ({ data }) => {
    const base = osrmBase();
    if (!base) throw new Error("Tracé routier non configuré.");
    const [toPort, fromPort] = await Promise.all([
      directions(data.origin, data.departurePort, base),
      directions(data.arrivalPort, data.destination, base),
    ]);
    return { toPort, fromPort };
  });
