import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  companiesQuery,
  portReviewsQuery,
  portsQuery,
  ratingCriteriaQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { facilityLabels, formatDateTime, formatDuration } from "@/lib/ferry/format";
import type { Selection } from "@/lib/ferry/types";
import { DemoBadge, EmptyNote, PanelHeader, ReliabilityNote, Section, Stars } from "./shared";
import { ReportButton } from "./ReportButton";

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
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: criteria = [] } = useQuery(ratingCriteriaQuery);
  const { data: reviews = [] } = useQuery(portReviewsQuery(portId));

  const port = ports.find((item) => item.id === portId);
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === portId || route.arrival_port_id === portId,
  );
  const portDepartures = departures
    .filter((departure) => {
      const route = routes.find((item) => item.id === departure.route_id);
      return route?.departure_port_id === portId;
    })
    .slice(0, 6);

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

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        overline={`${port.country_name}${port.city ? ` · ${port.city}` : ""}`}
        title={port.name}
        subtitle={
          <span className="flex items-center gap-2">
            {averages.overall !== null ? (
              <Stars value={averages.overall} />
            ) : (
              <span>Pas encore d'avis</span>
            )}
            {port.is_demo ? <DemoBadge /> : null}
          </span>
        }
        actions={<ReportButton targetType="port" targetId={port.id} />}
      />
      <div className="flex-1 overflow-y-auto">
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

        {port.facilities && Object.keys(port.facilities).length > 0 ? (
          <Section title="Services du port">
            <dl className="grid gap-2">
              {Object.entries(port.facilities).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <dt className="font-medium">{facilityLabels[key] ?? key}</dt>
                  <dd className="text-muted-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <Section title={`Lignes (${portRoutes.length})`}>
          {portRoutes.length === 0 ? (
            <EmptyNote>Aucune ligne enregistrée pour ce port.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {portRoutes.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "route", id: route.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-secondary"
                  >
                    <span className="text-sm">
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {formatDuration(route.typical_duration_minutes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Prochains départs">
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
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-secondary"
                    >
                      <p className="text-sm font-medium">
                        {formatDateTime(departure.departure_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {route ? portName(route.arrival_port_id) : "—"}
                        {company ? ` · ${company.name}` : ""}
                        {departure.duration_minutes
                          ? ` · ${formatDuration(departure.duration_minutes)}`
                          : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
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
      if (error) throw new Error(error.message);
      const ratings = Object.entries(scores).map(([criterion_id, score]) => ({
        review_id: data.id as string,
        criterion_id,
        score,
      }));
      if (ratings.length > 0) {
        const { error: ratingError } = await supabase.from("review_ratings").insert(ratings);
        if (ratingError) throw new Error(ratingError.message);
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
        <EmptyNote>Connectez-vous pour noter ce port et laisser un commentaire.</EmptyNote>
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
                  className={`size-6 rounded text-sm ${
                    (scores[criterion.id] ?? 0) >= score
                      ? "text-accent"
                      : "text-muted-foreground/50"
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
        <p className="text-xs text-muted-foreground">
          Chaque avis est relu avant publication.
        </p>
      </div>
    </Section>
  );
}
