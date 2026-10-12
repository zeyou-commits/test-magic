// Lecture tolérante de la réponse de l'API de suivi (MarineTraffic via RapidAPI).
// Fichier sans dépendance serveur : il est aussi utilisé par les tests.

export interface ParsedPosition {
  mmsi: number;
  vesselName: string | null;
  status: string | null;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  courseDeg: number | null;
  reportedAt: string | null;
}

const num = (value: unknown): number | null => {
  const n =
    typeof value === "string"
      ? Number(value.replace(",", "."))
      : typeof value === "number"
        ? value
        : NaN;
  return Number.isFinite(n) ? n : null;
};

const pick = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    const found = Object.keys(source).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (
      found !== undefined &&
      source[found] !== null &&
      source[found] !== undefined &&
      source[found] !== ""
    )
      return source[found];
  }
  return undefined;
};

/** « 2023-10-27 10:30:00 UTC » ou ISO → ISO UTC, ou null. */
export function parseReportedAt(value: unknown): string | null {
  if (typeof value === "number") {
    const date = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/\s*UTC$/i, "Z")
    .replace(" ", "T");
  const date = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(cleaned) ? cleaned : `${cleaned}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Accepte un objet, un tableau, ou { data: … } / { result: … } et renvoie la première position valide. */
export function parsePosition(raw: unknown, fallbackMmsi: number): ParsedPosition | null {
  const candidate = (() => {
    if (Array.isArray(raw)) return raw[0];
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      for (const key of ["data", "result", "results", "vessel", "position"]) {
        const inner = obj[key];
        if (Array.isArray(inner)) return inner[0];
        if (inner && typeof inner === "object") return inner;
      }
    }
    return raw;
  })();
  if (!candidate || typeof candidate !== "object") return null;
  const item = candidate as Record<string, unknown>;

  const latitude = num(pick(item, ["latitude", "lat"]));
  const longitude = num(pick(item, ["longitude", "lon", "lng", "long"]));
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const mmsi = num(pick(item, ["mmsi"])) ?? fallbackMmsi;
  const course = num(pick(item, ["course", "cog", "heading"]));
  const name = pick(item, ["vessel_name", "shipname", "name"]);
  const status = pick(item, ["status", "navstatus"]);

  return {
    mmsi,
    vesselName: typeof name === "string" ? name : null,
    status: typeof status === "string" ? status : status !== undefined ? String(status) : null,
    latitude,
    longitude,
    speedKnots: num(pick(item, ["speed", "sog", "speed_knots"])),
    courseDeg: course === null ? null : ((course % 360) + 360) % 360,
    reportedAt: parseReportedAt(
      pick(item, ["last_reported", "timestamp", "last_pos", "reported_at", "time"]),
    ),
  };
}
