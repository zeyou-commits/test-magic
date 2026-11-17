// Réactions aux messages du salon : une par personne et par message, comme sur les messageries.
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { TravellerCard } from "@/lib/community/travellers";
import { chatRefusal } from "./portPassage";

const supabase = typedSupabase as unknown as SupabaseClient;

/** L'ordre de la barre de réactions ; le code est celui enregistré en base. */
export const REACTIONS = [
  { code: "like", emoji: "👍", label: "J'aime" },
  { code: "love", emoji: "❤️", label: "J'adore" },
  { code: "haha", emoji: "😂", label: "Mdr" },
  { code: "wow", emoji: "😮", label: "Waouh" },
  { code: "sad", emoji: "😢", label: "Triste" },
  { code: "pray", emoji: "🙏", label: "Merci" },
] as const;
export type ReactionCode = (typeof REACTIONS)[number]["code"];
export const reactionEmoji = (code: string) =>
  REACTIONS.find((item) => item.code === code)?.emoji ?? "👍";

export type MessageReactions = {
  counts: Partial<Record<ReactionCode, number>>;
  mine: ReactionCode | null;
};
export type ReactionMap = Record<string, MessageReactions>;
export type Reactor = { emoji: ReactionCode; me: boolean; card: TravellerCard };

const missing = (code?: string) => ["PGRST202", "42883", "42P01"].includes(code ?? "");

/** Les réactions des messages affichés ; null tant que le script n'est pas passé en base. */
export const chatReactionsQuery = (
  kind: string,
  room: string,
  ids: string[],
  userId: string | undefined,
) =>
  queryOptions({
    // Sous la clé du salon : le signal « changed » du direct relit aussi les réactions.
    queryKey: ["bw-chat", kind, room, "emoji", userId ?? "anonyme", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ReactionMap | null> => {
      const { data, error } = await supabase.rpc("bw_chat_emoji_counts", {
        p_messages: ids.slice(0, 200),
      });
      if (error) {
        if (missing(error.code)) return null;
        throw new Error("Réactions indisponibles.");
      }
      return (data ?? {}) as ReactionMap;
    },
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 15_000,
  });

export async function setChatReaction(message: string, code: ReactionCode) {
  const { data, error } = await supabase.rpc("bw_chat_emoji_set", {
    p_message: message,
    p_emoji: code,
  });
  if (error) throw new Error("Réaction non enregistrée. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok)
    throw new Error(
      result.refused === "account"
        ? "Connectez-vous pour réagir."
        : chatRefusal(result.refused ?? ""),
    );
}

/** Ce que devient l'affichage dès le toucher, avant la réponse du serveur. */
export function applyReaction(
  map: ReactionMap | null | undefined,
  message: string,
  code: ReactionCode,
): ReactionMap {
  const current = map?.[message] ?? { counts: {}, mine: null };
  const counts = { ...current.counts };
  if (current.mine) {
    const left = (counts[current.mine] ?? 1) - 1;
    if (left > 0) counts[current.mine] = left;
    else delete counts[current.mine];
  }
  const mine = current.mine === code ? null : code;
  if (mine) counts[mine] = (counts[mine] ?? 0) + 1;
  return { ...(map ?? {}), [message]: { counts, mine } };
}

/** Qui a réagi à un message (pseudo et avatar publics). */
export const reactorsQuery = (message: string | null) =>
  queryOptions({
    queryKey: ["bw-chat-reactors", message],
    enabled: Boolean(message),
    queryFn: async (): Promise<Reactor[]> => {
      const { data, error } = await supabase.rpc("bw_chat_emoji_who", { p_message: message });
      if (error) throw new Error("Liste indisponible.");
      return (data ?? []) as Reactor[];
    },
    retry: false,
    staleTime: 10_000,
  });
