import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { upcomingDeparturesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { computeVesselFacts, MIN_REVIEWS } from "@/lib/ferry/vesselFacts";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { ShareButtons } from "./ShareButtons";
import { VesselAlertTag } from "./VesselAlert";

function useVesselFacts() {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const active = vessels.filter((vessel) => vessel.status === "active");
  const feeds = useQueries({
    queries: active.map((vessel) => ({ ...entityReviewsQuery("vessel", vessel.id), staleTime: 5 * 60_000 })),
  });
  const reviewsKey = feeds.map((feed) => `${feed.data?.count ?? 0}:${feed.data?.average ?? ""}`).join();
  return useMemo(() => {
    const upcoming = new Map<string, number>();
    for (const departure of departures) {
      if (!departure.vessel_id || departure.status === "cancelled") continue;
      upcoming.set(departure.vessel_id, (upcoming.get(departure.vessel_id) ?? 0) + 1);
    }
    const reviews = new Map(
      active.flatMap((vessel, index) => {
        const feed = feeds[index]?.data;
        return feed ? [[vessel.id, { count: feed.count, average: feed.average }] as const] : [];
      }),
    );
    return computeVesselFacts(active, upcoming, reviews);
    // Les résultats de useQueries changent de référence à chaque rendu : reviewsKey les résume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vessels, departures, reviewsKey]);
}

/** Un seul titre sur la photo. Une alerte passe avant : aucun titre tant qu'elle est ouverte. */
export function VesselPhotoBadge({ vesselId }: { vesselId: string }) {
  const fact = useVesselFacts().byVessel.get(vesselId)?.[0];
  const alert = useVesselAlert(vesselId);
  if (!fact || alert) return null;
  return (
    <span className="bw-vessel-photo-badge">
      <Award size={13} aria-hidden /> {fact.label}
    </span>
  );
}

/** La carte d'identité du navire : ses titres et ses rangs, jamais présentés comme une garantie. */
export function VesselIdentity({ vesselId }: { vesselId: string }) {
  const facts = useVesselFacts().byVessel.get(vesselId);
  if (!facts?.length) return null;
  return (
    <section className="bw-vessel-identity" aria-label="Ses titres dans la flotte">
      <h4>
        <Award size={15} aria-hidden /> Ses titres dans la flotte
      </h4>
      <ul>
        {facts.slice(0, 4).map((fact) => (
          <li key={fact.key}>
            <b>{fact.label}</b> · {fact.value}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sur une traversée : le clin d'œil au navire qu'on va prendre. */
export function VesselBoardingNote({ vesselId }: { vesselId: string }) {
  const fact = useVesselFacts().byVessel.get(vesselId)?.[0];
  const alert = useVesselAlert(vesselId);
  if (!fact || alert) return null;
  return (
    <p className="bw-vessel-boarding-note">
      <Award size={14} aria-hidden /> À bord : {fact.label.charAt(0).toLowerCase()}
      {fact.label.slice(1)} ({fact.value})
    </p>
  );
}

/** Le palmarès de la page Navires : des podiums par thème, à partager. */
export function VesselPalmares() {
  const { podiums } = useVesselFacts();
  if (!podiums.length) return null;
  return (
    <section className="mb-10 rounded-3xl border bg-card p-5 md:p-7" aria-labelledby="palmares">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="palmares" className="font-display text-2xl font-bold">
            Le palmarès de la flotte
          </h2>
          <p className="text-sm text-muted-foreground">
            Pour le plaisir, entre les navires qui ont un départ à venir. Ces chiffres ne disent
            rien de la sécurité ni du confort.
          </p>
        </div>
        <ShareButtons
          title="Le palmarès des ferries Europe ↔ Algérie"
          text="⛴️ Le plus long, le doyen, le plus imposant : le palmarès des ferries Europe ↔ Algérie. Via BledWay"
        />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {podiums.map((podium) => (
          <div key={podium.key} className="rounded-2xl bg-muted/50 p-3">
            <h3 className="text-sm font-bold">{podium.title}</h3>
            <ol className="mt-2 grid gap-1 text-sm">
              {podium.places.map((place) => (
                <li key={place.vesselId} className="flex items-baseline gap-2">
                  <span className="w-4 shrink-0 font-bold text-primary">{place.rank}</span>
                  <span className="min-w-0 flex-1">
                    <Link
                      to="/"
                      search={{ select: "vessel", id: place.vesselId } as never}
                      className="font-semibold hover:underline"
                    >
                      {place.name}
                    </Link>{" "}
                    <VesselAlertTag vesselId={place.vesselId} />
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{place.value}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {podiums.some((podium) => podium.key === "rated") ? null : (
          <div className="rounded-2xl border border-dashed p-3 text-sm">
            <h3 className="font-bold">Le mieux noté</h3>
            <p className="mt-2 text-muted-foreground">
              Aucun navire n'a encore {MIN_REVIEWS} avis. Vous avez voyagé ? Donnez le vôtre depuis
              sa fiche.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
