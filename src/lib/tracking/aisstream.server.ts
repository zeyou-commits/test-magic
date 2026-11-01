// Lecture ponctuelle du flux AISStream (WebSocket) : on s'abonne aux MMSI voulus,
// on écoute quelques secondes, puis on ferme. Compatible avec le runtime serveur (pas de connexion permanente).
import type { ParsedPosition } from "./parse";

const STREAM_URL = "wss://stream.aisstream.io/v0/stream";
/** Méditerranée occidentale + golfe du Lion (lat/lon). */
const BOUNDING_BOX = [
  [30.0, -10.0],
  [46.0, 16.0],
];

interface AisEnvelope {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number; time_utc?: string };
  Message?: {
    PositionReport?: {
      Latitude?: number;
      Longitude?: number;
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      NavigationalStatus?: number;
      Valid?: boolean;
    };
  };
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  // « 2026-10-13 01:56:23.557 +0000 UTC »
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (!m) return null;
  const date = new Date(`${m[1]}T${m[2]}${m[3] ? m[3].slice(0, 4) : ""}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseAisMessage(raw: unknown): ParsedPosition | null {
  const msg = raw as AisEnvelope;
  if (msg?.MessageType !== "PositionReport") return null;
  const report = msg.Message?.PositionReport;
  const meta = msg.MetaData;
  const mmsi = meta?.MMSI;
  const latitude = report?.Latitude ?? meta?.latitude;
  const longitude = report?.Longitude ?? meta?.longitude;
  if (!mmsi || typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const heading = report?.TrueHeading;
  const course = typeof report?.Cog === "number" && report.Cog < 360 ? report.Cog : heading !== undefined && heading < 360 ? heading : null;
  return {
    mmsi,
    vesselName: meta?.ShipName?.trim() || null,
    status: report?.NavigationalStatus !== undefined ? String(report.NavigationalStatus) : null,
    latitude,
    longitude,
    speedKnots: typeof report?.Sog === "number" && report.Sog < 102.3 ? report.Sog : null,
    courseDeg: course,
    reportedAt: toIso(meta?.time_utc),
  };
}

/** Ce que le flux a réellement donné : pour distinguer un navire muet d'une écoute coupée. */
export type StreamStats = { messages: number; connections: number; error: string | null };

/** Délai avant de se reconnecter après une coupure, et temps minimum pour que cela serve encore. */
const RECONNECT_DELAY_MS = 1500;
const RECONNECT_MIN_LEFT_MS = 10_000;

/** Écoute le flux jusqu'à avoir une position pour chaque MMSI, ou jusqu'à `timeoutMs`. */
export function collectPositions(
  apiKey: string,
  mmsis: number[],
  timeoutMs: number,
  statics?: Map<number, { destination: string | null; eta: string | null }>,
  stats: StreamStats = { messages: 0, connections: 0, error: null },
): Promise<Map<number, ParsedPosition>> {
  const found = new Map<number, ParsedPosition>();
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    let done = false;
    let socket: WebSocket | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(retry);
      try {
        socket?.close();
      } catch {
        /* déjà fermé */
      }
      resolve(found);
    };
    const timer = setTimeout(finish, timeoutMs);
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Une coupure en cours d'écoute ne doit pas faire perdre le reste de la fenêtre.
    const lost = (current: WebSocket) => {
      if (done || current !== socket) return;
      socket = undefined;
      if (deadline - Date.now() < RECONNECT_MIN_LEFT_MS) {
        finish();
        return;
      }
      retry = setTimeout(connect, RECONNECT_DELAY_MS);
    };
    const connect = () => {
      if (done) return;
      stats.connections += 1;
      let current: WebSocket;
      try {
        current = new WebSocket(STREAM_URL);
      } catch (error) {
        console.error("[tracking] AISStream : connexion impossible", error);
        stats.error = "connexion impossible";
        finish();
        return;
      }
      socket = current;
      current.addEventListener("open", () => {
        current.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [BOUNDING_BOX],
            FiltersShipMMSI: mmsis.slice(0, 200).map(String),
            FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          }),
        );
      });
      current.addEventListener("message", async (event) => {
        try {
          const data = event.data;
          const text =
            typeof data === "string"
              ? data
              : data instanceof ArrayBuffer
                ? new TextDecoder().decode(data)
                : await (data as Blob).text();
          const parsed = JSON.parse(text);
          if (parsed?.error) {
            console.error("[tracking] AISStream :", parsed.error);
            stats.error = String(parsed.error).slice(0, 120);
            finish();
            return;
          }
          stats.messages += 1;
          if (parsed?.MessageType === "ShipStaticData" && statics) {
            const st = parsed.Message?.ShipStaticData;
            const id = Number(parsed.MetaData?.MMSI);
            if (st && mmsis.includes(id)) {
              const e = st.Eta;
              const pad = (n: number) => String(n).padStart(2, "0");
              statics.set(id, {
                destination: String(st.Destination ?? "").replace(/@/g, "").trim() || null,
                eta: e && e.Month ? `${pad(e.Day)}/${pad(e.Month)} ${pad(e.Hour)}:${pad(e.Minute)} UTC` : null,
              });
            }
          }
          const position = parseAisMessage(parsed);
          if (position && mmsis.includes(position.mmsi)) {
            found.set(position.mmsi, position);
            if (found.size >= mmsis.length) finish();
          }
        } catch {
          /* message ignoré */
        }
      });
      current.addEventListener("error", () => lost(current));
      current.addEventListener("close", () => lost(current));
    };
    connect();
  });
}
