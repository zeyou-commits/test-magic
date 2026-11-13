import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { RateStars } from "./RateStars";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  presetRating,
  ratingDraftKey,
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
import { PhotoPicker, PhotoStrip } from "@/components/photos/Photos";
import { photosKey, photosQuery, submitPhoto, type PreparedPhoto } from "@/lib/photos/photos";
import { tr } from "@/lib/i18n";

/**
 * Fait défiler le volet (fiche de la carte) jusqu'à l'élément, sans faire bouger la page autour :
 * scrollIntoView ferait aussi descendre la page d'accueil sous la carte.
 */
function revealInPanel(element: HTMLElement) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let box = element.parentElement;
  while (box && box !== document.body) {
    const style = getComputedStyle(box);
    if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight + 4) {
      const top = element.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTo({ top: box.scrollTop + top - 12, behavior: smooth ? "smooth" : "auto" });
      return;
    }
    box = box.parentElement;
  }
  element.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
}

/** Photos d'avis : navires et ports seulement (pas les compagnies). */
const photoKind = (kind: ReviewKind) =>
  kind === "vessel" ? "vessel_review" : kind === "port" ? "port_review" : null;

export function EntityReviews({
  kind,
  target,
  openForm = false,
  onFormClosed,
  nonce = 0,
}: {
  kind: ReviewKind;
  target: string;
  openForm?: boolean;
  onFormClosed?: (() => void) | undefined;
  /** Change à chaque clic sur une étoile hors de ce bloc : le formulaire relit le brouillon. */
  nonce?: number;
}) {
  const { user } = useAuth();
  const feed = useQuery(entityReviewsQuery(kind, target));
  const mine = useQuery(ownEntityReviewsQuery(user?.id));
  const own = mine.data?.find((r) => r.target_kind === kind && r.target_id === target);
  const [write, setWrite] = useState(false);
  const [localNonce, setLocalNonce] = useState(0);
  const draftKey = ratingDraftKey(kind, target);
  const reviewPhotos = useQuery(
    photosQuery(
      photoKind(kind) ?? "port_review",
      photoKind(kind) ? (feed.data?.reviews ?? []).map((r) => r.id) : [],
    ),
  ).data;
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openForm) setWrite(true);
  }, [openForm]);
  // Étoile cliquée en haut de la fiche : le formulaire s'ouvre plus bas, on y descend.
  useEffect(() => {
    if (!openForm) return;
    const timer = window.setTimeout(() => {
      if (formRef.current) revealInPanel(formRef.current);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [openForm, nonce]);
  useEffect(() => {
    // Une note commencée (étoile cliquée, ou avant connexion) rouvre le formulaire.
    if (window.sessionStorage.getItem(draftKey)) setWrite(true);
  }, [user, draftKey]);
  return (
    <section className="bw-entity-reviews" aria-label={tr("ui.entityReviews.avisDesVoyageurs")}>
      <div className="bw-entity-reviews__summary">
        {feed.isPending ? (
          <span>{tr("ui.entityReviews.lectureDesAvis")}</span>
        ) : (
          <RateStars
            average={feed.data?.average}
            count={feed.data?.count ?? 0}
            subject={
              kind === "vessel" ? "ce navire" : kind === "port" ? "ce port" : "cette compagnie"
            }
            size={22}
            onRate={(score) => {
              presetRating(kind, target, score);
              setLocalNonce((n) => n + 1);
              setWrite(true);
            }}
          />
        )}
      </div>
      {feed.isError ? (
        <p role="alert">
          {tr("ui.entityReviews.lesNotesSontIndisponibles")}{" "}
          <button type="button" className="underline" onClick={() => void feed.refetch()}>
            {tr("ui.entityReviews.reessayer")}
          </button>
        </p>
      ) : null}
      {own?.status === "pending" ? (
        <p className="bw-rating-notice" role="status">
          {tr("ui.entityReviews.votreEvaluationAttendSaVerification")}
          {own.published_scores ? tr("ui.entityReviews.votrePrecedenteNoteRestePubliee") : ""}
        </p>
      ) : own?.status === "hidden" ? (
        <p className="bw-rating-notice">
          {tr("ui.entityReviews.votreEvaluationNEstPas")}
        </p>
      ) : null}
      <div ref={formRef} className="scroll-mt-3">
      {write ? (
        user && mine.isPending ? (
          <p role="status">{tr("ui.entityReviews.chargementDeVotreEvaluation")}</p>
        ) : user && mine.isError ? (
          <p role="alert">
            {tr("ui.entityReviews.votreNoteNAPas")}{" "}
            <button type="button" onClick={() => void mine.refetch()}>
              {tr("ui.entityReviews.reessayer")}
            </button>
          </p>
        ) : (
          <RatingForm
            key={`${kind}:${target}:${own?.updated_at}:${nonce}:${localNonce}`}
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
      </div>
      {feed.data?.criteria && Object.keys(feed.data.criteria).length ? (
        <details className="bw-rating-detail">
          <summary>{tr("ui.entityReviews.les5Criteres")}</summary>
          <dl>
            {reviewCriteria[kind].map((c) => {
              const score = feed.data.criteria[c.code];
              return (
                <div key={c.code}>
                  <dt>{c.label}</dt>
                  <dd>
                    {score
                      ? `${reviewNumber(score.average)}/5 · ${score.count} avis`
                      : tr("ui.entityReviews.pasEncoreNote")}
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
                  {r.author?.pseudo ?? tr("ui.entityReviews.voyageurBledway")} · {reviewNumber(r.score)}/5
                </strong>
                <time dateTime={r.date}>{new Date(r.date).toLocaleDateString("fr-FR")}</time>
              </div>
              <PhotoStrip photos={reviewPhotos?.get(r.id)} label={tr("ui.entityReviews.photosDeCetAvis")} />
              <details>
                <summary>{tr("ui.entityReviews.voirSesCriteres")}</summary>
                <dl>
                  {reviewCriteria[kind].map((c) => (
                    <div key={c.code}>
                      <dt>{c.label}</dt>
                      <dd>{r.scores[c.code] ? `${r.scores[c.code]}/5` : tr("ui.entityReviews.nonUtilise")}</dd>
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
          {tr("ui.entityReviews.les30DernieresEvaluationsDetaillees")}
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
  const withPhotos = photoKind(kind);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [consent, setConsent] = useState(false);
  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await reviewsDb.rpc("bw_submit_entity_review", {
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
      // La note est enregistrée ; une photo refusée ne la remet pas en cause.
      let sent = 0;
      let failed: string | null = null;
      if (withPhotos && user && typeof data === "string")
        for (const photo of photos) {
          try {
            await submitPhoto(withPhotos, data, user.id, photo);
            sent += 1;
          } catch (cause) {
            failed = cause instanceof Error ? cause.message : "Photo non envoyée.";
          }
        }
      return { sent, failed };
    },
    onSuccess: ({ sent, failed }) => {
      window.sessionStorage.removeItem(draftKey);
      toast.success(
        sent
          ? `Votre note et ${sent > 1 ? `vos ${sent} photos ont été envoyées` : "votre photo ont été envoyées"} pour vérification.`
          : "Votre note a été envoyée pour vérification.",
      );
      if (failed) toast.error(failed);
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      onDone();
      void client.invalidateQueries({ queryKey: entityReviewsKey });
      void client.invalidateQueries({ queryKey: photosKey });
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
        {tr("ui.entityReviews.notezCeQueVousAvez")}
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
                <span className="sr-only">{n}{tr("ui.entityReviews.sur5")}</span>
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
              <span>{tr("ui.entityReviews.nonUtilise")}</span>
            </label>
          </div>
        </fieldset>
      ))}
      {withPhotos && user ? (
        <PhotoPicker
          max={3}
          photos={photos}
          onChange={setPhotos}
          consent={consent}
          onConsent={setConsent}
          note="Visibles après validation par l’équipe."
        />
      ) : null}
      {submit.isError ? <p role="alert">{submit.error.message}</p> : null}
      {!user ? (
        <a
          className="bw-rating-login"
          href={`/auth?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`}
          onClick={() => window.sessionStorage.setItem(draftKey, JSON.stringify(scores))}
        >
          {tr("ui.entityReviews.meConnecterPourEnvoyerMa")}
        </a>
      ) : (
        <Button
          type="submit"
          disabled={score === null || submit.isPending || (photos.length > 0 && !consent)}
        >
          {submit.isPending
            ? tr("ui.entityReviews.envoi")
            : score !== null
              ? photos.length
                ? `Envoyer ma note et ${photos.length > 1 ? "ces photos" : "cette photo"}`
                : `Envoyer ma note · ${reviewNumber(score)}/5`
              : tr("ui.entityReviews.notezAuMoins3Criteres")}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onDone}>
        {tr("ui.entityReviews.annuler")}
      </Button>
    </form>
  );
}
