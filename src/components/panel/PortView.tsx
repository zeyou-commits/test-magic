import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Clock3,
  MessageSquare,
  PenLine,
  Route as RouteIcon,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  companiesQuery,
  portReviewsQuery,
  portsQuery,
  ratingCriteriaQuery,
  routesQuery,
  upcomingDeparturesQuery,
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
import { DemoBadge, EmptyNote, ReliabilityNote, Stars } from "./shared";
import { ReportButton } from "./ReportButton";
import { CompanyBadge } from "./CompanyBadge";
import { FacilityIcons } from "./FacilityIcons";
import { TravelSignals } from "./TravelCommunity";
import { PortReviewForm } from "./PortReviewForm";

const scoreLabel = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function PortView({
  portId,
  onSelect,
}: {
  portId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const departuresResult = useQuery(upcomingDeparturesQuery());
  const { data: criteria = [] } = useQuery(ratingCriteriaQuery);
  const reviewsResult = useQuery(portReviewsQuery(portId));
  const reviews = useMemo(() => reviewsResult.data ?? [], [reviewsResult.data]);
  const [activeTab, setActiveTab] = useState("practical");
  const [scheduleTab, setScheduleTab] = useState("departures");
  const [writeReview, setWriteReview] = useState(false);
  const port = ports.find((item) => item.id === portId);
  const photoQuery = useQuery(portPhotoQuery(port ?? { id: "", name: "", photo_url: null }));
  const traffic = portTraffic(portId, routes, departuresResult.data ?? []);
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === portId || route.arrival_port_id === portId,
  );
  const averages = useMemo(() => {
    const entries = criteria.flatMap((criterion) => {
      const scores = reviews.flatMap((review) =>
        review.ratings
          .filter(
            (rating) =>
              rating.criterion_id === criterion.id && rating.score >= 1 && rating.score <= 5,
          )
          .map((rating) => rating.score),
      );
      return scores.length
        ? [
            {
              label: criterion.label,
              value: scores.reduce((sum, score) => sum + score, 0) / scores.length,
              count: scores.length,
            },
          ]
        : [];
    });
    return {
      entries,
      overall: entries.length
        ? entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length
        : null,
    };
  }, [criteria, reviews]);

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
  const servicesSection = (tab: "practical" | "community") => (
    <section className="port-profile-section port-services-compact" aria-labelledby={`services-${tab}-${portId}`}>
      <div className="port-section-heading">
        <h3 id={`services-${tab}-${portId}`}>Services sur place</h3>
      </div>
      {facilities.length ? (
        <FacilityIcons items={facilities} />
      ) : (
        <p className="text-xs text-muted-foreground">Services non renseignés pour ce port.</p>
      )}
    </section>
  );
  const contribute = () => {
    setActiveTab("community");
    setWriteReview(true);
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

  return (
    <article className="port-profile" aria-label={`Fiche du port de ${port.name}`}>
      <header className="port-profile-heading">
        <div>
          <p className="port-profile-country">
            {port.country_name}
            {port.city && port.city !== port.name ? ` · ${port.city}` : ""}
          </p>
          <h2>{port.name}</h2>
          <div className="port-profile-badges">
            <span>
              <RouteIcon size={13} aria-hidden /> {portRoutes.length}{" "}
              {portRoutes.length === 1 ? "ligne" : "lignes"}
            </span>
            {port.status === "inactive" ? <span>Temporairement fermé</span> : null}
            {port.is_demo ? <DemoBadge /> : null}
          </div>
        </div>
        {photo ? (
          <img
            className="port-profile-photo"
            src={photo.url}
            alt={`Port de ${port.name}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </header>
      {photo?.source === "commons" ? (
        <details className="port-photo-credit">
          <summary>
            <Camera size={12} aria-hidden /> Crédit photo
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

      <div className="port-community-summary">
        <button
          type="button"
          className="port-community-score"
          onClick={() => setActiveTab("community")}
        >
          <Star size={20} aria-hidden />
          <span>
            {reviewsResult.isPending ? (
              <strong>Lecture des avis…</strong>
            ) : reviewsResult.isError ? (
              <strong>Avis indisponibles</strong>
            ) : averages.overall != null ? (
              <>
                <strong>
                  {scoreLabel(averages.overall)} <small>/ 5</small>
                </strong>
                <small>
                  {reviews.length} {reviews.length === 1 ? "avis de voyageur" : "avis de voyageurs"}
                </small>
              </>
            ) : reviews.length ? (
              <>
                <strong>
                  {reviews.length} {reviews.length === 1 ? "avis publié" : "avis publiés"}
                </strong>
                <small>Les retours de la communauté</small>
              </>
            ) : (
              <>
                <strong>À vous de commencer</strong>
                <small>Aucun avis publié pour le moment</small>
              </>
            )}
          </span>
        </button>
        <button type="button" onClick={contribute} className="port-review-cta">
          <PenLine size={15} aria-hidden /> Donner un avis
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="port-profile-tabs">
        <TabsList aria-label={`Explorer le port de ${port.name}`} className="port-profile-nav">
          <TabsTrigger value="practical">Sur place</TabsTrigger>
          <TabsTrigger value="schedules">Horaires</TabsTrigger>
          <TabsTrigger value="community">
            Avis{" "}
            <span>{reviewsResult.isPending || reviewsResult.isError ? "—" : reviews.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="practical" className="port-tab-content">
          <TravelSignals key={portId} kind="port" target={portId} />
          {servicesSection("practical")}
          {port.notes ? (
            <details className="port-practical-details">
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
          <div className="port-timezone">
            <Clock3 size={15} aria-hidden /> Les horaires sont affichés à l’{zoneLabel(timeZone)}.
          </div>
          <details className="port-practical-details">
            <summary>
              Les lignes de ce port <span>{portRoutes.length}</span>
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
                      <small>{formatDuration(route.typical_duration_minutes)}</small>
                      <ChevronRight size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>Aucune ligne enregistrée.</EmptyNote>
            )}
          </details>
          <div className="port-contribute-inline">
            <MessageSquare size={20} aria-hidden />
            <div>
              <h3>Vous connaissez ce port ?</h3>
              <p>Partagez les petits conseils qui changent un voyage.</p>
              <button type="button" onClick={contribute}>
                Raconter mon expérience <ArrowUpRight size={14} aria-hidden />
              </button>
            </div>
          </div>
          <div className="port-report">
            <ReportButton targetType="port" targetId={portId} label="Suggérer une correction" />
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="port-tab-content">
          <div className="port-section-heading">
            <div>
              <h3>Les prochains mouvements</h3>
              <p>Horaires connus à venir · {zoneLabel(timeZone)}</p>
            </div>
          </div>
          {departuresResult.isPending ? (
            <p role="status">Chargement des horaires…</p>
          ) : departuresResult.isError ? (
            <div role="alert" className="port-soft-note">
              <p>Les horaires n’ont pas pu être chargés.</p>
              <Button variant="outline" onClick={() => void departuresResult.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : (
            <Tabs value={scheduleTab} onValueChange={setScheduleTab}>
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
                    {movements.map(({ departure, time, place }) => {
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
                ) : (
                  <div className="port-soft-note">
                    <p>
                      {scheduleTab === "departures"
                        ? "Aucun départ connu à venir depuis ce port."
                        : "Aucune arrivée connue à venir dans ce port."}
                    </p>
                    <small>Les programmes peuvent évoluer selon la saison.</small>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent
          value="community"
          forceMount
          hidden={activeTab !== "community"}
          className="port-tab-content"
        >
          <div className="port-section-heading">
            <div>
              <h3>Le port, côté voyageurs</h3>
              <p>Des expériences vécues pour mieux préparer la vôtre.</p>
            </div>
          </div>
          {reviewsResult.isPending ? (
            <p role="status">Chargement des avis…</p>
          ) : reviewsResult.isError ? (
            <div role="alert" className="port-soft-note">
              <p>Les avis ne sont pas disponibles pour le moment.</p>
              <Button variant="outline" onClick={() => void reviewsResult.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              {averages.entries.length ? (
                <ul className="port-rating-breakdown">
                  {averages.entries.map((entry) => (
                    <li key={entry.label}>
                      <span>{entry.label}</span>
                      <div className="port-rating-track" aria-hidden>
                        <span style={{ width: `${entry.value * 20}%` }} />
                      </div>
                      <strong>
                        {scoreLabel(entry.value)}
                        <small> / 5</small>
                      </strong>
                      <span className="sr-only">{entry.count} notes</span>
                    </li>
                  ))}
                </ul>
              ) : !reviews.length && !writeReview ? (
                <div className="port-community-empty">
                  <MessageSquare size={28} aria-hidden />
                  <h4>Le premier conseil pourrait être le vôtre.</h4>
                  <p>
                    Un embarquement facile, une attente à prévoir, un service pratique… Votre retour
                    aidera les prochains voyageurs.
                  </p>
                </div>
              ) : null}
              {writeReview ? (
                <PortReviewForm portId={portId} />
              ) : (
                <Button onClick={contribute} className="w-full">
                  <PenLine size={16} aria-hidden />{" "}
                  {reviews.length ? "Partager mon expérience" : "Écrire le premier avis"}
                </Button>
              )}
            </>
          )}
          {servicesSection("community")}
          {!reviewsResult.isPending && !reviewsResult.isError && reviews.length ? (
                <section className="port-reviews" aria-labelledby={`reviews-${portId}`}>
                  <div className="port-section-heading">
                    <h4 id={`reviews-${portId}`}>
                      {reviews.length} {reviews.length === 1 ? "avis publié" : "avis publiés"}
                    </h4>
                    <span>Les plus récents</span>
                  </div>
                  <ul>
                    {reviews.map((review) => {
                      const score = review.ratings.length
                        ? review.ratings.reduce((sum, rating) => sum + rating.score, 0) /
                          review.ratings.length
                        : null;
                      const name = review.author?.trim() || "Voyageur";
                      return (
                        <li key={review.id}>
                          <article>
                            <header>
                              <span className="port-review-avatar" aria-hidden>
                                {name
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((part) => part.charAt(0))
                                  .join("")
                                  .toUpperCase()}
                              </span>
                              <div>
                                <h5>{name}</h5>
                                <time dateTime={review.created_at}>
                                  {new Date(review.created_at).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </time>
                              </div>
                            </header>
                            {score != null ? <Stars value={score} /> : null}
                            {review.comment ? (
                              <p>{review.comment}</p>
                            ) : (
                              <p className="port-review-no-comment">
                                Ce voyageur a partagé ses notes sans commentaire.
                              </p>
                            )}
                            <ReportButton
                              targetType="review"
                              targetId={review.id}
                              label="Signaler cet avis"
                            />
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
          ) : null}
        </TabsContent>
      </Tabs>
    </article>
  );
}
