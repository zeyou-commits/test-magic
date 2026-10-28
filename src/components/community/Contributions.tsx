import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  authorsQuery,
  communityKey,
  react,
  reactionImage,
  reactions,
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

/** Merci, courage, bon voyage, bien vu : un toucher pour réagir, un second pour retirer. */
export function ReactionBar({
  kind,
  id,
  counts,
}: {
  kind: ContributionKind;
  id: string;
  counts: ReactionCounts | null;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const mine = counts?.[id] ?? {};
  const toggle = useMutation({
    mutationFn: (code: (typeof reactions)[number]["code"]) => react(kind, id, code),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...communityKey, "reactions"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (counts === null) return null;
  return (
    <div className="bw-reactions" aria-label="Réactions">
      {reactions.map((reaction) => {
        const value = mine[reaction.code];
        return (
          <button
            key={reaction.code}
            type="button"
            aria-pressed={Boolean(value?.mine)}
            disabled={toggle.isPending}
            title={reaction.label}
            onClick={() => {
              if (!user) {
                toast.info("Connectez-vous pour réagir.");
                return;
              }
              toggle.mutate(reaction.code);
            }}
          >
            <img src={reactionImage(reaction.code)} alt="" width={20} height={20} loading="lazy" />
            <span className="sr-only">{reaction.label}</span>
            {value?.n ? <b>{value.n}</b> : null}
          </button>
        );
      })}
    </div>
  );
}
