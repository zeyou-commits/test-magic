import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ratingCriteriaQuery } from "@/lib/ferry/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PortReviewForm({ portId }: { portId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const criteria = useQuery(ratingCriteriaQuery);
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
      const ratings = Object.entries(scores).map(([criterion_id, score]) => ({
        review_id: data.id as string,
        criterion_id,
        score,
      }));
      if (ratings.length) {
        const { error: ratingError } = await supabase.from("review_ratings").insert(ratings);
        if (ratingError)
          throw new Error(
            "Votre commentaire est enregistré, mais certaines notes n’ont pas pu l’être. Merci de réessayer plus tard.",
          );
      }
    },
    onSuccess: () => {
      setComment("");
      setScores({});
      setSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ["port_reviews", portId] });
      toast.success("Merci ! Votre avis sera publié après vérification.");
    },
  });

  if (!user)
    return (
      <div className="port-contribute">
        <MessageSquare size={24} aria-hidden />
        <h3>Votre expérience compte.</h3>
        <p>Embarquement, attente, services : vos conseils aident les prochains voyageurs.</p>
        <Button asChild>
          <Link to="/auth">Se connecter pour donner un avis</Link>
        </Button>
        <small>Les avis sont relus avant publication.</small>
      </div>
    );

  if (submitted)
    return (
      <div className="port-contribute" role="status">
        <CheckCircle2 size={28} aria-hidden />
        <h3>Merci d’avoir partagé votre expérience.</h3>
        <p>Votre avis sera visible après vérification par l’équipe.</p>
      </div>
    );

  return (
    <form
      className="port-review-form"
      aria-label="Donner mon avis sur ce port"
      aria-busy={submit.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(scores).length) submit.mutate();
      }}
    >
      <div>
        <h3>Comment s’est passé votre passage ?</h3>
        <p>Notez les aspects que vous avez pu observer.</p>
      </div>
      {criteria.isPending ? (
        <p role="status">Chargement des critères…</p>
      ) : criteria.isError ? (
        <p role="alert">
          Les critères sont indisponibles.{" "}
          <button type="button" onClick={() => void criteria.refetch()} className="underline">
            Réessayer
          </button>
        </p>
      ) : (
        (criteria.data ?? []).map((criterion) => (
          <fieldset key={criterion.id} className="port-rating-field" disabled={submit.isPending}>
            <legend>{criterion.label}</legend>
            <div className="port-rating-stars">
              {[1, 2, 3, 4, 5].map((score) => (
                <label key={score} title={`${score} sur 5`}>
                  <input
                    type="radio"
                    name={`rating-${portId}-${criterion.id}`}
                    value={score}
                    checked={scores[criterion.id] === score}
                    onChange={() =>
                      setScores((previous) => ({ ...previous, [criterion.id]: score }))
                    }
                  />
                  <Star
                    size={22}
                    aria-hidden
                    className={score <= (scores[criterion.id] ?? 0) ? "is-rated" : ""}
                  />
                  <span className="sr-only">{score} sur 5</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))
      )}
      <label className="port-comment-label" htmlFor={`comment-${portId}`}>
        Un conseil pour les prochains voyageurs ? <span>Facultatif</span>
      </label>
      <Textarea
        id={`comment-${portId}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="L’accès au terminal, l’attente, un service utile…"
        rows={4}
        maxLength={2000}
        disabled={submit.isPending}
      />
      {submit.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {submit.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={submit.isPending || !Object.keys(scores).length}>
        {submit.isPending ? "Envoi en cours…" : "Envoyer mon avis"}
      </Button>
      <small>Choisissez au moins une note. Votre avis sera relu avant publication.</small>
    </form>
  );
}
