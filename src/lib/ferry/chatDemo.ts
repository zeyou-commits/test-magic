// Messages d'exemple de l'aperçu des salons, gérés par l'équipe dans l'admin.
import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { tr } from "@/lib/i18n/translate";

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
    const { data, error } = await supabase.from("bw_chat_demo_messages").select("*").order("sort");
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
  /** Message « sur la route » : le point de la route d'où sort la bulle [lng, lat]. */
  at?: [number, number];
  road?: boolean;
};

/** Exemples « sur la route » : la bulle sort de l'autoroute, une petite voiture marque l'endroit. */
export const ROAD_DEMOS: { pseudo: string; avatar: string; label: string; body: string; at: [number, number] }[] = [
  {
    get pseudo() { return tr("ui.libFerryChatDemo.mehdi"); },
    avatar: "papa",
    get label() { return tr("ui.libFerryChatDemo.surLA7VersMarseille"); },
    get body() { return tr("ui.libFerryChatDemo.onEstSurLaRoute"); },
    at: [4.86, 44.6],
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.sofia"); },
    avatar: "fille_bled",
    get label() { return tr("ui.libFerryChatDemo.lePerthusVersBarcelone"); },
    get body() { return tr("ui.libFerryChatDemo.frontierePasseePauseCafeEt"); },
    at: [2.86, 42.46],
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.amine"); },
    avatar: "jeune_degrade",
    get label() { return tr("ui.libFerryChatDemo.surLA7Vers"); },
    get body() { return tr("ui.libFerryChatDemo.plusQuUneHeureJusqu"); },
    at: [-0.95, 38.92],
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.houria"); },
    avatar: "tata_houria",
    get label() { return tr("ui.libFerryChatDemo.apresOranVersLeBled"); },
    get body() { return tr("ui.libFerryChatDemo.bienDebarquesLaFamilleNous"); },
    at: [0.15, 35.4],
  },
];

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
  {
    get pseudo() { return tr("ui.libFerryChatDemo.nadia"); },
    avatar: "maman",
    get label() { return tr("ui.libFerryChatDemo.portDeMarseille"); },
    get body() { return tr("ui.libFerryChatDemo.onEstDejaDansLa"); },
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.karim"); },
    avatar: "papa",
    get label() { return tr("ui.libFerryChatDemo.alicanteOran"); },
    get body() { return tr("ui.libFerryChatDemo.quelquUnSaitSiLe"); },
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.samia"); },
    avatar: "fille_bled",
    get label() { return tr("ui.libFerryChatDemo.portDeSete"); },
    get body() { return tr("ui.libFerryChatDemo.parkingPleinCoteGareMaritime"); },
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.yacine"); },
    avatar: "jeune_degrade",
    get label() { return tr("ui.libFerryChatDemo.valenceAlger"); },
    get body() { return tr("ui.libFerryChatDemo.merCalmePourLInstant"); },
  },
  {
    get pseudo() { return tr("ui.libFerryChatDemo.lina"); },
    avatar: "tata_houria",
    get label() { return tr("ui.libFerryChatDemo.portDeBarcelone"); },
    get body() { return tr("ui.libFerryChatDemo.controlesRapidesCeMatin20"); },
  },
];

/** Quand montrer les exemples : sous un seuil de vrais messages, toujours, ou jamais. */
export type DemoSetting = { mode: "auto" | "always" | "never"; threshold: number };
export const DEFAULT_DEMO_SETTING: DemoSetting = { mode: "auto", threshold: 3 };
export const chatDemoSettingKey = ["bw-chat", "demo-setting"] as const;
export const chatDemoSettingQuery = queryOptions({
  queryKey: chatDemoSettingKey,
  queryFn: async (): Promise<DemoSetting> => {
    const { data, error } = await supabase.rpc("bw_chat_demo_setting");
    if (error || !data) return DEFAULT_DEMO_SETTING;
    return { ...DEFAULT_DEMO_SETTING, ...(data as Partial<DemoSetting>) };
  },
  staleTime: 5 * 60_000,
  retry: false,
});

/** Ordre d'affichage : les vrais d'abord, puis les exemples en alternant port, bateau et route. */
function order(message: RecentMessage) {
  if (!message.demo) return -1;
  const [, kind, n] = message.id.split("-");
  return kind === "road" ? Number(n) * 3 + 2 : Number(kind) * 1.5;
}

/** Les vrais messages passent toujours devant ; les exemples complètent selon le réglage. */
export function bubbleMessages(
  real: RecentMessage[],
  demos: DemoMessage[] | null | undefined,
  setting: DemoSetting = DEFAULT_DEMO_SETTING,
) {
  if (setting.mode === "never") return real;
  if (setting.mode === "auto" && real.length >= setting.threshold) return real;
  const list = demos ? demos.filter((demo) => demo.active) : BUILT_IN_DEMOS;
  return [
    ...real,
    ...list.map((demo, index): RecentMessage => ({
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
    })),
    // Un message de la route après chaque groupe de deux exemples.
    ...ROAD_DEMOS.map((demo, index): RecentMessage => ({
      id: `demo-road-${index}`,
      demo: true,
      road: true,
      kind: "crossing",
      room: "",
      body: demo.body,
      created_at: "",
      label: demo.label,
      author: { pseudo: demo.pseudo, avatar: demo.avatar },
      at: demo.at,
    })),
  ].sort((a, b) => order(a) - order(b));
}

/** Le début du message, sans couper un émoji en deux. */
export const shortBody = (text: string, max = 70) => {
  const chars = Array.from(text.replace(/:[a-z0-9_]+:/g, "").trim());
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
};

/** Le bouton Salons propose de partager ; la carte demande l'ouverture du choix d'une traversée. */
export const CHAT_INVITE_EVENT = "bledway:chat-invite";
export const OPEN_ROOM_PICKER_EVENT = "bledway:open-room-picker";
/** Revenir au salon de ma traversée (depuis un salon lu en visiteur). */
export const OPEN_MY_ROOM_EVENT = "bledway:open-my-room";
