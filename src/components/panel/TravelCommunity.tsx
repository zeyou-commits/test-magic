import { useEffect, useState } from "react";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import {
  ContributionAuthor,
  LikeButton,
  useContributions,
} from "@/components/community/Contributions";
import { scrollWithin, takeSignalFocus } from "./LivePulse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleOff, Flag, MapPin, MessageCircle, Star, ThumbsUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import {
  activeAlerts,
  alertAction,
  alertLabel,
  communityKey,
  communityQuery,
  lastPositionAccuracy,
  requirePosition,
  isImpact,
  onSiteCount,
  useSignalCatalog,
  type AlertCategory,
  type CommunityKind,
  type VesselReview,
} from "@/lib/ferry/community";
import { offSitePortMessage, offSiteVesselMessage } from "@/lib/ferry/locationHelp";
import { portsQuery } from "@/lib/ferry/queries";
import { useNotificationReply } from "@/lib/notifications/reply";
import { formatAge } from "@/lib/ferry/tracking";
import { newsQuery } from "@/lib/ferry/flash";
import { requestQuickReport } from "@/components/map/QuickReport";
import { SignalAvatars } from "./SignalAvatars";
import { PhotoStrip } from "@/components/photos/Photos";
import { photosQuery } from "@/lib/photos/photos";
import { SituationBadge, SituationIcon } from "./SituationIcon";
import { tr } from "@/lib/i18n";

/** Picto d'une situation (nom conservé pour les écrans existants). */
export function AlertIcon({ category, size = 17 }: { category: AlertCategory; size?: number }) {
  return <SituationIcon category={category} size={size} />;
}
const failure = (message?: string) =>
  new Error(
    message && /Patientez|Maximum|déjà signalé|expiré|sur place/.test(message)
      ? message
      : "L’envoi n’a pas abouti. Réessayez dans quelques instants.",
  );

/**
 * Signalements en cours d'un port ou d'un navire, avec « Je confirme » et « Ce n'est plus le cas ».
 * « Signaler » ouvre le parcours unique (le même que l'onglet de la barre du bas).
 */
