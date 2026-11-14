import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

/**
 * Inviter un proche dans le salon de sa traversée : un lien personnel par passager et par traversée.
 * La personne invitée écrit avec la mention « invité », jusqu'à 24 h après l'arrivée.
 */
const supabase = typedSupabase as unknown as SupabaseClient;

const TOKEN = /^[0-9a-f]{32}$/;
export const isInviteToken = (value: string | null | undefined): value is string =>
  Boolean(value && TOKEN.test(value));

/** Mon lien d'invitation pour ce salon ; null si je ne peux pas inviter (pas passager, hors ligne). */
export async function createRoomInvite(departureId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("bw_room_invite_create", { p_departure: departureId });
  if (error) return null;
  const result = data as { ok: boolean; token?: string };
  return result.ok && isInviteToken(result.token) ? result.token : null;
}

export type InviteInfo = {
  ok: boolean;
  departure_id?: string;
  line?: string | null;
  inviter?: string;
  open?: boolean;
};
export const roomInviteInfoQuery = (token: string | null) =>
  queryOptions({
    queryKey: ["bw-room-invite", token ?? "aucun"],
    enabled: isInviteToken(token),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<InviteInfo | null> => {
      const { data, error } = await supabase.rpc("bw_room_invite_info", { p_token: token });
      if (error) return null;
      return data as InviteInfo;
    },
  });

const REFUSED: Record<string, string> = {
  account: "Connectez-vous pour accepter l'invitation.",
  unknown: "Ce lien d'invitation n'est plus valable.",
  expired: "Cette traversée est terminée : l'invitation n'est plus valable.",
  full: "Ce lien a déjà servi à 10 personnes. Demandez un nouveau lien à la personne qui vous invite.",
};

export type AcceptResult = { status: "guest" | "member"; departureId: string; inviter?: string };
export async function acceptRoomInvite(token: string): Promise<AcceptResult> {
  const { data, error } = await supabase.rpc("bw_room_invite_accept", { p_token: token });
  if (error) throw new Error("Invitation impossible à accepter pour le moment. Réessayez.");
  const result = data as {
    ok: boolean;
    refused?: string;
    status?: "guest" | "member";
    departure_id?: string;
    inviter?: string;
  };
  if (!result.ok || !result.departure_id)
    throw new Error(REFUSED[result.refused ?? ""] ?? REFUSED["unknown"]);
  return {
    status: result.status ?? "guest",
    departureId: result.departure_id,
    ...(result.inviter ? { inviter: result.inviter } : {}),
  };
}

/** Invitation reçue, gardée le temps de se connecter ou de créer son compte (7 jours au plus). */
const PENDING_KEY = "bledway:room-invite:v1";
export const PENDING_INVITE_EVENT = "bledway:room-invite-pending";
type Pending = { token: string; departureId: string; expires: number };

export function rememberRoomInvite(token: string, departureId: string) {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ token, departureId, expires: Date.now() + 7 * 86_400_000 }),
    );
    window.dispatchEvent(new Event(PENDING_INVITE_EVENT));
  } catch {
    /* stockage facultatif : l'invitation reste dans l'adresse */
  }
}
export function pendingRoomInvite(): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    if (!value || !isInviteToken(value.token) || value.expires < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}
export function clearRoomInvite() {
  try {
    localStorage.removeItem(PENDING_KEY);
    window.dispatchEvent(new Event(PENDING_INVITE_EVENT));
  } catch {
    /* stockage facultatif */
  }
}
