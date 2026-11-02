// Messages privés : une demande à accepter, puis 3 messages chacun.
import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { TravellerCard } from "@/lib/community/travellers";
import { chatRefusal } from "./portPassage";

const supabase = typedSupabase as unknown as SupabaseClient;

export type DmThread = {
  id: string;
  departure_id: string;
  status: "pending" | "accepted" | "refused" | "closed";
  intro: string;
  created_at: string;
  mine: boolean;
  line: string | null;
  other: TravellerCard;
  my_left: number;
  other_left: number;
  unread: number;
  messages: { id: string; body: string; me: boolean; created_at: string }[];
};

export const dmKey = ["bw-dm"] as const;
export const dmInboxQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: [...dmKey, userId ?? "anonyme"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DmThread[] | null> => {
      const { data, error } = await supabase.rpc("bw_dm_inbox");
      if (error) {
        // Module pas encore activé en base : aucune entrée à afficher.
        if (error.code === "PGRST202" || error.code === "42883") return null;
        throw new Error("Messages privés indisponibles.");
      }
      return data as DmThread[];
    },
    retry: false,
    refetchInterval: 30_000,
  });

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error("Action impossible pour le moment. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
}

export const requestDm = (departure: string, handle: string, body: string) =>
  call("bw_dm_request", { p_departure: departure, p_handle: handle, p_body: body });
export const answerDm = (thread: string, accept: boolean) =>
  call("bw_dm_answer", { p_thread: thread, p_accept: accept });
export const sendDm = (thread: string, body: string) =>
  call("bw_dm_send", { p_thread: thread, p_body: body });
export const blockDm = (thread: string) => call("bw_dm_block", { p_thread: thread });
export const reportDm = (thread: string) => call("bw_dm_report", { p_thread: thread });
/** Ceux que j'ai déjà croisés : un total, et lesquels sont sur cette traversée. */
export const metQuery = (departure: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ["bw-chat-met", departure, userId ?? "anonyme"],
    enabled: Boolean(userId && departure),
    queryFn: async (): Promise<{ total: number; here: string[] } | null> => {
      const { data, error } = await supabase.rpc("bw_chat_met", { p_departure: departure });
      return error ? null : (data as { total: number; here: string[] });
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

export async function readDm(thread: string) {
  await supabase.rpc("bw_dm_read", { p_thread: thread });
}

/** Ce que voit chacun selon l'état de la conversation. */
export function dmState(thread: Pick<DmThread, "status" | "mine" | "my_left">) {
  if (thread.status === "pending") return thread.mine ? "waiting" : "to-answer";
  // Un refus reste discret : pour celle qui demande, la demande reste simplement sans réponse.
  if (thread.status === "refused") return "waiting";
  if (thread.status === "closed") return "closed";
  return thread.my_left > 0 ? "open" : "used-up";
}

export const leftLabel = (left: number) =>
  left > 1
    ? `Il vous reste ${left} messages`
    : left === 1
      ? "Il vous reste 1 message"
      : "Vous avez utilisé vos 3 messages";

// Ouvert depuis la cloche : on arrive sur les messages privés. Lu au chargement.
let dmFocus = typeof window !== "undefined" && /[?&]dm=1\b/.test(window.location.search);
export function takeDmFocus() {
  const wanted = dmFocus;
  dmFocus = false;
  return wanted;
}
