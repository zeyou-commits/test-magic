import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ratingCriteriaQuery } from "@/lib/ferry/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Critère « Note globale » (script du 01/11/2026), masqué de la liste des critères détaillés.
 * Sans lui, la note globale est reportée sur les critères non détaillés.
 */
export const globalCriterionQuery = queryOptions({
  queryKey: ["rating_criteria", "global"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("rating_criteria")
      .select("id")
      .eq("slug", "global")
      .maybeSingle();
    if (error) return null;
    return (data?.id as string | undefined) ?? null;
  },
  staleTime: 30 * 60 * 1000,
});

function StarPicker({
  name,
  value,
  onChange,
  size,
  disabled,
}: {
  name: string;
  value: number;
  onChange: (score: number) => void;
  size: number;
  disabled?: boolean;
}) {
  return (
    <div className="port-rating-stars" role="radiogroup">
      {[1, 2, 3, 4, 5].map((score) => (
        <label key={score} title={`${score} sur 5`}>
          <input
            type="radio"
            name={name}
            value={score}
            checked={value === score}
            disabled={disabled}
            onChange={() => onChange(score)}
          />
          <Star size={size} aria-hidden className={score <= value ? "is-rated" : ""} />
          <span className="sr-only">{score} sur 5</span>
        </label>
      ))}
    </div>
  );
}

const verdict = ["", "Très décevant", "Décevant", "Correct", "Bien", "Excellent"];

/** Avis sur un port : une note sur 5 étoiles, un conseil facultatif, le détail par critère en option. */
export function PortReviewForm({ portId, onDone }: { portId: string; onDone?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const criteria = useQuery(ratingCriteriaQuery);
  const globalId = useQuery(globalCriterionQuery).data ?? null;
  const [overall, setOverall] = useState(0);
  const [comment, setComment] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connexion requise");
      const { data, error } = await supabase
        .from("port_reviews")
        .insert({ port_id: portId, user_id: user.id, comment: comment.trim() || null })
        .select("id")
        .single();
      if (error)
        throw new Error("L’envoi de votre avis a échoué. Réessayez dans quelques instants.");
      const detailed = Object.entries(scores);
      const ratings = globalId
        ? [[globalId, overall] as const, ...detailed]
        : // Sans critère « global » en base : la note globale vaut pour les critères non détaillés.
          (criteria.data ?? []).map(
            (criterion) => [criterion.id, scores[criterion.id] ?? overall] as const,
          );
      const rows = ratings.map(([criterion_id, score]) => ({
        review_id: data.id as string,
        criterion_id,
        score,
      }));
      if (rows.length) {
        const { error: ratingError } = await supabase.from("review_ratings").insert(rows);
        if (ratingError)
          throw new Error(
            "Votre commentaire est enregistré, mais la note n’a pas pu l’être. Merci de réessayer plus tard.",
          );
      }
    },
    onSuccess: () => {
      setComment("");
      setScores({});
      setOverall(0);
      setSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ["port_reviews", portId] });
      toast.success("Merci ! Votre avis sera publié après vérification.");
    },
  });

  if (!user)
    return (
      <div className="port-contribute">
        <MessageSquare size={22} aria-hidden />
        <p>Connectez-vous pour noter ce port. Les avis sont relus avant publication.</p>
        <Button asChild size="sm">
          <Link to="/auth">Se connecter</Link>
        </Button>
      </div>
    );

  if (submitted)
    return (
      <div className="port-contribute" role="status">
        <CheckCircle2 size={24} aria-hidden />
        <p>Merci ! Votre avis sera visible après vérification par l’équipe.</p>
        {onDone ? (
          <Button size="sm" variant="outline" onClick={onDone}>
            Fermer
          </Button>
        ) : null}
      </div>
    );

  return (
    <form
      className="port-review-form pv-review-form"
      aria-label="Noter ce port"
      aria-busy={submit.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (overall) submit.mutate();
      }}
    >
      <fieldset className="port-rating-field" disabled={submit.isPending}>
        <legend>Votre note</legend>
        <div className="flex items-center gap-3">
          <StarPicker name={`overall-${portId}`} value={overall} onChange={setOverall} size={30} />
          <span className="text-sm font-semibold text-muted-foreground">{verdict[overall]}</span>
        </div>
      </fieldset>
      <label className="port-comment-label" htmlFor={`comment-${portId}`}>
        Un conseil pour les prochains voyageurs ? <span>Facultatif</span>
      </label>
      <Textarea
        id={`comment-${portId}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="L’accès au terminal, l’attente, un service utile…"
        rows={3}
        maxLength={2000}
        disabled={submit.isPending}
      />
      {criteria.data?.length ? (
        <details className="port-practical-details">
          <summary>
            Détailler par critère <span>facultatif</span> <ChevronRight size={16} aria-hidden />
          </summary>
          <div className="grid gap-2 pt-2">
            {criteria.data.map((criterion) => (
              <div key={criterion.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{criterion.label}</span>
                <StarPicker
                  name={`rating-${portId}-${criterion.id}`}
                  value={scores[criterion.id] ?? 0}
                  onChange={(score) => setScores((previous) => ({ ...previous, [criterion.id]: score }))}
                  size={18}
                  disabled={submit.isPending}
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {submit.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {submit.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" disabled={submit.isPending || !overall}>
          {submit.isPending ? "Envoi…" : "Publier mon avis"}
        </Button>
      </div>
    </form>
  );
}
