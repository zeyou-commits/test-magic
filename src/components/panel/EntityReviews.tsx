import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  reviewNumber,
  reviewCriteria,
  reviewScore,
  type ReviewKind,
  type ReviewScores,
} from "@/lib/ferry/reviewCriteria";
import {
  entityReviewsKey,
  entityReviewsQuery,
  ownEntityReviewsQuery,
  reviewsDb,
} from "@/lib/ferry/entityReviews";

export function EntityReviews({
  kind,
  target,
  openForm = false,
  onFormClosed,
}: {
  kind: ReviewKind;
  target: string;
  openForm?: boolean;
  onFormClosed?: (() => void) | undefined;
}) {
  const { user } = useAuth();
  const feed = useQuery(entityReviewsQuery(kind, target));
  const mine = useQuery(ownEntityReviewsQuery(user?.id));
  const own = mine.data?.find((r) => r.target_kind === kind && r.target_id === target);
  const [write, setWrite] = useState(false);
  const draftKey = `bledway:rating:${kind}:${target}`;
  useEffect(() => {
    if (openForm) setWrite(true);
  }, [openForm]);
  useEffect(() => {
    if (user && window.sessionStorage.getItem(draftKey)) setWrite(true);
  }, [user, draftKey]);
  return (
    <section className="bw-entity-reviews" aria-label="Avis des voyageurs">
      <div className="bw-entity-reviews__summary">
        <Star size={22} aria-hidden />
        <strong>{feed.data?.average != null ? `${reviewNumber(feed.data.average)}/5` : "—"}</strong>
        <span>
          {feed.isPending
            ? "Lecture des avis…"
            : feed.data?.count
              ? `${feed.data.count} avis`
              : "Pas encore de note"}
        </span>
        <Button size="sm" variant="outline" onClick={() => setWrite(!write)} aria-expanded={write}>
          {own ? "Modifier ma note" : "Noter"}
        </Button>
      </div>
      {feed.isError ? (
        <p role="alert">
          Les notes sont indisponibles.{" "}
          <button type="button" className="underline" onClick={() => void feed.refetch()}>
            Réessayer
          </button>
        </p>
      ) : null}
      {own?.status === "pending" ? (
        <p className="bw-rating-notice" role="status">
          Votre évaluation attend sa vérification.
          {own.published_scores ? " Votre précédente note reste publiée." : ""}
        </p>
      ) : own?.status === "hidden" ? (
        <p className="bw-rating-notice">
          Votre évaluation n’est pas publiée. Vous pouvez la modifier.
        </p>
      ) : null}
      {write ? (
        user && mine.isPending ? (
          <p role="status">Chargement de votre évaluation…</p>
        ) : user && mine.isError ? (
          <p role="alert">
            Votre note n’a pas pu être chargée.{" "}
            <button type="button" onClick={() => void mine.refetch()}>
              Réessayer
            </button>
          </p>
        ) : (
          <RatingForm
            key={`${kind}:${target}:${own?.updated_at}`}
            kind={kind}
            target={target}
            initial={own?.scores}
            draftKey={draftKey}
            onDone={() => {
              setWrite(false);
              onFormClosed?.();
            }}
          />
        )
      ) : null}
      {feed.data?.criteria && Object.keys(feed.data.criteria).length ? (
        <details className="bw-rating-detail">
          <summary>Les 5 critères</summary>
          <dl>
            {reviewCriteria[kind].map((c) => {
              const score = feed.data.criteria[c.code];
              return (
                <div key={c.code}>
                  <dt>{c.label}</dt>
                  <dd>
                    {score
                      ? `${reviewNumber(score.average)}/5 · ${score.count} avis`
                      : "Pas encore noté"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </details>
      ) : null}
      {feed.data?.reviews.length ? (
        <ul className="bw-rating-list">
          {feed.data.reviews.map((r) => (
            <li key={r.id}>
              <div>
                {r.author ? <TravellerAvatar card={r.author} size={28} /> : null}
                <strong>
                  {r.author?.pseudo ?? "Voyageur BledWay"} · {reviewNumber(r.score)}/5
                </strong>
                <time dateTime={r.date}>{new Date(r.date).toLocaleDateString("fr-FR")}</time>
              </div>
              <details>
                <summary>Voir ses critères</summary>
                <dl>
                  {reviewCriteria[kind].map((c) => (
                    <div key={c.code}>
                      <dt>{c.label}</dt>
                      <dd>{r.scores[c.code] ? `${r.scores[c.code]}/5` : "Non utilisé"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
      {feed.data && feed.data.count > feed.data.reviews.length ? (
        <p className="bw-rating-notice">
          Les 30 dernières évaluations détaillées sont affichées. La moyenne inclut aussi les
          anciennes notes globales.
        </p>
      ) : null}
    </section>
  );
}

function RatingForm({
  kind,
  target,
  initial,
  draftKey,
  onDone,
}: {
  kind: ReviewKind;
  target: string;
  initial?: ReviewScores | undefined;
  draftKey: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const formId = useId();
  const [scores, setScores] = useState<ReviewScores>(() => {
    if (typeof window !== "undefined")
      try {
        const draft = JSON.parse(
          window.sessionStorage.getItem(draftKey) ?? "null",
        ) as ReviewScores | null;
        if (draft && typeof draft === "object") return draft;
      } catch {
        /* Une ancienne saisie invalide est ignorée. */
      }
    return initial ?? {};
  });
  const score = reviewScore(kind, scores);
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await reviewsDb.rpc("bw_submit_entity_review", {
        p_kind: kind,
        p_target: target,
        p_scores: scores,
      });
      if (error)
        throw new Error(
          /Patientez|trois critères|Compte|compte actif|Connectez-vous/.test(error.message)
            ? error.message
            : "Votre note n’a pas été enregistrée. Réessayez dans un instant.",
        );
    },
    onSuccess: () => {
      window.sessionStorage.removeItem(draftKey);
      toast.success("Votre note a été envoyée pour vérification.");
      onDone();
      void client.invalidateQueries({ queryKey: entityReviewsKey });
      void client.invalidateQueries({ queryKey: ["admin", "counts"] });
    },
  });
  const change = (code: string, value: number | null) => {
    const next = { ...scores, [code]: value };
    setScores(next);
    window.sessionStorage.setItem(draftKey, JSON.stringify(next));
  };
  return (
    <form
      className="bw-rating-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (user && score !== null) submit.mutate();
      }}
    >
      <p>
        Notez ce que vous avez vécu : au moins 3 critères. Choisissez « Non utilisé » pour le reste.
      </p>
      {reviewCriteria[kind].map((c) => (
        <fieldset key={c.code} disabled={submit.isPending}>
          <legend>{c.label}</legend>
          <div className="bw-rating-choices">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} title={`${n}/5`}>
                <input
                  type="radio"
                  name={`${formId}-${c.code}`}
                  value={n}
                  checked={scores[c.code] === n}
                  onChange={() => change(c.code, n)}
                />
                <Star
                  size={23}
                  aria-hidden
                  fill={n <= (scores[c.code] ?? 0) ? "currentColor" : "none"}
                />
                <span className="sr-only">{n} sur 5</span>
              </label>
            ))}
            <label className="bw-rating-na">
              <input
                type="radio"
                name={`${formId}-${c.code}`}
                value="na"
                checked={scores[c.code] === null}
                onChange={() => change(c.code, null)}
              />
              <span>Non utilisé</span>
            </label>
          </div>
        </fieldset>
      ))}
      {submit.isError ? <p role="alert">{submit.error.message}</p> : null}
      {!user ? (
        <a
          className="bw-rating-login"
          href={`/auth?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`}
          onClick={() => window.sessionStorage.setItem(draftKey, JSON.stringify(scores))}
        >
          Me connecter pour envoyer ma note
        </a>
      ) : (
        <Button type="submit" disabled={score === null || submit.isPending}>
          {submit.isPending
            ? "Envoi…"
            : score !== null
              ? `Envoyer ma note · ${reviewNumber(score)}/5`
              : "Notez au moins 3 critères"}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onDone}>
        Annuler
      </Button>
    </form>
  );
}
