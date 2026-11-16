import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RecentMessage } from "./chatDemo";

/** Un message montré sur la carte (aperçu au zoom, fil au toucher). */
export type MapMessage = {
  id: string;
  body: string;
  created_at: string;
  author: { pseudo: string; avatar?: string | null; official?: boolean };
  demo?: boolean;
};

/** Un salon qui a parlé récemment : sa pastille porte le nombre de messages. */
export type MapRoom = {
  kind: "crossing" | "port";
  room: string;
  count: number;
  last_at: string;
  label: string | null;
  messages: MapMessage[];
};

/** Salons actifs sur 24 h : nombre de messages et les 3 derniers. */
export const mapRoomsQuery = queryOptions({
  queryKey: ["bw-chat", "map-rooms"],
  queryFn: async (): Promise<MapRoom[]> => {
    const { data, error } = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )("bw_chat_map_rooms", { p_hours: 24 });
    if (error || !Array.isArray(data)) return [];
    return data as MapRoom[];
  },
  refetchInterval: 30_000,
  retry: false,
});

/** Une pastille : un lieu (navire, port ou point de la route) et ses messages. */
export type PinGroup = {
  key: string;
  /** Salon réel à ouvrir (absent pour les exemples). */
  room: { kind: "crossing" | "port"; id: string } | null;
  label: string | null;
  count: number;
  last_at: string;
  messages: MapMessage[];
  demo: boolean;
  road: boolean;
};

/**
 * Regroupe les salons réels et les exemples par lieu : une seule pastille par navire ou port,
 * quel que soit le nombre de messages. `placeOf` donne la clé du lieu d'un exemple (ou null s'il
 * n'a pas de place à l'écran).
 */
export function groupPins(
  rooms: MapRoom[],
  demos: RecentMessage[],
  placeOf: (message: RecentMessage) => string | null,
): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const room of rooms) {
    const key = `${room.kind === "port" ? "p" : "d"}:${room.room}`;
    groups.set(key, {
      key,
      room: { kind: room.kind, id: room.room },
      label: room.label,
      count: room.count,
      last_at: room.last_at,
      messages: room.messages ?? [],
      demo: false,
      road: false,
    });
  }
  for (const demo of demos) {
    const key = placeOf(demo);
    if (!key) continue;
    const message: MapMessage = {
      id: demo.id,
      body: demo.body,
      created_at: demo.created_at,
      author: demo.author,
      demo: true,
    };
    const existing = groups.get(key);
    if (existing) {
      // Un vrai salon au même endroit passe devant : l'exemple ne fait que compléter.
      existing.count += 1;
      if (existing.messages.length < 3) existing.messages.push(message);
      continue;
    }
    groups.set(key, {
      key,
      room: null,
      label: demo.label,
      count: 1,
      last_at: demo.created_at,
      messages: [message],
      demo: true,
      road: Boolean(demo.road),
    });
  }
  return [...groups.values()];
}

/** « +5 », plafonné pour rester lisible. */
export function countLabel(count: number) {
  return count > 99 ? "99+" : `+${count}`;
}

/** Un message tout juste arrivé fait pulser sa pastille. */
export const FRESH_MS = 10 * 60_000;
export function isFresh(lastAt: string, now: number) {
  const at = Date.parse(lastAt);
  return Number.isFinite(at) && now - at < FRESH_MS;
}
