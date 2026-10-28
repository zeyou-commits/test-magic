import { EntityReviews } from "./EntityReviews";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { useEffect, useMemo, useState } from "react";
import { LikeButton, useContributions } from "@/components/community/Contributions";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { hasSignalFocus, LivePulse, revealLive, useLiveInfo } from "./LivePulse";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Clock3,
  Megaphone,
  Navigation,
  PenLine,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { requestQuickReport } from "@/components/map/QuickReport";
import { FlashFeed } from "./FlashFeed";
import { PortPlaces } from "./PortPlaces";
import { PortPresence } from "./TripPresence";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  companiesQuery,
  portReviewsQuery,
  portsQuery,
  ratingCriteriaQuery,
  routesQuery,
  upcomingDeparturesQuery,
  fleetDeparturesQuery,
} from "@/lib/ferry/queries";
import {
  formatDateTime,
  formatDuration,
  isFacilityFilled,
  ratingOnlyFacilities,
} from "@/lib/ferry/format";
import { portTraffic } from "@/lib/ferry/portTraffic";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { portPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { DemoBadge, EmptyNote, ReliabilityNote } from "./shared";
import { ReportButton } from "./ReportButton";
import { CompanyBadge } from "./CompanyBadge";
import { FacilityIcons } from "./FacilityIcons";
import { TravelSignals } from "./TravelCommunity";
import { globalCriterionQuery } from "./PortReviewForm";

const scoreLabel = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Cinq étoiles, lisibles d'un coup d'œil. */
function StarRow({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span
      className="pv-stars"
      aria-label={value ? `${scoreLabel(value)} sur 5` : "Pas encore noté"}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden
          fill={value >= n - 0.25 ? "currentColor" : "none"}
          className={value >= n - 0.75 ? "is-on" : undefined}
        />
      ))}
    </span>
  );
}

