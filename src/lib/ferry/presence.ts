import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Statuts de voyage (script du 01/11/2026), absents des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type TripStatus = "en_route" | "port" | "onboard" | "arrived";
/** Les quatre étapes de « Ma traversée », chacune avec son cabas. */
export const tripSteps: { id: TripStatus; label: string; short: string; image: string }[] = [
  { id: "en_route", label: "En route vers le port", short: "En route", image: "/cabas/statut-en-route.webp" },
  { id: "port", label: "Au port", short: "Au port", image: "/cabas/statut-au-port.webp" },
  { id: "onboard", label: "À bord", short: "À bord", image: "/cabas/statut-a-bord.webp" },
  { id: "arrived", label: "Arrivé", short: "Arrivé", image: "/cabas/statut-arrive.webp" },
];
export const presenceKey = ["bw-trip-presence"] as const;

export type TripStep = (typeof tripSteps)[number];
/** Libellés et illustrations des étapes, modifiables dans l'admin (script du 02/11/2026). */
export const tripStepsQuery = queryOptions({
  queryKey: ["bw-trip-steps"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("bw_trip_steps")
      .select("code,label,short_label,image,sort")
      .order("sort");
    if (error) return null;
    return (data ?? []) as TripStepRow[];
  },
  retry: false,
  staleTime: 10 * 60_000,
});
/** Étapes affichées : celles de l'admin si elles existent, sinon les valeurs par défaut. */
export type TripStepRow = { code: TripStatus; label: string; short_label: string; image: string; sort: number };
export const mergeTripSteps = (rows: TripStepRow[] | null | undefined) =>
  tripSteps.map((step) => {
    const row = rows?.find((item) => item.code === step.id);
    return row ? { ...step, label: row.label, short: row.short_label, image: row.image } : step;
  });

export type PresenceRow = {
  departure_id: string;
  vessel_id: string | null;
  departure_port_id: string;
  arrival_port_id: string;
  en_route: number;
  at_port: number;
  onboard: number;
  arrived: number;
};
const missing = (code?: string) => code === "PGRST202" || code === "PGRST205" || code === "42P01";

/** Compteurs anonymes des traversées en cours ; null tant que le script n'est pas exécuté. */
export const presenceQuery = queryOptions({
  queryKey: presenceKey,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("bw_trip_presence");
    if (error) {
      if (missing(error.code)) return null;
      throw new Error("Présence indisponible.");
    }
    return (data ?? []) as PresenceRow[];
  },
  retry: false,
  staleTime: 30_000,
  refetchInterval: (query) => (query.state.data === null ? false : 60_000),
});

export const myTripStatusQuery = (departureId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: [...presenceKey, "mine", departureId, userId ?? "anonyme"],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_trip_status")
        .select("status")
        .eq("departure_id", departureId)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) return null;
      return ((data?.status as TripStatus | undefined) ?? null) as TripStatus | null;
    },
    retry: false,
  });

export async function setTripStatus(departureId: string, status: TripStatus | null) {
  const { error } = await supabase.rpc("bw_set_trip_status", {
    p_departure: departureId,
    p_status: status,
  });
  if (error) {
    if (missing(error.code)) throw new Error("Fonction pas encore activée.");
    throw new Error(
      /veille|introuvable|actif/.test(error.message)
        ? error.message
        : "Le statut n’a pas pu être enregistré. Réessayez.",
    );
  }
}

/** Avatar cabas stable pour un même identifiant (6 personnages). */
export const avatarFor = (seed: string, index: number) => {
  let hash = index * 7;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `/cabas/avatar-${(hash % 6) + 1}.webp`;
};

/** Illustrations proposées dans l'admin pour les étapes (dossier public/cabas). */
export const cabasImages = [
  "/cabas/statut-en-route.webp",
  "/cabas/statut-au-port.webp",
  "/cabas/statut-a-bord.webp",
  "/cabas/statut-arrive.webp",
  "/cabas/humeurs/01_valise_pleine.webp",
  "/cabas/humeurs/02_glaciere.webp",
  "/cabas/humeurs/03_surpoids.webp",
  "/cabas/humeurs/04_reveil_4h.webp",
  "/cabas/humeurs/05_yallah.webp",
  "/cabas/humeurs/06_galerie.webp",
  "/cabas/humeurs/07_mobylette.webp",
  "/cabas/humeurs/08_bouchon.webp",
  "/cabas/humeurs/09_pneu_creve.webp",
  "/cabas/humeurs/10_route_longue.webp",
  "/cabas/humeurs/11_file_attente.webp",
  "/cabas/humeurs/12_chemma.webp",
  "/cabas/humeurs/13_billet_perdu.webp",
  "/cabas/humeurs/14_controle.webp",
  "/cabas/humeurs/15_retard.webp",
  "/cabas/humeurs/16_annule.webp",
  "/cabas/humeurs/17_embarquement.webp",
  "/cabas/humeurs/18_mal_de_mer.webp",
  "/cabas/humeurs/19_dodo_pont.webp",
  "/cabas/humeurs/20_tempete.webp",
  "/cabas/humeurs/21_selfie.webp",
  "/cabas/humeurs/22_msemen.webp",
  "/cabas/humeurs/23_pas_de_reseau.webp",
  "/cabas/humeurs/24_ambiance.webp",
  "/cabas/humeurs/25_ennui_traversee.webp",
  "/cabas/humeurs/26_la_cote.webp",
  "/cabas/humeurs/27_debarquement.webp",
  "/cabas/humeurs/28_fouille.webp",
  "/cabas/humeurs/29_douane_ok.webp",
  "/cabas/humeurs/30_chaleur.webp",
  "/cabas/humeurs/31_chaise_plastique.webp",
  "/cabas/humeurs/32_accueil.webp",
  "/cabas/humeurs/33_bien_arrive.webp",
  "/cabas/humeurs/34_ko_total.webp",
  "/cabas/humeurs/35_adieux.webp",
  "/cabas/humeurs/36_bidons_huile.webp",
  "/cabas/humeurs/37_deja_nostalgique.webp",
];
