import { useState } from "react";
import { ArrowUpRight, Bell, Heart, Ship, Trash2 } from "lucide-react";
import { JourneyChecklist } from "./JourneyChecklist";
import { TripPreparation } from "./TripPreparation";
import { tripDirection } from "@/lib/ferry/preparation";
import { VesselAlertTag } from "./VesselAlert";
import { useTravelAction } from "@/hooks/useTravelAction";
import { NotificationInbox } from "@/components/account/NotificationInbox";
import { useTravelFollows } from "@/hooks/useTravelFollows";
import { useMyJourneys } from "@/lib/ferry/journey";

export function FollowCenter({ userId }: { userId: string }) {
  const [filter, setFilter] = useState("all");
  const request = useTravelAction();
  const { follows, watches, details, remove } = useTravelFollows(userId);
  const journeys = useMyJourneys(userId);
  const activeDepartures = new Set((follows.data ?? []).filter((follow) => follow.target_kind === "departure" && follow.traveller).map((follow) => follow.target_id));
  const journeyRows = (journeys.data ?? []).filter((journey) => (journey.outbound_departure_id && activeDepartures.has(journey.outbound_departure_id)) || (journey.inbound_departure_id && activeDepartures.has(journey.inbound_departure_id)));
  const grouped = new Set(journeyRows.flatMap((journey) => [journey.outbound_departure_id, journey.inbound_departure_id].filter((id): id is string => Boolean(id))));
  // « Ma traversée » d'abord, puis les proches, puis les suivis par curiosité.
  const weight = (follow: { traveller?: boolean | null; follow_purpose?: string | null; target_kind: string }) =>
    follow.traveller && follow.target_kind === "departure" ? 2 : follow.follow_purpose === "proche" ? 1 : 0;
  const list = (follows.data ?? [])
    .filter(
      (follow) => (filter === "all" || follow.target_kind === filter) && !(follow.target_kind === "departure" && grouped.has(follow.target_id)),
    )
    .sort((a, b) => weight(b) - weight(a));
  const loading = follows.isPending || watches.isPending;
  const failed = follows.error || watches.error;
  const empty = !follows.data?.length && !watches.data?.length;
  return (
    <>
      <section className="bw-account-section" aria-labelledby="my-travel-title">
        <div className="bw-account-section-heading">
          <span className="bw-account-icon">
            <Heart className="size-5" />
          </span>
          <div>
            <h2 id="my-travel-title">Mes voyages suivis</h2>
            <p>Vos navires, traversées et alertes d’ouverture.</p>
          </div>
        </div>
        <div className="bw-account-filter" role="group" aria-label="Filtrer mes suivis">
          {[
            { id: "all", label: "Tout" },
            { id: "vessel", label: "Bateaux" },
            { id: "departure", label: "Traversées" },
            { id: "opening", label: "Alertes" },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-secondary" />
        ) : failed ? (
          <p role="alert" className="my-4 text-sm text-destructive">
            Chargement des suivis impossible.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                void follows.refetch();
                void watches.refetch();
              }}
            >
              Réessayer
            </button>
          </p>
        ) : empty ? (
          <div className="bw-account-empty">
            <Ship className="size-8 text-primary" />
            <h3>Votre prochain voyage commence ici</h3>
            <p>
              Sur une fiche navire ou traversée, touchez le cœur « Suivre ». Nous regrouperons ici
              les informations utiles.
            </p>
            <a href="/" className="bw-action-primary">
              Explorer la carte <ArrowUpRight className="size-4" />
            </a>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(filter === "all" || filter === "departure") && journeyRows.map((journey) => <article key={journey.id} className="bw-follow-card md:col-span-2">
              <span className="bw-account-kicker">Mon voyage</span>
              <h3 className="mt-1 font-semibold">{journey.outbound_departure_id && activeDepartures.has(journey.outbound_departure_id) && journey.inbound_departure_id && activeDepartures.has(journey.inbound_departure_id) ? "Aller et retour" : journey.inbound_departure_id && activeDepartures.has(journey.inbound_departure_id) ? "Mon retour" : "Mon aller"}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([ ["Aller", journey.outbound_departure_id], ["Retour", journey.inbound_departure_id] ] as const).map(([leg, id]) => id && activeDepartures.has(id) ? <a key={leg} href={`/?select=departure&id=${id}`} className="flex min-h-12 items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-primary">
                  <span><small className="block text-[11px] font-normal text-muted-foreground">{leg}</small>{details.data?.[id]?.label ?? "Traversée suivie"} <VesselAlertTag vesselId={details.data?.[id]?.vesselId} /></span><ArrowUpRight size={15} aria-hidden />
                </a> : <div key={leg} className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"><small className="block text-[11px]">{leg}</small>{leg === "Retour" && journey.outbound_departure_id ? "À ajouter depuis l’aller" : "Non suivi"}</div>)}
              </div>
            </article>)}
            {list.map((follow) => {
              const detail = details.data?.[follow.target_id];
              return (
                <article key={follow.id} className="bw-follow-card">
                  <div className="flex items-start justify-between gap-2">
                    <span className="bw-account-kicker">
                      {follow.traveller && follow.target_kind === "departure" ? "Ma traversée" : follow.follow_purpose === "proche" ? "Suivi pour un proche" : follow.target_kind === "vessel" ? "Bateau suivi" : "Traversée suivie"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Ne plus suivre ${detail?.label ?? "ce voyage"}`}
                      onClick={() => void remove("follow", follow.id)}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <h3 className="font-semibold">
                    {detail?.label ?? (details.error ? "Détail indisponible" : "Chargement…")}
                    {" "}
                    <VesselAlertTag
                      vesselId={follow.target_kind === "vessel" ? follow.target_id : detail?.vesselId}
                    />
                  </h3>
                  {detail?.departureAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(detail.departureAt))}
                    </p>
                  )}
                  <a
                    href={`/?select=${follow.target_kind}&id=${follow.target_id}`}
                    className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"
                  >
                    Voir sur la carte
                    <ArrowUpRight className="size-3.5" />
                  </a>
                  {follow.follow_purpose === "curieux" && !follow.traveller ? (
                    <button
                      type="button"
                      className="ml-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"
                      onClick={() =>
                        request({
                          type: "follow",
                          kind: follow.target_kind as "vessel" | "departure",
                          targetId: follow.target_id,
                          label: detail?.label ?? "Ma traversée",
                          upgrade: true,
                        })
                      }
                    >
                      <Ship className="size-3.5" /> En faire ma traversée
                    </button>
                  ) : null}
                  {follow.traveller && detail?.departureId && detail.port && detail.departureAt && (
                    <details className="mt-2 border-t border-border pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-primary">
                        Ma préparation et l’heure au port
                      </summary>
                      <JourneyChecklist
                        departureAt={detail.departureAt}
                        presentationMinutes={detail.presentationMinutes}
                        port={detail.port}
                      />
                      <TripPreparation
                        departureId={detail.departureId}
                        departureAt={detail.departureAt}
                        userId={userId} direction={tripDirection(detail.port)}
                      />
                    </details>
                  )}
                </article>
              );
            })}
            {(filter === "all" || filter === "opening") &&
              (watches.data ?? []).map((watch) => (
                <article key={watch.id} className="bw-follow-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="bw-account-kicker">Alerte d’ouverture</span>
                    <button
                      type="button"
                      aria-label="Arrêter cette alerte"
                      onClick={() => void remove("watch", watch.id)}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/5"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <h3 className="font-semibold">
                    {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
                      new Date(`${watch.period_month}T12:00:00`),
                    )}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {watch.origin_label} → {watch.destination_label}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary">
                    <Bell className="size-3" />
                    En veille pour cette période
                  </span>
                </article>
              ))}
            {!list.length && !(filter === "departure" && journeyRows.length) &&
              filter !== "all" &&
              !(filter === "opening" && watches.data?.length) && (
                <p className="p-3 text-sm text-muted-foreground">
                  Aucun suivi dans cette catégorie.
                </p>
              )}
          </div>
        )}
      </section>
      <NotificationInbox userId={userId} />
    </>
  );
}
