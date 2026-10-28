import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  authorsQuery,
  communityKey,
  react,
  reactionsQuery,
  type ContributionKind,
  type ReactionCounts,
  type TravellerCard,
} from "@/lib/community/travellers";
import { TravellerAvatar } from "./TravellerAvatar";

/** Auteurs et réactions d'une liste de contributions, chargés en une fois pour toute la liste. */
export function useContributions(kind: ContributionKind, ids: string[]) {
  const { user } = useAuth();
  const authors = useQuery(authorsQuery(kind, ids)).data ?? null;
  const counts = useQuery(reactionsQuery(kind, ids, user?.id)).data ?? null;
  return { authors, counts };
}

/** « Par Lina 4821 » avec son cabas : un toucher ouvre son profil. */
export function ContributionAuthor({
  card,
  prefix = "Par",
}: {
  card?: TravellerCard | undefined;
  prefix?: string;
}) {
  if (!card) return null;
  return (
    <span className="bw-contrib-author">
      <TravellerAvatar card={card} size={22} />
      <span>
        {prefix} <strong>{card.pseudo}</strong>
      </span>
    </span>
  );
}

/** Un seul ♥ : « merci pour l'info ». Un toucher pour remercier, un second pour retirer. */
export function LikeButton({
  kind,
  id,
  counts,
  own = false,
}: {
  kind: ContributionKind;
  id: string;
  counts: ReactionCounts | null;
  /** Sa propre contribution : on voit le compteur, sans pouvoir se remercier soi-même. */
  own?: boolean;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const value = counts?.[id]?.merci;
  const toggle = useMutation({
    mutationFn: () => react(kind, id, "merci"),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...communityKey, "reactions"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (counts === null) return null;
  const n = value?.n ?? 0;
  return (
    <button
      type="button"
      className="bw-like"
      aria-pressed={Boolean(value?.mine)}
      disabled={toggle.isPending || own}
      aria-label={`${value?.mine ? "Retirer mon merci" : "Merci pour l’info"}${n ? ` (${n})` : ""}`}
      title={own ? "Mercis reçus" : "Merci pour l’info"}
      onClick={() => {
        if (!user) {
          toast.info("Connectez-vous pour remercier.");
          return;
        }
        toggle.mutate();
      }}
    >
      <Heart size={16} aria-hidden fill={value?.mine ? "currentColor" : "none"} />
      {n ? <b>{n}</b> : null}
    </button>
  );
}
