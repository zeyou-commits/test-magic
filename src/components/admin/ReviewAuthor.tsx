import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { openTravellerProfile, type TravellerCard } from "@/lib/community/travellers";

// Fonction du script « avis_profil_auteur », pas encore dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type ReviewKind = "port_review" | "vessel_review" | "entity_review";
type AuthorInfo = { card: TravellerCard; joined_at: string; reviews: number; hidden: number };

/** Les auteurs des avis à relire (équipe seulement) ; vide tant que le script n'est pas passé. */
export function useReviewAuthors(kind: ReviewKind, ids: string[]) {
  return useQuery({
    queryKey: ["admin", "review-authors", kind, [...ids].sort().join(",")],
    enabled: ids.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_review_authors_staff", {
        p_kind: kind,
        p_ids: ids.slice(0, 200),
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as Record<string, AuthorInfo>;
    },
  }).data;
}

/** « Qui a noté » : avatar, pseudo, ancienneté et avis déjà donnés, pour juger d'un coup d'œil. */
export function ReviewAuthor({ info }: { info: AuthorInfo | undefined }) {
  if (!info) return null;
  const since = new Date(info.joined_at).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <TravellerAvatar card={info.card} size={28} static />
      <span>
        <button
          type="button"
          className="font-semibold text-foreground underline-offset-2 hover:underline"
          onClick={() => openTravellerProfile(info.card.handle)}
        >
          {info.card.pseudo}
        </button>{" "}
        · membre depuis {since} · {info.reviews} avis
        {info.hidden ? <b className="text-red-700"> dont {info.hidden} masqué{info.hidden > 1 ? "s" : ""}</b> : null}
      </span>
    </div>
  );
}
