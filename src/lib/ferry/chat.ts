// Écrire dans un salon ou une ligne, et garder le message le temps d'une inscription.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { currentPosition } from "./community";
import { chatRefusal } from "./portPassage";

const supabase = typedSupabase as unknown as SupabaseClient;

export type ChatKind = "crossing" | "port" | "route";
export type PendingChat = { kind: ChatKind; room: string; body: string; parent?: string };

/** Message parti après une inscription : les formulaires ouverts se vident. */
export const CHAT_SENT_EVENT = "bledway:chat-sent";
const storageKey = "bledway:pending-chat:v1";
const LIFETIME = 7 * 86_400_000;

export async function postToRoom(kind: ChatKind, room: string, body: string, parent?: string) {
  const here = kind === "port" ? await currentPosition() : null;
  const { data, error } = await supabase.rpc("bw_chat_post", {
    p_kind: kind,
    p_room: room,
    p_body: body,
    p_lat: here?.[1] ?? null,
    p_lon: here?.[0] ?? null,
    ...(parent ? { p_parent: parent } : {}),
  });
  if (error) throw new Error("Message non envoyé. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
}

export function rememberPendingChat(chat: PendingChat) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ chat, expires: Date.now() + LIFETIME }));
  } catch {
    /* Le message reste dans le formulaire. */
  }
}

export function pendingChat(): PendingChat | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
      chat?: PendingChat;
      expires?: number;
    } | null;
    return stored?.chat?.body && (stored.expires ?? 0) > Date.now() ? stored.chat : null;
  } catch {
    return null;
  }
}

export function clearPendingChat() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* stockage facultatif */
  }
}

/** Envoie le message gardé. Renvoie vrai s'il est parti ; une erreur explique un refus. */
export async function flushPendingChat() {
  const chat = pendingChat();
  if (!chat) return false;
  clearPendingChat();
  await postToRoom(chat.kind, chat.room, chat.body, chat.parent);
  window.dispatchEvent(new Event(CHAT_SENT_EVENT));
  return true;
}
