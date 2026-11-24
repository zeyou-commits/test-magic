// Le salon général (ouvert à tout compte, avec ou sans traversée) et le fil qui défile sur la carte.
import { queryOptions } from "@tanstack/react-query";
import { tr } from "@/lib/i18n/translate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { ChatAuthor } from "@/components/panel/StaffChat";

const supabase = typedSupabase as unknown as SupabaseClient;

/** Identifiant fixe du salon général, le même que côté serveur (private.bw_chat_general_room). */
export const GENERAL_ROOM = "00000000-0000-4000-8000-000000000001";
export const GENERAL_TITLE = "Salon général";
/** Le nom du salon général dans la langue affichée. */
export const generalTitle = () => tr("ui.libFerryGeneralRoom.salonGeneral");

/** Ouvrir le salon général depuis n'importe où (liste des salons, fil de la carte, lien). */
export const OPEN_GENERAL_ROOM_EVENT = "bledway:open-general-room";
export function openGeneralRoom() {
  window.dispatchEvent(new Event(OPEN_GENERAL_ROOM_EVENT));
}

// Lien partagé ?room=general : lu au chargement de la page.
let generalFocus =
  typeof window !== "undefined" && /[?&]room=general\b/.test(window.location.search);
export function takeGeneralFocus() {
  const wanted = generalFocus;
  generalFocus = false;
  return wanted;
}

/** Une ligne du fil de la carte : un vrai message récent, jamais un exemple. */
export type TickerLine = {
  id: string;
  kind: "general" | "crossing";
  room: string;
  place: string;
  body: string;
  created_at: string;
  author: ChatAuthor;
  /** « Salon général » ou « Port → Port ». */
  label: string;
};

const missing = (code?: string) => code === "PGRST202" || code === "42883";

/** Les derniers messages publics (salon général : 7 jours ; traversées : 6 h), sans les comptes de moins de 7 jours ni les signalés. */
export const tickerQuery = queryOptions({
  queryKey: ["bw-chat", "ticker"],
  queryFn: async (): Promise<TickerLine[] | null> => {
    const { data, error } = await supabase.rpc("bw_chat_ticker", { p_limit: 12 });
    if (error) {
      if (missing(error.code)) return null;
      throw new Error("Fil indisponible.");
    }
    return (data as TickerLine[] | null) ?? [];
  },
  retry: false,
  refetchInterval: 20_000,
  staleTime: 15_000,
});

// Le fil sur la carte : activé par défaut, coupé ou rétabli d'un toucher, retenu sur l'appareil.
const OVERLAY_KEY = "bledway:chat-overlay";
export function readOverlayOn() {
  try {
    return window.localStorage.getItem(OVERLAY_KEY) !== "off";
  } catch {
    return true;
  }
}
export function saveOverlayOn(on: boolean) {
  try {
    window.localStorage.setItem(OVERLAY_KEY, on ? "on" : "off");
  } catch {
    /* le choix dure le temps de la page */
  }
}

/**
 * La file du fil : chaque nouveau message attend son tour (un toutes les 5 s), reste 12 s,
 * 3 au plus à l'écran. Quand la file est vide, le fil repart sur les derniers messages reçus :
 * il tourne en boucle tant que la carte est ouverte. Pure, pour être testée sans écran.
 */
export type TickerState = {
  seen: string[];
  queue: TickerLine[];
  shown: { line: TickerLine; until: number }[];
  /** Les derniers messages reçus, du plus ancien au plus récent : la boucle repasse dessus. */
  pool: TickerLine[];
};
export const TICKER_STEP_MS = 5_000;
export const TICKER_LIFE_MS = 12_000;
export const TICKER_MAX = 3;
export const emptyTicker: TickerState = { seen: [], queue: [], shown: [], pool: [] };

/** Les messages reçus (du plus récent au plus ancien) entrent dans la file, du plus ancien au plus récent. */
export function enqueueTicker(state: TickerState, lines: TickerLine[], first: boolean): TickerState {
  const pool = [...lines].reverse();
  const seen = new Set(state.seen);
  const fresh = lines.filter((line) => !seen.has(line.id));
  if (!fresh.length) return { ...state, pool };
  // Premier chargement : d'abord les 3 derniers ; la boucle passera ensuite sur les autres.
  const take = first ? fresh.slice(0, TICKER_MAX) : fresh;
  return {
    seen: [...state.seen, ...fresh.map((line) => line.id)].slice(-200),
    queue: [...state.queue, ...[...take].reverse()].slice(-12),
    shown: state.shown,
    pool,
  };
}

/** Un pas de temps : les messages expirés partent, puis le suivant de la file (ou de la boucle) entre. */
export function stepTicker(state: TickerState, now: number, max = TICKER_MAX): TickerState {
  // Petite marge : le minuteur peut tomber quelques millisecondes avant l'échéance.
  const shown = state.shown.filter((item) => item.until > now + 250);
  let queue = state.queue;
  if (!queue.length) {
    // File vide : on repart sur les derniers messages, sans répéter ceux encore à l'écran.
    const onScreen = new Set(shown.map((item) => item.line.id));
    queue = state.pool.filter((line) => !onScreen.has(line.id));
  }
  const [next, ...rest] = queue;
  if (!next) return shown.length === state.shown.length ? state : { ...state, shown };
  return {
    ...state,
    queue: rest,
    shown: [...shown, { line: next, until: now + TICKER_LIFE_MS }].slice(-max),
  };
}