export function TravelSignals({
  kind,
  target,
  departureId,
  compact = false,
  title,
}: {
  kind: CommunityKind;
  target: string;
  departureId?: string;
  /** Titre de la liste (fiche traversée : port de départ, puis navire). */
  title?: string;
  /** Liste courte, intégrée à une fiche. */
  compact?: boolean;
}) {
  const { user, roles } = useAuth();
  const staff = roles.includes("admin") || roles.includes("moderator");
  useSignalCatalog();
  const queryClient = useQueryClient();
  const feed = useQuery(communityQuery(kind, target, false, user?.id));
  // Le script SQL du 26/10/2026 crée bw_news : sa présence active « Ce n'est plus le cas ».
  const upgraded = useQuery(newsQuery).data != null;
  const { data: ports = [] } = useQuery(portsQuery);
  const signal = () => requestQuickReport({ type: kind, id: target });
  // Boutons « Signaler une info sur ce port / ce navire » des fiches.
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: CommunityKind; target: string }>).detail;
      if (detail?.kind === kind && detail.target === target)
        requestQuickReport({ type: kind, id: target });
    };
    window.addEventListener("batogo:open-signal", onRequest);
    return () => window.removeEventListener("batogo:open-signal", onRequest);
  }, [kind, target]);
  const [done, setDone] = useState<string | null>(null);
  const contributions = useContributions(
    "alert",
    activeAlerts(feed.data?.alerts ?? [])
      .filter((alert) => !departureId || alert.departure_id === departureId)
      .map((alert) => alert.id),
  );
  // Photos validées des signalements d'un port (accès modifié, travaux…).
  const reportPhotos = useQuery(
    photosQuery(
      "report",
      kind === "port" ? (feed.data?.alerts ?? []).map((alert) => alert.id) : [],
    ),
  ).data;
  // Pastille touchée sur la carte : la fiche s'ouvre cadrée sur ce signalement.
  const alertIds = (feed.data?.alerts ?? [])
    .filter((alert) => !departureId || alert.departure_id === departureId)
    .map((alert) => alert.id)
    .join(",");
  useEffect(() => {
    if (!alertIds) return;
    const focus = takeSignalFocus(alertIds.split(","));
    if (!focus) return;
    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-alert-id="${focus}"]`);
      if (!row) return;
      scrollWithin(row, "center");
      row.classList.add("is-revealed");
      window.setTimeout(() => row.classList.remove("is-revealed"), 1800);
    }, 250);
  }, [alertIds]);
  const mutation = useMutation({
    mutationFn: async (action: {
      type: "confirm" | "resolve" | "deny" | "validate";
      id: string;
    }) => {
      // Confirmer ou démentir exige d'être sur place : deux démentis ferment un signalement.
      const here =
        action.type === "resolve" || action.type === "validate"
          ? null
          : await requirePosition(8_000);
      const error = await alertAction(action.id, action.type, here);
      if (error && here && /sur place/.test(error.message)) {
        const port = ports.find((item) => item.id === target);
        const reply = {
          action:
            action.type === "confirm" ? "confirmer ce signalement" : "répondre à ce signalement",
          here,
          ports,
          accuracyM: lastPositionAccuracy(),
        };
        throw new Error(
          kind === "port" && port
            ? offSitePortMessage({ ...reply, port, limitKm: 3 })
            : offSiteVesselMessage(reply),
        );
      }
      if (error) throw failure(error.message);
    },
    onSuccess: (_, action) => {
      setDone(action.id);
      void queryClient.invalidateQueries({ queryKey: communityKey });
      void queryClient.invalidateQueries({ queryKey: ["departures"] });
      void queryClient.invalidateQueries({ queryKey: ["my-trips"] });
    },
  });
  // Bouton touché dans une notification : la position est demandée ici, puis la réponse part.
  useNotificationReply(
    "alert",
    (feed.data?.alerts ?? []).map((alert) => alert.id),
    (reply) => {
      if (reply.action === "go") return;
      if (!user) {
        toast.error("Connectez-vous pour répondre à ce signalement.");
        return;
      }
      if (feed.data?.alerts.find((alert) => alert.id === reply.id)?.own) {
        toast.info("C’est votre signalement : d’autres voyageurs peuvent le confirmer.");
        return;
      }
      mutation.mutate({ type: reply.action, id: reply.id });
    },
  );
  if (!feed.data)
    return feed.isError ? (
      <p className="bw-community-error" role="status">
        {tr("ui.travelCommunity.lesInformationsVoyageursSontMomentanement")}{" "}
        <button type="button" onClick={() => void feed.refetch()}>
          {tr("ui.travelCommunity.reessayer")}
        </button>
      </p>
    ) : null;
  const alerts = activeAlerts(feed.data.alerts).filter(
    (alert) => !departureId || alert.departure_id === departureId,
  );
  return (
    <section
      id={`signal-${kind}:${target}`}
      className="bw-signals"
      data-compact={compact || undefined}
      aria-label={tr("ui.travelCommunity.informationsDesVoyageurs")}
    >
      <div className="bw-section-heading">
        <div>
          {compact ? null : (
            <span className="bw-eyebrow">
              <Users size={13} aria-hidden />
              {tr("ui.travelCommunity.entreVoyageurs")}
            </span>
          )}
          <h3>{title ?? (compact ? tr("ui.travelCommunity.signaleParLesVoyageurs") : tr("ui.travelCommunity.surPlaceEnCeMoment"))}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={signal}>
          <Flag size={15} aria-hidden />
          {tr("ui.travelCommunity.signaler")}
        </Button>
      </div>
      {alerts.length ? (
        <ul className="bw-signal-list">
          {alerts.map((alert) => {
            const travelers = 1 + alert.confirmations;
            const onSite = onSiteCount(alert);
            const pending = isImpact(alert) && alert.confirmations < 1 && !alert.validated;
            return (
              <li key={alert.id} data-alert-id={alert.id} className="bw-signal-card">
                <SituationBadge category={alert.category} className="bw-signal-icon" />
                <div className="bw-signal-body">
                  <strong>{alertLabel(alert)}</strong>
                  {onSite || pending || alert.validated ? (
                    <span className="bw-signal-chips">
                      {onSite ? (
                        <span className="bw-onsite-chip">
                          <MapPin size={12} aria-hidden />
                          {onSite === travelers ? tr("ui.travelCommunity.surPlace") : `${onSite} sur place`}
                        </span>
                      ) : null}
                      {alert.validated ? (
                        <span className="bw-onsite-chip">
                          <Check size={12} aria-hidden />{tr("ui.travelCommunity.valideParLEquipeBledway")}
                        </span>
                      ) : null}
                      {pending ? (
                        <span className="bw-pending-chip">{tr("ui.travelCommunity.aConfirmerParUnAutre")}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {/* Une seule ligne : qui, quand, combien. */}
                  <small className="bw-signal-byline">
                    {contributions.authors?.[alert.id] ? (
                      <ContributionAuthor
                        card={contributions.authors?.[alert.id]}
                        prefix={alert.own ? "Vous ·" : ""}
                      />
                    ) : (
                      <SignalAvatars count={travelers} seed={alert.id} />
                    )}
                    <span>
                      {formatAge(Math.max(0, (Date.now() - Date.parse(alert.created_at)) / 60_000))}
                      {travelers > 1 ? ` · ${travelers} voyageurs` : ""}
                      {alert.denials ? ` · ${alert.denials} « plus le cas »` : ""}
                    </span>
                  </small>
                  <PhotoStrip photos={reportPhotos?.get(alert.id)} label={tr("ui.travelCommunity.photoDuSignalement")} />
                  {done === alert.id && !mutation.isPending ? (
                    <small className="bw-community-success" role="status">
                      <Check size={13} aria-hidden />{tr("ui.travelCommunity.merciCEstPrisEn")}
                    </small>
                  ) : null}
                </div>
                <div className="bw-signal-side">
                  <LikeButton
                    kind="alert"
                    id={alert.id}
                    counts={contributions.counts}
                    own={Boolean(alert.own)}
                  />
                  {staff && !alert.validated ? (
                    <button
                      type="button"
                      className="bw-signal-side__main"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ type: "validate", id: alert.id })}
                    >
                      <Check size={14} aria-hidden />
                      {tr("ui.travelCommunity.valider")}
                    </button>
                  ) : null}
                  {alert.own ? (
                    <button
                      type="button"
                      className="bw-signal-side__main"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ type: "resolve", id: alert.id })}
                    >
                      <Check size={14} aria-hidden />
                      {tr("ui.travelCommunity.termine")}
                    </button>
                  ) : user ? (
                    <>
                      <button
                        type="button"
                        className="bw-signal-side__main"
                        disabled={mutation.isPending || alert.confirmed}
                        onClick={() => mutation.mutate({ type: "confirm", id: alert.id })}
                      >
                        <ThumbsUp size={14} aria-hidden />
                        {alert.confirmed ? tr("ui.travelCommunity.confirme") : tr("ui.travelCommunity.jeConfirme")}
                      </button>
                      {upgraded ? (
                        <button
                          type="button"
                          className="bw-signal-side__deny"
                          disabled={mutation.isPending || alert.denied}
                          onClick={() => mutation.mutate({ type: "deny", id: alert.id })}
                        >
                          {alert.denied ? tr("ui.travelCommunity.note") : tr("ui.travelCommunity.plusLeCas")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="bw-community-empty">
          {compact
            ? tr("ui.travelCommunity.rienDeSignaleEnCe")
            : tr("ui.travelCommunity.surPlaceUnPetitSignalement")}
        </p>
      )}
      {alerts.length && !compact ? (
        <p className="bw-community-caption">
          {tr("ui.travelCommunity.informationsVoyageursEffaceesSeulesApres")}
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="bw-community-error">
          {mutation.error.message}
        </p>
      ) : null}
    </section>
  );
}

export function VesselReviews({
  vesselId,
  readOnly = true,
}: {
  vesselId: string;
  readOnly?: boolean;
}) {
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
  // Bouton « Noter » de la fiche bateau.
  useEffect(() => {
    const open = (event: Event) => {
      if ((event as CustomEvent<{ vesselId: string }>).detail?.vesselId === vesselId)
        setWrite(true);
    };
    window.addEventListener("bledway:write-vessel-review", open);
    return () => window.removeEventListener("bledway:write-vessel-review", open);
  }, [vesselId]);
  const reviewAuthors = useContributions(
    "vessel_review",
    (feed.data?.reviews ?? []).filter((r) => r.status === "published").map((r) => r.id),
  );
  if (feed.data === null) return null;
  if (!feed.data)
    return feed.isPending ? (
      <p role="status">{tr("ui.travelCommunity.chargementDesAvis")}</p>
    ) : (
      <p className="bw-community-empty">{tr("ui.travelCommunity.lesAvisSontMomentanementIndisponibles")}</p>
    );
  const published = feed.data.reviews.filter((r) => r.status === "published");
  const own = feed.data.reviews.find((r) => r.own);
  const average = feed.data.rating_average;
  const count = feed.data.rating_count;
  if (readOnly && !published.length) return null;
  return (
    <section className="bw-vessel-reviews" aria-label={tr("ui.travelCommunity.avisSurCeNavire")}>
      {readOnly ? (
        <h3>{tr("ui.travelCommunity.anciensAvisDesVoyageurs")}</h3>
      ) : (
        <>
          <div className="bw-review-summary">
            <span className="bw-review-score">
              <Star size={24} aria-hidden />
              {average !== null
                ? average.toLocaleString("fr-FR", {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  })
                : tr("ui.travelCommunity.aVous")}
              {average !== null ? <small>/ 5</small> : null}
            </span>
            <div>
              <h3>{count ? `${count} avis` : tr("ui.travelCommunity.lePremierAvisPeutEtre")}</h3>
              <p>{tr("ui.travelCommunity.confortAccueilPropreteRacontezVotre")}</p>
            </div>
          </div>
          {own?.status === "pending" ? (
            <p role="status" className="bw-community-success">
              {tr("ui.travelCommunity.votreAvisEstEnCours")}
            </p>
          ) : own?.status === "hidden" ? (
            <p className="bw-community-caption">
              {tr("ui.travelCommunity.votreAvisNAPas")}
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
            {own ? tr("ui.travelCommunity.modifierMonAvis") : tr("ui.travelCommunity.noterCeBateau")}
          </Button>
          {write && user ? (
            <VesselReviewForm
              key={`${own?.id}:${own?.score}:${own?.comment}`}
              vesselId={vesselId}
              review={own}
              onDone={() => setWrite(false)}
            />
          ) : null}
        </>
      )}
      {count > published.length ? (
        <p className="bw-community-caption">
          {tr("ui.travelCommunity.les")}{published.length}{tr("ui.travelCommunity.avisLesPlusRecentsSont")}
        </p>
      ) : null}
      <ul className="bw-review-list">
        {published.map((review) => (
          <li key={review.id}>
            <div>
              {reviewAuthors.authors?.[review.id] ? (
                <TravellerAvatar card={reviewAuthors.authors[review.id]!} size={36} />
              ) : (
                <span className="bw-review-avatar">
                  <Users size={18} aria-hidden />
                </span>
              )}
              <strong>
                {review.own
                  ? tr("ui.travelCommunity.vous")
                  : (reviewAuthors.authors?.[review.id]?.pseudo ?? tr("ui.travelCommunity.voyageurBledway"))}
              </strong>
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
            <LikeButton
              kind="vessel_review"
              id={review.id}
              counts={reviewAuthors.counts}
              own={Boolean(review.own)}
            />
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
      aria-label={tr("ui.travelCommunity.noterCeNavire")}
      onSubmit={(e) => {
        e.preventDefault();
        if (score) mutation.mutate();
      }}
    >
      <fieldset className="port-rating-field" disabled={mutation.isPending}>
        <legend>{tr("ui.travelCommunity.votreExperienceABord")}</legend>
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
        {tr("ui.travelCommunity.unConseilPourLesProchains")}<span>{tr("ui.travelCommunity.facultatif2000CaracteresMaximum")}</span>
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
        {tr("ui.travelCommunity.unAvisParPersonneEt")}
      </p>
      <Button type="submit" disabled={!score || mutation.isPending}>
        {mutation.isPending ? tr("ui.travelCommunity.envoi") : tr("ui.travelCommunity.envoyerMonAvis")}
      </Button>
      {mutation.isError ? (
        <p role="alert" className="bw-community-error">
          {mutation.error.message}
        </p>
      ) : null}
    </form>
  );
}
