import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  Flag,
  MessageCircle,
  Star,
  ThumbsUp,
  Users,
  Navigation,
  Ship,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  activeAlerts,
  alertCategories,
  alertLabel,
  communityKey,
  communityQuery,
  type AlertCategory,
  type CommunityKind,
  type VesselReview,
} from "@/lib/ferry/community";
import { formatAge } from "@/lib/ferry/tracking";

export function AlertIcon({ category, size = 17 }: { category: AlertCategory; size?: number }) {
  const Icon =
    category === "delay"
      ? Clock3
      : category === "boarding"
        ? Ship
        : category === "queue"
          ? Users
          : Navigation;
  return <Icon size={size} aria-hidden />;
}
const failure = (message?: string) =>
  new Error(
    message && /Patientez|Maximum|déjà signalé|expiré/.test(message)
      ? message
      : "L’envoi n’a pas abouti. Réessayez dans quelques instants.",
  );
export function TravelSignals({ kind, target }: { kind: CommunityKind; target: string }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const feed = useQuery(communityQuery(kind, target, false, user?.id));
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<AlertCategory | null>(null);
  const [delay, setDelay] = useState(30);
  const [sent, setSent] = useState(false);
  const signalKey = `${kind}:${target}`;
  const startSignal = useCallback(() => {
    setSent(false);
    if (!user) {
      window.sessionStorage.setItem("bledway:pending-travel-signal", signalKey);
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    setOpen(true);
    window.setTimeout(
      () =>
        document
          .getElementById(`signal-${signalKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80,
    );
  }, [signalKey, user]);
  useEffect(() => {
    const pending = window.sessionStorage.getItem("bledway:pending-travel-signal");
    if (pending === signalKey && !authLoading) {
      if (user) {
        window.sessionStorage.removeItem("bledway:pending-travel-signal");
        setOpen(true);
        window.setTimeout(
          () =>
            document
              .getElementById(`signal-${signalKey}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          80,
        );
      } else startSignal();
    }
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: CommunityKind; target: string }>).detail;
      if (detail?.kind === kind && detail.target === target) {
        if (user) window.sessionStorage.removeItem("bledway:pending-travel-signal");
        startSignal();
      }
    };
    window.addEventListener("batogo:open-signal", onRequest);
    return () => window.removeEventListener("batogo:open-signal", onRequest);
  }, [kind, target, user, authLoading, signalKey, startSignal]);
  const mutation = useMutation({
    mutationFn: async (
      action: { type: "report" } | { type: "confirm" | "resolve"; id: string },
    ) => {
      const result =
        action.type === "report"
          ? await supabase.rpc("bw_report_travel", {
              p_kind: kind,
              p_target: target,
              p_category: category!,
              p_delay: category === "delay" ? delay : null,
            })
          : await supabase.rpc("bw_alert_action", { p_alert: action.id, p_action: action.type });
      if (result.error) throw failure(result.error.message);
    },
    onSuccess: (_, action) => {
      if (action.type === "report") {
        setOpen(false);
        setSent(true);
        setCategory(null);
      } else setSent(false);
      void queryClient.invalidateQueries({ queryKey: communityKey });
    },
  });
  if (!feed.data)
    return feed.isError ? (
      <p className="bw-community-error" role="status">
        Les informations voyageurs sont momentanément indisponibles.{" "}
        <button type="button" onClick={() => void feed.refetch()}>
          Réessayer
        </button>
      </p>
    ) : null;
  const alerts = activeAlerts(feed.data.alerts);
  return (
    <section
      id={`signal-${signalKey}`}
      className="bw-signals"
      aria-label="Informations des voyageurs"
    >
      <div className="bw-section-heading">
        <div>
          <span className="bw-eyebrow">
            <Users size={13} aria-hidden />
            Entre voyageurs
          </span>
          <h3>Sur place, en ce moment</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (open) setOpen(false);
            else startSignal();
            mutation.reset();
          }}
          aria-expanded={open}
        >
          <Flag size={15} aria-hidden />
          Signaler
        </Button>
      </div>
      {alerts.length ? (
        <ul className="bw-signal-list">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <span className="bw-signal-icon">
                <AlertIcon category={alert.category} />
              </span>
              <div>
                <strong>{alertLabel(alert)}</strong>
                <small>
                  {1 + alert.confirmations} voyageur{alert.confirmations ? "s" : ""} ·{" "}
                  {formatAge(Math.max(0, (Date.now() - Date.parse(alert.created_at)) / 60_000))}
                </small>
                <div className="bw-signal-actions">
                  {alert.own ? (
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ type: "resolve", id: alert.id })}
                    >
                      <Check size={14} aria-hidden />
                      C’est terminé
                    </button>
                  ) : user ? (
                    <button
                      type="button"
                      disabled={mutation.isPending || alert.confirmed}
                      onClick={() => mutation.mutate({ type: "confirm", id: alert.id })}
                    >
                      <ThumbsUp size={14} aria-hidden />
                      {alert.confirmed ? "Confirmé par vous" : "Je confirme"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bw-community-empty">
          Sur place ? Un petit signalement peut aider tout le monde.
        </p>
      )}
      {alerts.length ? (
        <p className="bw-community-caption">
          Informations voyageurs · expiration après 2 h. Consultez aussi les annonces de la
          compagnie.
        </p>
      ) : null}
      {sent ? (
        <p className="bw-community-success" role="status">
          <Check size={16} aria-hidden />
          Merci, votre signalement est visible pendant 2 h.
        </p>
      ) : null}
      {open ? (
        <div className="bw-signal-compose">
          <form
            aria-label="Signaler une information"
            onSubmit={(e) => {
              e.preventDefault();
              if (category) mutation.mutate({ type: "report" });
            }}
          >
            <fieldset disabled={mutation.isPending}>
              <legend>Que voyez-vous ?</legend>
              <div className="bw-signal-choices">
                {(
                  Object.entries(alertCategories) as [
                    AlertCategory,
                    { label: string; kind: string },
                  ][]
                )
                  .filter(([, c]) => c.kind === kind)
                  .map(([key, c]) => (
                    <label key={key}>
                      <input
                        type="radio"
                        name={`signal-${target}`}
                        checked={category === key}
                        onChange={() => setCategory(key)}
                      />
                      <span>
                        <AlertIcon category={key} />
                        {c.label}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
            {category === "delay" ? (
              <fieldset className="bw-delay-choice" disabled={mutation.isPending}>
                <legend>Retard annoncé sur place</legend>
                {[30, 60, 120].map((m) => (
                  <label key={m}>
                    <input
                      type="radio"
                      name={`delay-${target}`}
                      checked={delay === m}
                      onChange={() => setDelay(m)}
                    />
                    <span>{m === 120 ? "2 h et +" : `${m} min`}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <p className="bw-community-caption">
              Partagez uniquement ce que vous constatez ou ce qui est annoncé sur place.
            </p>
            <Button disabled={!category || mutation.isPending} type="submit">
              {mutation.isPending ? "Envoi…" : "Partager l’info"}
            </Button>
          </form>
        </div>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="bw-community-error">
          {mutation.error.message}
        </p>
      ) : null}
    </section>
  );
}

export function VesselReviews({ vesselId }: { vesselId: string }) {
  const { user } = useAuth();
  const feed = useQuery(communityQuery("vessel", vesselId, false, user?.id));
  const [write, setWrite] = useState(false);
  useEffect(() => {
    if (!user) return;
    const pending = window.sessionStorage.getItem("bledway:pending-vessel-review");
    if (pending !== vesselId) return;
    window.sessionStorage.removeItem("bledway:pending-vessel-review");
    setWrite(true);
  }, [user, vesselId]);
  if (feed.data === null) return null;
  if (!feed.data)
    return feed.isPending ? (
      <p role="status">Chargement des avis…</p>
    ) : (
      <p className="bw-community-empty">Les avis sont momentanément indisponibles.</p>
    );
  const published = feed.data.reviews.filter((r) => r.status === "published");
  const own = feed.data.reviews.find((r) => r.own);
  const average = feed.data.rating_average;
  const count = feed.data.rating_count;
  return (
    <section className="bw-vessel-reviews" aria-label="Avis sur ce navire">
      <div className="bw-review-summary">
        <span className="bw-review-score">
          <Star size={24} aria-hidden />
          {average !== null
            ? average.toLocaleString("fr-FR", {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1,
              })
            : "À vous"}
          {average !== null ? <small>/ 5</small> : null}
        </span>
        <div>
          <h3>{count ? `${count} avis` : "Le premier avis peut être le vôtre."}</h3>
          <p>Confort, accueil, propreté : racontez votre traversée.</p>
        </div>
      </div>
      {own?.status === "pending" ? (
        <p role="status" className="bw-community-success">
          Votre avis est en cours de vérification.
        </p>
      ) : own?.status === "hidden" ? (
        <p className="bw-community-caption">
          Votre avis n’a pas été publié. Vous pouvez le modifier.
        </p>
      ) : null}
      <Button
        variant="outline"
        onClick={() => {
          if (!user) {
            window.sessionStorage.setItem("bledway:pending-vessel-review", vesselId);
            const next = `${window.location.pathname}${window.location.search}`;
            window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
            return;
          }
          setWrite(!write);
        }}
        aria-expanded={user ? write : undefined}
      >
        <MessageCircle size={16} aria-hidden />
        {own ? "Modifier mon avis" : "Noter ce bateau"}
      </Button>
      {write && user ? (
        <VesselReviewForm
          key={`${own?.id}:${own?.score}:${own?.comment}`}
          vesselId={vesselId}
          review={own}
          onDone={() => setWrite(false)}
        />
      ) : null}
      {count > published.length ? (
        <p className="bw-community-caption">
          Les {published.length} avis les plus récents sont affichés.
        </p>
      ) : null}
      <ul className="bw-review-list">
        {published.map((review) => (
          <li key={review.id}>
            <div>
              <span className="bw-review-avatar">
                <Users size={18} aria-hidden />
              </span>
              <strong>{review.own ? "Vous" : "Voyageur BledWay"}</strong>
              <time dateTime={review.created_at}>
                {new Date(review.created_at).toLocaleDateString("fr-FR")}
              </time>
            </div>
            <p className="bw-review-stars" aria-label={`${review.score} sur 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={14}
                  fill={n <= review.score ? "currentColor" : "none"}
                  aria-hidden
                />
              ))}
            </p>
            {review.comment ? (
              <p className="whitespace-pre-wrap break-words">{review.comment}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
function VesselReviewForm({
  vesselId,
  review,
  onDone,
}: {
  vesselId: string;
  review: VesselReview | undefined;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [score, setScore] = useState(review?.score ?? 0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bw_submit_review", {
        p_vessel: vesselId,
        p_score: score,
        p_comment: comment.trim(),
      });
      if (error) throw failure(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: communityKey });
      onDone();
    },
  });
  return (
    <form
      className="port-review-form bw-vessel-review-form"
      aria-label="Noter ce navire"
      onSubmit={(e) => {
        e.preventDefault();
        if (score) mutation.mutate();
      }}
    >
      <fieldset className="port-rating-field" disabled={mutation.isPending}>
        <legend>Votre expérience à bord</legend>
        <div className="port-rating-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="vessel-score"
                value={n}
                checked={score === n}
                onChange={() => setScore(n)}
                aria-label={`${n} sur 5`}
              />
              <Star size={25} fill={n <= score ? "currentColor" : "none"} aria-hidden />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="port-comment-label" htmlFor={`review-${vesselId}`}>
        Un conseil pour les prochains voyageurs ? <span>Facultatif · 2 000 caractères maximum</span>
      </label>
      <Textarea
        id={`review-${vesselId}`}
        value={comment}
        maxLength={2000}
        rows={4}
        disabled={mutation.isPending}
        onChange={(e) => setComment(e.target.value)}
      />
      <p className="bw-community-caption">
        Un avis par personne et par bateau. Les avis sont relus avant publication.
      </p>
      <Button type="submit" disabled={!score || mutation.isPending}>
        {mutation.isPending ? "Envoi…" : "Envoyer mon avis"}
      </Button>
      {mutation.isError ? (
        <p role="alert" className="bw-community-error">
          {mutation.error.message}
        </p>
      ) : null}
    </form>
  );
}
