import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  companiesQuery,
  portReviewsQuery,
  portsQuery,
  ratingCriteriaQuery,
  routesQuery,
  portDeparturesQuery,
} from "@/lib/ferry/queries";
import {
  facilityLabels,
  formatDateTime,
  formatDuration,
  isFacilityFilled,
  ratingOnlyFacilities,
} from "@/lib/ferry/format";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { DemoBadge, EmptyNote, ReliabilityNote, Section, Stars } from "./shared";
import { ReportButton } from "./ReportButton";
import { CompanyBadge } from "./CompanyBadge";
import { FacilityIcons } from "./FacilityIcons";
import { portPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { Anchor, Camera, Clock, Route as RouteIcon, Ship } from "lucide-react";

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
  const { data: departures = [] } = useQuery(portDeparturesQuery(portId));
  const { data: criteria = [] } = useQuery(ratingCriteriaQuery);
  const { data: reviews = [] } = useQuery(portReviewsQuery(portId));

  const port = ports.find((item) => item.id === portId);
  const photoQuery = useQuery(portPhotoQuery(port ?? { id: "", name: "", photo_url: null }));
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === portId || route.arrival_port_id === portId,
  );
  const portDepartures = departures
    .filter((departure) => departure.status !== "cancelled")
    .filter((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      return route?.departure_port_id === portId;
    });

  const averages = useMemo(() => {
    const perCriterion = new Map<string, number[]>();
    reviews.forEach((review) => {
      review.ratings.forEach((rating) => {
        const list = perCriterion.get(rating.criterion_id) ?? [];
        list.push(rating.score);
        perCriterion.set(rating.criterion_id, list);
      });
    });
    const entries = criteria
      .map((criterion) => {
        const scores = perCriterion.get(criterion.id) ?? [];
        if (scores.length === 0) return null;
        return {
          label: criterion.label,
          value: scores.reduce((sum, score) => sum + score, 0) / scores.length,
          count: scores.length,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const overall =
      entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length
        : null;
    return { entries, overall };
  }, [criteria, reviews]);

  if (!port) return <EmptyNote>Port introuvable.</EmptyNote>;

  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const timeZone = portTimeZone(port);
  const facilities = Object.entries(port.facilities ?? {}).filter(
    ([key, value]) => !ratingOnlyFacilities.has(key) && isFacilityFilled(value),
  );
  const outgoing = portRoutes.filter((route) => route.departure_port_id === portId);
  const incoming = portRoutes.filter((route) => route.arrival_port_id === portId);

  const photo = photoQuery.data;

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {/* En-tête : photo du port (back-office ou Wikimedia Commons), sinon fond illustré. */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary to-primary/60 md:h-52">
        {photoQuery.isLoading ? (
          <div className="size-full animate-pulse bg-muted" aria-hidden />
        ) : photo ? (
          <img
            src={photo.url}
            alt={`Photo du port de ${port.name}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-primary-foreground/70" aria-hidden>
            <Anchor className="size-14" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/80">
            {port.country_name}
            {port.city ? ` · ${port.city}` : ""}
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight text-white drop-shadow">
            {port.name}
          </h1>
        </div>
        <div className="absolute right-3 top-3">
          <ReportButton targetType="port" targetId={port.id} />
        </div>
      </div>
      {photo?.source === "commons" ? (
        <p className="flex items-start gap-1.5 border-b px-4 py-1.5 text-[10px] leading-snug text-muted-foreground md:px-6">
          <Camera className="mt-px size-3 shrink-0" aria-hidden />
          <span>
            Photo{photo.credit ? ` : ${photo.credit}` : ""}
            {photo.license ? ` · ${photo.license}` : ""} ·{" "}
            {photo.pageUrl ? (
              <a
                href={photo.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Wikimedia Commons
              </a>
            ) : (
              "Wikimedia Commons"
            )}
            . Photo indicative.
          </span>
        </p>
      ) : null}

      {/* Repères : note, lignes, prochains départs, fuseau. */}
      <div className="space-y-3 px-4 pb-1 pt-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {averages.overall !== null ? (
            <Stars value={averages.overall} />
          ) : (
            <span className="text-muted-foreground">Pas encore d'avis</span>
          )}
          {port.status === "inactive" ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Temporairement fermé
            </span>
          ) : null}
          {port.is_demo ? <DemoBadge /> : null}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-secondary/60 px-2 py-2.5">
            <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <RouteIcon className="size-3" aria-hidden /> Lignes
            </dt>
            <dd className="font-display text-xl font-bold leading-tight">{portRoutes.length}</dd>
          </div>
          <div className="rounded-2xl bg-secondary/60 px-2 py-2.5">
            <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Ship className="size-3" aria-hidden /> Départs
            </dt>
            <dd className="font-display text-xl font-bold leading-tight">
              {portDepartures.length}
            </dd>
          </div>
          <div className="rounded-2xl bg-secondary/60 px-2 py-2.5">
            <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3" aria-hidden /> Heure
            </dt>
            <dd className="text-xs font-semibold leading-tight">{zoneLabel(timeZone)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <Section title={`Prochains départs · ${zoneLabel(timeZone)}`}>
          {portDepartures.length === 0 ? (
            <EmptyNote>Aucun départ connu à venir depuis ce port.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {portDepartures.map((departure) => {
                const route = routes.find((item) => item.id === departure.route_id);
                const company = companies.find((item) => item.id === departure.company_id);
                return (
                  <li key={departure.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "departure", id: departure.id })}
                      className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                    >
                      <div className="flex items-center gap-2.5">
                        <CompanyBadge name={company?.name} logoUrl={company?.logo_url} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {formatDateTime(departure.departure_at, timeZone)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {route ? portName(route.arrival_port_id) : "—"}
                            {company ? ` · ${company.name}` : ""}
                            {departure.duration_minutes
                              ? ` · ${formatDuration(departure.duration_minutes)}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {port.notes ? (
          <Section title="À savoir">
            <p className="text-sm leading-relaxed">{port.notes}</p>
            <div className="mt-2">
              <ReliabilityNote
                reliability="to_verify"
                sourceName={port.info_source}
                sourceUrl={port.info_source_url}
                verifiedAt={port.info_verified_at}
              />
            </div>
          </Section>
        ) : null}

        {facilities.length > 0 ? (
          <Section title="Services du port">
            <FacilityIcons items={facilities} />
          </Section>
        ) : null}

        <Section title={`Lignes (${portRoutes.length})`}>
          {portRoutes.length === 0 ? (
            <EmptyNote>Aucune ligne enregistrée pour ce port.</EmptyNote>
          ) : (
            <div className="space-y-3">
              {[
                { label: `Au départ de ${port.name}`, items: outgoing },
                { label: `À destination de ${port.name}`, items: incoming },
              ].map((group) =>
                group.items.length ? (
                  <div key={group.label}>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((route) => (
                        <li key={route.id}>
                          <button
                            type="button"
                            onClick={() => onSelect({ type: "route", id: route.id })}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                          >
                            <span className="text-sm">
                              {portName(route.departure_port_id)} →{" "}
                              {portName(route.arrival_port_id)}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {formatDuration(route.typical_duration_minutes)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </Section>

        <Section title="Notes des voyageurs">
          {averages.entries.length === 0 ? (
            <EmptyNote>Aucune note publiée pour l'instant.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {averages.entries.map((entry) => (
                <li key={entry.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{entry.label}</span>
                  <span className="flex items-center gap-2">
                    <Stars value={entry.value} />
                    <span className="text-xs text-muted-foreground">({entry.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Avis publiés (${reviews.length})`}>
          {reviews.length === 0 ? (
            <EmptyNote>Soyez le premier à partager votre expérience.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-lg bg-secondary/60 px-3 py-2">
                  <p className="text-xs font-semibold">
                    {review.author ?? "Voyageur"}
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      {new Date(review.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </p>
                  {review.comment ? (
                    <p className="mt-1 text-sm leading-relaxed">{review.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <ReviewForm portId={portId} />
      </div>
    </div>
  );
}

function ReviewForm({ portId }: { portId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: criteria = [] } = useQuery(ratingCriteriaQuery);
  const [comment, setComment] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connexion requise");
      const { data, error } = await supabase
        .from("port_reviews")
        .insert({ port_id: portId, user_id: user.id, comment: comment.trim() || null })
        .select("id")
        .single();
      if (error)
        throw new Error("L'envoi de votre avis a échoué. Réessayez dans quelques instants.");
      const ratings = Object.entries(scores).map(([criterion_id, score]) => ({
        review_id: data.id as string,
        criterion_id,
        score,
      }));
      if (ratings.length > 0) {
        const { error: ratingError } = await supabase.from("review_ratings").insert(ratings);
        if (ratingError)
          throw new Error(
            "Vos notes n'ont pas pu être enregistrées. Réessayez dans quelques instants.",
          );
      }
    },
    onSuccess: () => {
      setComment("");
      setScores({});
      queryClient.invalidateQueries({ queryKey: ["port_reviews", portId] });
      toast.success("Merci ! Votre avis sera publié après vérification.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) {
    return (
      <Section title="Donner son avis">
        <EmptyNote>
          <Link to="/auth" className="font-semibold text-primary underline underline-offset-4">
            Connectez-vous
          </Link>{" "}
          pour noter ce port et laisser un commentaire.
        </EmptyNote>
      </Section>
    );
  }

  return (
    <Section title="Donner son avis">
      <div className="grid gap-3">
        {criteria.map((criterion) => (
          <div key={criterion.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{criterion.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-label={`${criterion.label} : ${score} sur 5`}
                  onClick={() => setScores((prev) => ({ ...prev, [criterion.id]: score }))}
                  aria-pressed={(scores[criterion.id] ?? 0) >= score}
                  className={`size-8 rounded text-lg ${
                    (scores[criterion.id] ?? 0) >= score
                      ? "text-amber-500"
                      : "text-muted-foreground/40"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Votre expérience dans ce port (embarquement, attente, services…)"
          rows={3}
        />
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || Object.keys(scores).length === 0}
        >
          {submit.isPending ? "Envoi…" : "Envoyer mon avis"}
        </Button>
        <p className="text-xs text-muted-foreground">Chaque avis est relu avant publication.</p>
      </div>
    </Section>
  );
}
