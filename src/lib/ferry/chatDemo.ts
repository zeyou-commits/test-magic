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
  /** Le lieu d'où sort sa bulle sur la carte : un port, ou une ligne. */
  port_id?: string | null;
  route_id?: string | null;
};

export const chatDemoKey = ["bw-chat", "demo"] as const;

/** Null tant que la table n'existe pas : l'aperçu garde alors ses exemples intégrés. */
export const chatDemoQuery = queryOptions({
  queryKey: chatDemoKey,
  queryFn: async (): Promise<DemoMessage[] | null> => {
    const { data, error } = await supabase
      .from("bw_chat_demo_messages")
      .select("*")
      .order("sort");
    if (error) return null;
    return data as DemoMessage[];
  },
  staleTime: 5 * 60_000,
  retry: false,
});

/** Un message récent d'un salon, ou un exemple, prêt à s'afficher en bulle. */
export type RecentMessage = {
  id: string;
  /** Message d'exemple pour le lancement, tant que les salons sont calmes. */
  demo?: boolean;
  kind: "crossing" | "port";
  /** Salon : la traversée ou le port. Vide pour un exemple. */
  room: string;
  body: string;
  created_at: string;
  label: string | null;
  author: { pseudo: string; avatar?: string | null; official?: boolean };
  /** Exemples : le port ou la ligne d'où sort la bulle. */
  portId?: string | null;
  routeId?: string | null;
};

/** Les derniers messages publics des salons (2 h). */
export const recentChatQuery = queryOptions({
  queryKey: ["bw-chat", "recent"],
  queryFn: async (): Promise<RecentMessage[]> => {
    const { data, error } = await supabase.rpc("bw_chat_recent", { p_limit: 8 });
    if (error) return [];
    return (data as RecentMessage[]) ?? [];
  },
  refetchInterval: 30_000,
  retry: false,
});

/** Exemples intégrés, si la liste de l'admin n'est pas disponible. */
export const BUILT_IN_DEMOS: Omit<DemoMessage, "id" | "sort" | "active">[] = [
  { pseudo: "Nadia", avatar: "maman", label: "Marseille → Alger", body: "On est déjà dans la file, ça avance doucement mais ça avance !" },
  { pseudo: "Karim", avatar: "papa", label: "Alicante → Oran", body: "Quelqu'un sait si le restaurant à bord est ouvert ce soir ?" },
  { pseudo: "Samia", avatar: "fille_bled", label: "Port de Sète", body: "Parking plein côté gare maritime, prévoyez de l'avance." },
  { pseudo: "Yacine", avatar: "jeune_degrade", label: "Valence → Alger", body: "Mer calme pour l'instant, les enfants dorment enfin 😄" },
  { pseudo: "Lina", avatar: "tata_houria", label: "Barcelone → Oran", body: "Contrôles rapides ce matin, 20 minutes à peine." },
];

/** Au lancement, des exemples complètent les vrais messages ; les vrais passent toujours devant. */
export function bubbleMessages(real: RecentMessage[], demos: DemoMessage[] | null | undefined) {
  if (real.length >= 3) return real;
  const list = demos ? demos.filter((demo) => demo.active) : BUILT_IN_DEMOS;
  return [
    ...real,
    ...list.map(
      (demo, index): RecentMessage => ({
        id: `demo-${index}`,
        demo: true,
        kind: "crossing",
        room: "",
        body: demo.body,
        created_at: "",
        label: demo.label,
        author: { pseudo: demo.pseudo, avatar: demo.avatar },
        portId: demo.port_id ?? null,
        routeId: demo.route_id ?? null,
      }),
    ),
  ];
}

/** Le début du message, sans couper un émoji en deux. */
export const shortBody = (text: string, max = 70) => {
  const chars = Array.from(text.replace(/:[a-z0-9_]+:/g, "").trim());
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
};

/** Le bouton Salons propose de partager ; la carte demande l'ouverture du choix d'une traversée. */
export const CHAT_INVITE_EVENT = "bledway:chat-invite";
export const OPEN_ROOM_PICKER_EVENT = "bledway:open-room-picker";