export function PortView({
  portId,
  onSelect,
}: {
  portId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { user } = useAuth();
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const departuresResult = useQuery(upcomingDeparturesQuery());
  const { data: criteria = [] } = useQuery(ratingCriteriaQuery);
  const globalCriterion = useQuery(globalCriterionQuery).data ?? null;
  const reviewsResult = useQuery(portReviewsQuery(portId));
  const guided = useQuery(entityReviewsQuery("port", portId));
  const reviews = useMemo(() => reviewsResult.data ?? [], [reviewsResult.data]);
  const [chosenTab, setChosenTab] = useState<string | null>(null);
  const [scheduleTab, setScheduleTab] = useState("departures");
  const [visibleCount, setVisibleCount] = useState(8);
  const [writeReview, setWriteReview] = useState(false);

  useEffect(() => {
    if (user && window.sessionStorage.getItem(`bledway:rating:port:${portId}`))
      setChosenTab("community");
  }, [user, portId]);
  const port = ports.find((item) => item.id === portId);
  const photoQuery = useQuery(portPhotoQuery(port ?? { id: "", name: "", photo_url: null }));
  // Départs récents (traversées en cours) + à venir : une arrivée d'un bateau parti hier compte.
  const { data: recentDepartures = [] } = useQuery(fleetDeparturesQuery);
  const knownDepartures = useMemo(
    () => [
      ...new Map(
        [...recentDepartures, ...(departuresResult.data ?? [])].map((d) => [d.id, d]),
      ).values(),
    ],
    [recentDepartures, departuresResult.data],
  );
  const traffic = portTraffic(portId, routes, knownDepartures);
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === portId || route.arrival_port_id === portId,
  );
  // « Ligne » seulement s'il existe au moins une traversée programmée à venir.
  const scheduledRoutes = new Set(
    (departuresResult.data ?? [])
      .filter((departure) => portRoutes.some((route) => route.id === departure.route_id))
      .map((departure) => departure.route_id),
  );
  const averages = useMemo(() => {
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const entries = criteria.flatMap((criterion) => {
      const scores = reviews.flatMap((review) =>
        review.ratings
          .filter(
            (rating) =>
              rating.criterion_id === criterion.id && rating.score >= 1 && rating.score <= 5,
          )
          .map((rating) => rating.score),
      );
      return scores.length ? [{ label: criterion.label, value: mean(scores) }] : [];
    });
    // Note globale de chaque avis : celle donnée par le voyageur, sinon la moyenne de ses critères.
    const perReview = reviews.flatMap((review) => {
      const own = globalCriterion
        ? review.ratings.find((rating) => rating.criterion_id === globalCriterion)?.score
        : undefined;
      if (own) return [own];
      const detailed = review.ratings.filter((rating) => rating.criterion_id !== globalCriterion);
      return detailed.length ? [mean(detailed.map((rating) => rating.score))] : [];
    });
    return { entries, overall: perReview.length ? mean(perReview) : null };
  }, [criteria, reviews, globalCriterion]);

  // Bandeau « en direct » : compté comme sur les fiches traversée et bateau. L'onglet « En direct »
  // s'ouvre d'office seulement s'il s'y passe quelque chose.
  const reviewCommunity = useContributions(
    "port_review",
    (reviewsResult.data ?? []).map((review) => review.id),
  );
  const live = useLiveInfo({
    routeIds: portRoutes.map((route) => route.id),
    portIds: [portId],
    signalPortIds: [portId],
  });
  const liveId = `live-port-${portId}`;
  const activeTab =
    chosenTab ?? (live.official + live.travellers || hasSignalFocus() ? "live" : "practical");
  const openLive = () => {
    setChosenTab("live");
    revealLive(liveId);
  };

  // Ancien bouton des écrans existants : ouvre le parcours « Signaler » commun.
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: string; target: string }>).detail;
      if (detail?.kind === "port" && detail.target === portId)
        requestQuickReport({ type: "port", id: portId });
    };
    window.addEventListener("batogo:show-signal", onRequest);
    return () => window.removeEventListener("batogo:show-signal", onRequest);
  }, [portId]);

  if (!port) return <EmptyNote>Port introuvable.</EmptyNote>;
  const photo = photoQuery.data;
  const timeZone = portTimeZone(port);
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const facilities = Object.entries(port.facilities ?? {}).filter(
    ([key, value]) =>
      !ratingOnlyFacilities.has(key) &&
      isFacilityFilled(value) &&
      !/^(non|indisponible|absent|no)$/i.test(value.trim()),
  );
  const openReviews = (write = false) => {
    setChosenTab("community");
    if (write) setWriteReview(true);
  };
  const movements =
    scheduleTab === "departures"
      ? traffic.departures.map((departure) => ({
          departure,
          time: departure.departure_at,
          place: portName(
            routes.find((route) => route.id === departure.route_id)?.arrival_port_id ?? "",
          ),
        }))
      : traffic.arrivals.map(({ departure, route, arrivalAt }) => ({
          departure,
          time: arrivalAt,
          place: portName(route.departure_port_id),
        }));
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${port.latitude},${port.longitude}`;
  const getScore = (review: (typeof reviews)[number]) => {
    const own = globalCriterion
      ? review.ratings.find((rating) => rating.criterion_id === globalCriterion)?.score
      : undefined;
    const detailed = review.ratings.filter((rating) => rating.criterion_id !== globalCriterion);
    return (
      own ??
      (detailed.length
        ? detailed.reduce((sum, rating) => sum + rating.score, 0) / detailed.length
        : null)
    );
  };

  return (
    <article className="port-profile pv" aria-label={`Fiche du port de ${port.name}`}>
      <header className={`pv-hero ${photo ? "has-photo" : ""}`}>
        {photo ? (
          <img
            className="pv-hero__photo"
            src={photo.url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="pv-hero__text">
          <p className="pv-hero__country">
            {port.country_name}
            {port.city && port.city !== port.name ? ` · ${port.city}` : ""}
          </p>
          <h2>{port.name}</h2>
          <p className="pv-hero__meta">
            {scheduledRoutes.size
              ? `${scheduledRoutes.size} ligne${scheduledRoutes.size > 1 ? "s" : ""} · ${traffic.departures.length} départ${traffic.departures.length > 1 ? "s" : ""} à venir`
              : "Aucune traversée programmée pour le moment"}
            {port.status === "inactive" ? " · Temporairement fermé" : ""}
          </p>
        </div>
        {photo?.source === "commons" ? (
          <details className="pv-hero__credit">
            <summary aria-label="Crédit photo">
              <Camera size={12} aria-hidden />
            </summary>
            <p>
              Photo{photo.credit ? ` : ${photo.credit}` : ""}
              {photo.license ? ` · ${photo.license}` : ""} ·{" "}
              {photo.pageUrl ? (
                <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer">
                  Wikimedia Commons
                </a>
              ) : (
                "Wikimedia Commons"
              )}
              . Photo indicative.
            </p>
          </details>
        ) : null}
      </header>

      <button type="button" className="pv-rating" onClick={() => openReviews()}>
        {reviewsResult.isPending ? (
          <span>Lecture des avis…</span>
        ) : (guided.data?.average ?? averages.overall) != null ? (
          <>
            <StarRow value={guided.data?.average ?? averages.overall ?? 0} />
            <strong>{scoreLabel(guided.data?.average ?? averages.overall ?? 0)}</strong>
            <span>· {guided.data?.count ?? reviews.length} avis</span>
          </>
        ) : (
          <>
            <StarRow value={0} />
            <span>Pas encore d’avis</span>
          </>
        )}
        {port.is_demo ? <DemoBadge /> : null}
        <ChevronRight size={15} aria-hidden />
      </button>

      <div className="pv-actions">
        <button
          type="button"
          className="pv-action pv-action--signal"
          onClick={() => requestQuickReport({ type: "port", id: portId })}
        >
          <span aria-hidden>
            <Megaphone size={18} />
          </span>
          Signaler
        </button>
        <a className="pv-action" href={directions} target="_blank" rel="noopener noreferrer">
          <span aria-hidden>
            <Navigation size={18} />
          </span>
          Y aller
        </a>
        <button type="button" className="pv-action" onClick={() => openReviews(true)}>
          <span aria-hidden>
            <PenLine size={18} />
          </span>
          Noter
        </button>
      </div>

      <LivePulse info={live} onOpen={openLive} />

      <PortPresence portId={portId} />

      <Tabs value={activeTab} onValueChange={setChosenTab} className="port-profile-tabs">
        <TabsList aria-label={`Explorer le port de ${port.name}`} className="port-profile-nav">
          <TabsTrigger value="live">En direct</TabsTrigger>
          <TabsTrigger value="practical">Préparer</TabsTrigger>
          <TabsTrigger value="community">
            Avis{" "}
            <span>{reviewsResult.isPending || reviewsResult.isError ? "—" : reviews.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="port-tab-content" id={liveId} data-live-anchor>
          <FlashFeed
            title={`À la une · ${port.name}`}
            context={{ portIds: [portId], routeIds: portRoutes.map((route) => route.id) }}
            signalPortIds={[portId]}
            withSignals={false}
            currentPortId={portId}
            expandFirst
            onSelect={onSelect}
          />
          <TravelSignals key={portId} kind="port" target={portId} compact />
          <section className="pv-section" aria-label="Prochains mouvements">
            <div className="pv-section__head">
              <h3>Prochains mouvements</h3>
              <small>{zoneLabel(timeZone)}</small>
            </div>
            {departuresResult.isPending ? (
              <p role="status" className="pv-empty">
                Chargement des horaires…
              </p>
            ) : departuresResult.isError ? (
              <div role="alert" className="port-soft-note">
                <p>Les horaires n’ont pas pu être chargés.</p>
                <Button variant="outline" onClick={() => void departuresResult.refetch()}>
                  Réessayer
                </Button>
              </div>
            ) : (
              <Tabs
                value={scheduleTab}
                onValueChange={(value) => {
                  setScheduleTab(value);
                  setVisibleCount(8);
                }}
              >
                <TabsList aria-label="Départs ou arrivées" className="port-traffic-tabs">
                  <TabsTrigger value="departures">
                    <ArrowUpRight size={15} aria-hidden /> Départs{" "}
                    <span>{traffic.departures.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="arrivals">
                    <ArrowDownLeft size={15} aria-hidden /> Arrivées{" "}
                    <span>{traffic.arrivals.length}</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value={scheduleTab} className="port-movements">
                  {movements.length ? (
                    <ul>
                      {movements.slice(0, visibleCount).map(({ departure, time, place }) => {
                        const company = companies.find((item) => item.id === departure.company_id);
                        return (
                          <li key={departure.id}>
                            <button
                              type="button"
                              onClick={() => onSelect({ type: "departure", id: departure.id })}
                            >
                              <div>
                                <time dateTime={time}>{formatDateTime(time, timeZone)}</time>
                                <strong>
                                  {scheduleTab === "departures" ? "Vers" : "Depuis"} {place}
                                </strong>
                                {company ? (
                                  <span className="port-movement-company">
                                    <CompanyBadge
                                      name={company.name}
                                      logoUrl={company.logo_url}
                                      size={18}
                                    />
                                    {company.name}
                                  </span>
                                ) : null}
                              </div>
                              <ChevronRight size={16} aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {movements.length > visibleCount ? (
                    <Button
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => setVisibleCount((count) => count + 8)}
                    >
                      Voir les {Math.min(8, movements.length - visibleCount)} suivants (
                      {movements.length - visibleCount} restants)
                    </Button>
                  ) : null}
                  {movements.length ? null : (
                    <p className="pv-empty">
                      {scheduleTab === "departures"
                        ? "Aucun départ connu à venir depuis ce port."
                        : "Aucune arrivée connue à venir dans ce port."}
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </section>
        </TabsContent>

        <TabsContent value="practical" className="port-tab-content">
          <section className="pv-section" aria-labelledby={`services-${portId}`}>
            <div className="pv-section__head">
              <h3 id={`services-${portId}`}>Services sur place</h3>
            </div>
            {facilities.length ? (
              <FacilityIcons items={facilities} />
            ) : (
              <p className="pv-empty">Services non renseignés pour ce port.</p>
            )}
          </section>
          <PortPlaces portId={portId} portName={port.name} />
          {port.notes ? (
            <details className="port-practical-details" open>
              <summary>
                À savoir avant votre passage <ChevronRight size={16} aria-hidden />
              </summary>
              <p>{port.notes}</p>
              <ReliabilityNote
                reliability="to_verify"
                sourceName={port.info_source}
                sourceUrl={port.info_source_url}
                verifiedAt={port.info_verified_at}
              />
            </details>
          ) : null}
          <details className="port-practical-details">
            <summary>
              Liaisons de ce port <span>{portRoutes.length}</span>
              <ChevronRight size={16} aria-hidden />
            </summary>
            {portRoutes.length ? (
              <ul className="port-route-list">
                {portRoutes.map((route) => (
                  <li key={route.id}>
                    <button type="button" onClick={() => onSelect({ type: "route", id: route.id })}>
                      <span>
                        {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                      </span>
                      <small>
                        {scheduledRoutes.has(route.id)
                          ? formatDuration(route.typical_duration_minutes)
                          : "pas de traversée programmée"}
                      </small>
                      <ChevronRight size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>Aucune liaison enregistrée.</EmptyNote>
            )}
          </details>
          <div className="pv-footnote">
            <span>
              <Clock3 size={14} aria-hidden /> Horaires affichés à l’{zoneLabel(timeZone)}.
            </span>
            <ReportButton targetType="port" targetId={portId} />
          </div>
        </TabsContent>

        <TabsContent
          value="community"
          forceMount
          hidden={activeTab !== "community"}
          className="port-tab-content"
        >
          <EntityReviews
            kind="port"
            target={portId}
            openForm={writeReview}
            onFormClosed={() => setWriteReview(false)}
          />
          {reviews.length ? (
            <h3 className="mt-5 text-sm font-semibold">Anciens avis des voyageurs</h3>
          ) : null}
          {!reviewsResult.isPending && !reviewsResult.isError && reviews.length ? (
            <ul className="pv-reviews">
              {reviews.map((review) => {
                const score = getScore(review);
                // Le cabas et le pseudo du voyageur (jamais son nom) dès que la communauté est active.
                const card = reviewCommunity.authors?.[review.id];
                const name = card?.pseudo ?? (review.author?.trim() || "Voyageur");
                return (
                  <li key={review.id}>
                    <div className="pv-review__head">
                      {card ? (
                        <TravellerAvatar card={card} size={32} />
                      ) : (
                        <span className="port-review-avatar" aria-hidden>
                          {name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part.charAt(0))
                            .join("")
                            .toUpperCase()}
                        </span>
                      )}
                      <strong>{name}</strong>
                      {score != null ? <StarRow value={score} size={13} /> : null}
                      <time dateTime={review.created_at}>
                        {new Date(review.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    {review.comment ? <p>{review.comment}</p> : null}
                    <div className="bw-review-actions">
                      <LikeButton
                        kind="port_review"
                        id={review.id}
                        counts={reviewCommunity.counts}
                      />
                      <ReportButton
                        targetType="review"
                        targetId={review.id}
                        label="Signaler cet avis"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </TabsContent>
      </Tabs>
    </article>
  );
}
