// Messages d'exemple de l'aperçu des salons, gérés par l'équipe dans l'admin.
import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as unknown as SupabaseClient;

export type DemoMessage = {
  id: string;
  pseudo: string;
  avatar: string;
  label: string;
  body: string;
  sort: number;
  active: boolean;
};

export const chatDemoKey = ["bw-chat", "demo"] as const;

/** Null tant que la table n'existe pas : l'aperçu garde alors ses exemples intégrés. */
export const chatDemoQuery = queryOptions({
  queryKey: chatDemoKey,
  queryFn: async (): Promise<DemoMessage[] | null> => {
    const { data, error } = await supabase
      .from("bw_chat_demo_messages")
      .select("id,pseudo,avatar,label,body,sort,active")
      .order("sort");
    if (error) return null;
    return data as DemoMessage[];
  },
  staleTime: 5 * 60_000,
  retry: false,
});
