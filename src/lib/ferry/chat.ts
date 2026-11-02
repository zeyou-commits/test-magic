// Écrire dans un salon ou une ligne, et garder le message le temps d'une inscription.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { currentPosition } from "./community";
import { chatRefusal } from "./portPassage";

const supabase = typedSupabase as unknown as SupabaseClient;

export type ChatKind = "crossing" | "port" | "route";
export type PendingChat = {
  kind: ChatKind;
  room: string;
  body: string;
  parent?: string;
  replyTo?: string;
};

/** Message parti après une inscription : les formulaires ouverts se vident. */
export const CHAT_SENT_EVENT = "bledway:chat-sent";
const storageKey = "bledway:pending-chat:v1";
const LIFETIME = 7 * 86_400_000;

export async function postToRoom(
  kind: ChatKind,
  room: string,
  body: string,
  parent?: string,
  replyTo?: string,
  /** Équipe seulement : le message part au nom de BledWay (refusé côté serveur sinon). */
  official = false,
) {
  const here = kind === "port" ? await currentPosition() : null;
  const { data, error } = await supabase.rpc("bw_chat_post", {
    p_kind: kind,
    p_room: room,
    p_body: body,
    p_lat: here?.[1] ?? null,
    p_lon: here?.[0] ?? null,
    ...(parent ? { p_parent: parent } : {}),
    ...(replyTo ? { p_reply_to: replyTo } : {}),
    ...(official ? { p_official: true } : {}),
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
  await postToRoom(chat.kind, chat.room, chat.body, chat.parent, chat.replyTo);
  window.dispatchEvent(new Event(CHAT_SENT_EVENT));
  return true;
}

async function ownMessage(fn: string, args: Record<string, string>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error("Action impossible pour le moment. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
}
export const editOwnMessage = (id: string, body: string) =>
  ownMessage("bw_chat_edit", { p_message: id, p_body: body });
/** Version de la charte en vigueur, la même que côté serveur. */
export const CHARTER_VERSION = 1;
export async function acceptCharter() {
  const { data, error } = await supabase.rpc("bw_charter_accept", { p_version: CHARTER_VERSION });
  if (error) throw new Error("Acceptation non enregistrée. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
}

/** Sourdine d'un salon : plus de notification de mention ni de réponse venue de lui. */
export async function muteRoom(kind: ChatKind, room: string, muted: boolean) {
  const { error } = await supabase.rpc("bw_chat_mute", { p_kind: kind, p_room: room, p_muted: muted });
  if (error) throw new Error("Réglage non enregistré. Réessayez.");
}

/** Une mention s'écrit @[identifiant] dans le message, et s'affiche @Pseudo. */
export const mentionToken = (handle: string) => `@[${handle}]`;
export const MENTION_PATTERN = /@\[([0-9a-f]{10})\]/g;

/** Les @Pseudo choisis dans la liste deviennent des mentions au moment de l'envoi. */
export function withMentions(text: string, chosen: Map<string, string>) {
  let result = text;
  for (const [pseudo, handle] of chosen)
    result = result.split(`@${pseudo}`).join(mentionToken(handle));
  return result;
}

export const deleteOwnMessage = (id: string) => ownMessage("bw_chat_delete", { p_message: id });

// Ouvert depuis une invitation : on va droit au salon. Lu au chargement, l'adresse est réécrite ensuite.
let roomFocus = typeof window !== "undefined" && /[?&]room=1\b/.test(window.location.search);
export function takeRoomFocus() {
  const wanted = roomFocus;
  roomFocus = false;
  return wanted;
}

/** Entrer directement dans un salon, même si sa fiche n'est pas encore ouverte. */
export const ENTER_ROOM_EVENT = "bledway:enter-room";
let wantedRoom: string | null = null;
export function enterRoom(kind: "crossing" | "port", room: string) {
  wantedRoom = `${kind}:${room}`;
  window.dispatchEvent(new Event(ENTER_ROOM_EVENT));
}
export function roomWanted(kind: "crossing" | "port", room: string) {
  if (wantedRoom !== `${kind}:${room}`) return false;
  wantedRoom = null;
  return true;
}
