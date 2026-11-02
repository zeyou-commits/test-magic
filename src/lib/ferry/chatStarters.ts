// Phrases d'amorce des salons et des questions : gérées dans l'admin, remplies avec la traversée.
import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as unknown as SupabaseClient;

export type StarterMoment = "before" | "boarding" | "sea" | "arrival" | "port" | "questions";
export type Starter = {
  id: string;
  moment: StarterMoment;
  body: string;
  sort: number;
  active: boolean;
};
/** Ce que la phrase peut citer : les ports, le navire, la compagnie. */
export type StarterContext = {
  depart?: string | null | undefined;
  arrivee?: string | null | undefined;
  navire?: string | null | undefined;
  compagnie?: string | null | undefined;
  port?: string | null | undefined;
};

export const STARTER_MOMENTS: { id: StarterMoment; label: string }[] = [
  { id: "before", label: "Avant le départ" },
  { id: "boarding", label: "Jour J, avant d'embarquer" },
  { id: "sea", label: "En mer" },
  { id: "arrival", label: "À l'arrivée" },
  { id: "port", label: "Direct du port" },
  { id: "questions", label: "Questions sur la ligne" },
];
export const STARTER_WORDS = ["depart", "arrivee", "navire", "compagnie", "port"] as const;

export const chatStartersKey = ["bw-chat", "starters"] as const;
/** Null tant que la table n'existe pas : les phrases intégrées prennent le relais. */
export const chatStartersQuery = queryOptions({
  queryKey: chatStartersKey,
  queryFn: async (): Promise<Starter[] | null> => {
    const { data, error } = await supabase.from("bw_chat_starters").select("*").order("sort");
    if (error) return null;
    return data as Starter[];
  },
  staleTime: 10 * 60_000,
  retry: false,
});

/** Le français autour des noms : « d'Alicante », « du Cracovia » (navire nommé « Le Cracovia »). */
export function frenchArticles(text: string) {
  return text
    .replace(/(^|\s)(du|de) Le /g, "$1du ")
    .replace(/(^|\s)(du|de) Les /g, "$1des ")
    .replace(/(^|\s)de La /g, "$1de la ")
    .replace(/(^|\s)(le|Le) Le /g, "$1$2 ")
    .replace(/(^|\s)de ([AEIOUYHÂÉÈÊÎÔÛaeiouyhâéèêîôû])/g, "$1d'$2");
}

/** Remplace {depart}, {navire}… ; une phrase dont un mot manque n'est pas proposée. */
export function fillStarter(body: string, context: StarterContext) {
  let missing = false;
  const text = body.replace(/\{(\w+)\}/g, (_match, word: string) => {
    const value = context[word as keyof StarterContext];
    if (!value) missing = true;
    return value ?? "";
  });
  return missing ? null : frenchArticles(text);
}

/** Les 3 premières phrases utilisables pour ce moment, sinon les phrases intégrées. */
export function startersFor(
  moment: StarterMoment,
  list: Starter[] | null | undefined,
  context: StarterContext,
  fallback: string[],
) {
  const source = list
    ? list.filter((item) => item.active && item.moment === moment).map((item) => item.body)
    : fallback;
  return source
    .map((body) => fillStarter(body, context))
    .filter((text): text is string => Boolean(text))
    .slice(0, 3);
}
