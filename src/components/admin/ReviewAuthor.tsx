import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { openTravellerProfile, type TravellerCard } from "@/lib/community/travellers";

// Fonction du script « avis_profil_auteur », pas encore dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type ReviewKind = "port_review" | "vessel_review" | "entity_review" | "alert";
type AuthorInfo = {
  card: TravellerCard;
  joined_at: string | null;
  reviews: number;
  hidden: number;
  /** Signalements déjà faits (script du 07/01/2027). */
  alerts?: number;
};
/** Où en est la recherche des auteurs : pour dire « indisponible » plutôt que ne rien afficher. */
export type AuthorLookup = "loading" | "failed" | "done";

/** Les auteurs des avis à relire (équipe seulement) ; vide tant que le script n'est pas passé. */
export function useReviewAuthors(kind: ReviewKind, ids: string[]) {
  return useReviewAuthorsQuery(kind, ids).data;
}

/** Les mêmes auteurs, avec l'état de la recherche. */
export function useReviewAuthorsQuery(kind: ReviewKind, ids: string[]) {
  const query = useQuery({
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
  });
  const lookup: AuthorLookup = query.isError ? "failed" : query.data ? "done" : "loading";
  return { data: query.data, lookup };
}

/** « Qui a noté » : avatar, pseudo, ancienneté et avis déjà donnés, pour juger d'un coup d'œil. */
export function ReviewAuthor({
  info,
  lookup,
}: {
  info: AuthorInfo | undefined;
  /** Sans cet état, rien ne s'affiche tant que l'auteur n'est pas connu (comportement d'origine). */
  lookup?: AuthorLookup | undefined;
}) {
  if (!info) {
    if (!lookup || lookup === "loading") return null;
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {lookup === "failed"
          ? "Auteur indisponible pour le moment (droits de modération ou script de base à passer)."
          : "Auteur : compte supprimé ou contribution sans compte."}
      </p>
    );
  }
  const since = info.joined_at
    ? new Date(info.joined_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <TravellerAvatar card={info.card} size={28} static />
      <span>
        Par{" "}
        <button
          type="button"
          className="font-semibold text-foreground underline-offset-2 hover:underline"
          onClick={() => openTravellerProfile(info.card.handle)}
        >
          {info.card.pseudo}
        </button>{" "}
        {since ? ` · membre depuis ${since}` : ""} · {info.reviews} avis
        {info.alerts !== undefined
          ? ` · ${info.alerts} signalement${info.alerts > 1 ? "s" : ""}`
          : ""}
        {info.hidden ? (
          <b className="text-red-700">
            {" "}
            dont {info.hidden} masqué{info.hidden > 1 ? "s" : ""}
          </b>
        ) : null}
      </span>
    </div>
  );
}
