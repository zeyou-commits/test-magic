import { useAuth } from "@/hooks/useAuth";
import { communityQuery } from "@/lib/ferry/community";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CarFront, ExternalLink, Flag, MapPin, Ship, Star, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { useFleet } from "@/lib/ferry/useFleet";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { departureForSignal } from "@/lib/ferry/tracking";
import { portTimeZone } from "@/lib/ferry/time";
import { formatDateTime } from "@/lib/ferry/format";
import { getBoardingMilestones } from "@/lib/ferry/boarding";
import type { Departure, Port, Selection, Vessel } from "@/lib/ferry/types";
import { BookingLink, DemoBadge, EmptyNote, ReliabilityNote } from "./shared";
import { CompanyBadge } from "./CompanyBadge";
import { CrossingCard } from "./CrossingCard";
import { TravelSignals, VesselReviews } from "./TravelCommunity";
import { ReportButton } from "./ReportButton";
import { FollowButton } from "./FollowButton";
import { JourneyChecklist } from "./JourneyChecklist";

function useShipData() {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);
  const live = useLiveShips();
  const fleet = useFleet();
  const departures = [...new Map([...recent, ...upcoming].map((d) => [d.id, d])).values()];
  return { vessels, companies, routes, ports, departures, live, fleet };
}

export function VesselView({
  vesselId,
  onSelect,
}: {
  vesselId: string;
  onSelect: (s: Selection) => void;
}) {
  const data = useShipData();
  const { user, isAdmin } = useAuth();
  const community = useQuery(communityQuery("vessel", vesselId, false, user?.id));
  const communityAvailable = Boolean(community.data);
  const [tab, setTab] = useState("tracking");
  const requestVesselSignal = useCallback(() => {
    setTab("tracking");
    window.setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent("batogo:open-signal", { detail: { kind: "vessel", target: vesselId } }),
        ),
      80,
    );
  }, [vesselId]);
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: string; target: string }>).detail;
      if (detail?.kind === "vessel" && detail.target === vesselId) requestVesselSignal();
    };
    window.addEventListener("batogo:show-signal", onRequest);
    return () => window.removeEventListener("batogo:show-signal", onRequest);
  }, [requestVesselSignal, vesselId]);
  const activeTab = tab === "reviews" && !communityAvailable ? "tracking" : tab;
  const vessel = data.vessels.find((v) => v.id === vesselId);
  const photo = useQuery({
    ...vesselPhotoQuery(vessel ?? { id: "", name: "", photo_url: null }),
    enabled: Boolean(vessel),
  }).data;
  if (!vessel) return <EmptyNote>Navire introuvable.</EmptyNote>;
  const company = data.companies.find((c) => c.id === vessel.company_id);
  const live = data.live.find((s) => s.vessel.id === vesselId);
  const ship = data.fleet.find((s) => s.vesselId === vesselId);
  const next = data.departures
    .filter(
      (d) =>
        d.vessel_id === vesselId &&
        d.status !== "cancelled" &&
        Date.parse(d.departure_at) >= Date.now(),
    )
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at))
    .slice(0, 5);
  const departure =
    (live
      ? departureForSignal(data.departures, vessel, live.position, data.routes, Date.now())
      : null) ??
    data.departures.find((d) => d.id === ship?.departureId) ??
    next[0];
  const route = data.routes.find((r) => r.id === departure?.route_id);
  const from = data.ports.find((p) => p.id === route?.departure_port_id);
  const to = data.ports.find((p) => p.id === route?.arrival_port_id);
  return (
    <article className="bw-ship-profile">
      <header className="bw-ship-hero">
        <div className="bw-ship-hero-title">
          {company ? (
            <button
              type="button"
              className="bw-ship-hero-logo"
              aria-label={`Voir la compagnie ${company.name}`}
              onClick={() => onSelect({ type: "company", id: company.id })}
            >
              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={34} />
            </button>
          ) : null}
          <div className="min-w-0">
            <h2>{vessel.name}</h2>
            {company ? <p className="bw-ship-hero-company">{company.name}</p> : null}
          </div>
          {vessel.is_demo ? <DemoBadge /> : null}
        </div>
        <div className="bw-ship-hero-photo">
          <ShipPhoto key={photo?.url ?? vesselId} url={photo?.url} name={vessel.name} />
        </div>
        <dl className="bw-ship-hero-stats" aria-label="Le bateau en chiffres">
          <div>
            <CalendarDays size={12} aria-hidden />
            <dt>Âge</dt>
            <dd>
              {vessel.build_year && vessel.build_year <= new Date().getFullYear()
                ? `${new Date().getFullYear() - vessel.build_year} ans`
                : "—"}
            </dd>
          </div>
          <div>
            <Users size={12} aria-hidden />
            <dt>Passagers</dt>
            <dd>{vessel.passenger_capacity?.toLocaleString("fr-FR") ?? "—"}</dd>
          </div>
          <div>
            <CarFront size={12} aria-hidden />
            <dt>Véhicules</dt>
            <dd>{vessel.car_capacity?.toLocaleString("fr-FR") ?? "—"}</dd>
          </div>
        </dl>
      </header>
      {departure && from && to ? (
        <div className="bw-ship-crossing-first">
          <CrossingCard departure={departure} from={from} to={to} live={live} />
        </div>
      ) : null}
      {isAdmin && (vessel.imo || vessel.mmsi) ? (
        <aside className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="mb-1 font-semibold">Contrôle admin du suivi</p>
          <p className="mb-2 text-muted-foreground">
            {live
              ? `Signal AIS associé · âge ${Math.round(live.ageMinutes)} min`
              : "Aucun signal AIS associé : position estimée selon les horaires."}
          </p>
          <a
            className="bw-detail-link"
            href={
              vessel.imo
                ? `https://www.vesselfinder.com/?imo=${vessel.imo}`
                : `https://www.vesselfinder.com/?mmsi=${vessel.mmsi}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir sur VesselFinder <ExternalLink size={14} aria-hidden />
          </a>
        </aside>
      ) : null}
      <button
        type="button"
        onClick={requestVesselSignal}
        className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
      >
        <Flag size={17} aria-hidden /> Signaler une info sur ce bateau
      </button>
      {photo?.source === "commons" ? (
        <details className="bw-photo-credit">
          <summary>Crédit photo</summary>
          {photo.credit} · {photo.license}
          {photo.pageUrl ? (
            <>
              {" "}
              ·{" "}
              <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer">
                Wikimedia Commons
              </a>
            </>
          ) : null}
        </details>
      ) : null}
      <Tabs value={activeTab} onValueChange={setTab} className="bw-ship-tabs">
        <TabsList aria-label="Fiche du navire">
          <TabsTrigger value="tracking">Ma traversée</TabsTrigger>
          <TabsTrigger value="onboard">À bord</TabsTrigger>
          {communityAvailable ? (
            <TabsTrigger value="reviews">
              <Star size={14} aria-hidden />
              Avis
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="tracking" forceMount hidden={activeTab !== "tracking"}>
          {departure && from && to ? (
            <>
              <button
                className="bw-detail-link"
                type="button"
                onClick={() => onSelect({ type: "departure", id: departure.id })}
              >
                Préparer cette traversée
                <ArrowRight size={16} aria-hidden />
              </button>
            </>
          ) : (
            <p className="bw-community-empty">
              Les prochaines traversées seront affichées ici dès leur publication.
            </p>
          )}
          {ship ? (
            <button
              className="bw-map-button"
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("batogo:focus-vessel", { detail: { vesselId } }),
                )
              }
            >
              <MapPin size={16} aria-hidden />
              Repérer sur la carte
            </button>
          ) : null}
          <TravelSignals key={vesselId} kind="vessel" target={vesselId} />
          {next.length ? (
            <section className="bw-next-crossings">
              <div className="bw-section-heading">
                <h3>Prochaines traversées</h3>
                <small>{next.length}</small>
              </div>
              <ul>
                {next.map((d) => {
                  const r = data.routes.find((r) => r.id === d.route_id);
                  const a = data.ports.find((p) => p.id === r?.departure_port_id);
                  const b = data.ports.find((p) => p.id === r?.arrival_port_id);
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onSelect({ type: "departure", id: d.id })}
                      >
                        <div>
                          <strong>
                            {a?.name} → {b?.name}
                          </strong>
                          <span>{formatDateTime(d.departure_at, portTimeZone(a))}</span>
                        </div>
                        <ArrowRight size={17} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </TabsContent>
        <TabsContent value="onboard" forceMount hidden={activeTab !== "onboard"}>
          <section className="bw-onboard">
            <h3>Faites connaissance avec {vessel.name}</h3>
            {vessel.description ? <p>{vessel.description}</p> : null}
            <VesselSpecs vessel={vessel} />
            {communityAvailable ? (
              <div className="bw-community-invite">
                <Users size={25} aria-hidden />
                <h3>Vous connaissez ce bateau ?</h3>
                <p>Votre expérience aide les familles à préparer leur voyage.</p>
                <Button variant="outline" onClick={() => setTab("reviews")}>
                  Partager mon avis
                </Button>
              </div>
            ) : null}
          </section>
        </TabsContent>
        <TabsContent value="reviews" forceMount hidden={activeTab !== "reviews"}>
          <VesselReviews key={vesselId} vesselId={vesselId} />
        </TabsContent>
      </Tabs>
    </article>
  );
}

export function DepartureView({
  departureId,
  onSelect,
}: {
  departureId: string;
  onSelect: (s: Selection) => void;
}) {
  const data = useShipData();
  const departure = data.departures.find((d) => d.id === departureId);
  if (!departure) return <EmptyNote>Traversée introuvable.</EmptyNote>;
  const route = data.routes.find((r) => r.id === departure.route_id);
  const from = data.ports.find((p) => p.id === route?.departure_port_id);
  const to = data.ports.find((p) => p.id === route?.arrival_port_id);
  const vessel = data.vessels.find((v) => v.id === departure.vessel_id);
  const company = data.companies.find((c) => c.id === departure.company_id);
  const live = data.live.find((s) => s.departure.id === departureId);
  return (
    <article className="bw-departure-profile">
      <header className="bw-section-heading">
        <div>
          <span className="bw-eyebrow">Votre voyage</span>
          <h2>Cap sur {to?.name ?? "votre destination"}</h2>
        </div>
        <ReportButton targetType="departure" targetId={departureId} />
      </header>
      {from && to ? <CrossingCard departure={departure} from={from} to={to} live={live} /> : null}
      <div className="my-3">
        <FollowButton
          kind="departure"
          targetId={departureId}
          label={`${from?.name ?? "Départ"} → ${to?.name ?? "Arrivée"}`}
          demo={Boolean(departure.is_demo)}
        />
      </div>
      {from && (
        <JourneyChecklist
          departureId={departureId}
          departureAt={departure.departure_at}
          port={from}
        />
      )}
      {vessel ? (
        <button
          className="bw-vessel-switch"
          type="button"
          onClick={() => onSelect({ type: "vessel", id: vessel.id })}
        >
          <span className="bw-vessel-switch-icon">
            <Ship size={22} aria-hidden />
          </span>
          <span>
            <small>Votre bateau · avis et vie à bord</small>
            <strong>{vessel.name}</strong>
          </span>
          <ArrowRight size={18} aria-hidden />
        </button>
      ) : null}
      {from ? <BoardingGuide departure={departure} port={from} /> : null}
      <div className="bw-port-links">
        {[from, to].map((port, i) =>
          port ? (
            <button
              type="button"
              key={`${i}-${port.id}`}
              onClick={() => onSelect({ type: "port", id: port.id })}
            >
              <MapPin size={17} aria-hidden />
              <span>
                <small>{i === 0 ? "Port de départ" : "Port d’arrivée"}</small>
                <strong>{port.name}</strong>
              </span>
              <ArrowRight size={15} aria-hidden />
            </button>
          ) : null,
        )}
      </div>
      {vessel ? <TravelSignals key={vessel.id} kind="vessel" target={vessel.id} /> : null}
      {departure.status !== "cancelled" ? <BookingLink company={company} /> : null}
      {company ? (
        <button
          className="bw-detail-link"
          type="button"
          onClick={() => onSelect({ type: "company", id: company.id })}
        >
          <CompanyBadge name={company.name} logoUrl={company.logo_url} size={20} />
          {company.name}
          <ArrowRight size={15} aria-hidden />
        </button>
      ) : null}
      {departure.notes ? (
        <section className="bw-onboard">
          <h3>À savoir avant de partir</h3>
          <p>{departure.notes}</p>
        </section>
      ) : null}
      <details className="bw-source-details">
        <summary>Source des horaires</summary>
        <ReliabilityNote
          reliability={departure.reliability}
          sourceName={departure.source_name}
          sourceUrl={departure.source_url}
          verifiedAt={departure.last_verified_at}
        />
      </details>
    </article>
  );
}
function BoardingGuide({ departure, port }: { departure: Departure; port: Port }) {
  const car = getBoardingMilestones(departure.departure_at, port, { hasVehicle: true });
  const pedestrian = getBoardingMilestones(departure.departure_at, port, { hasVehicle: false });
  if (
    !car ||
    !pedestrian ||
    departure.status === "cancelled" ||
    Date.parse(departure.departure_at) < Date.now()
  )
    return null;
  return (
    <details className="bw-boarding-guide">
      <summary>Quand arriver au port ?</summary>
      <div>
        <p>Repères conseillés · heure locale du port</p>
        <dl>
          <div>
            <dt>
              <CarFront size={18} aria-hidden />
              Avec un véhicule
            </dt>
            <dd>{car.callLabel}</dd>
          </div>
          <div>
            <dt>
              <Users size={18} aria-hidden />À pied
            </dt>
            <dd>{pedestrian.callLabel}</dd>
          </div>
        </dl>
        <small>L’heure de convocation de votre billet reste la référence.</small>
      </div>
    </details>
  );
}
function VesselSpecs({ vessel }: { vessel: Vessel }) {
  const items = [
    { label: "Passagers", value: vessel.passenger_capacity?.toLocaleString("fr-FR") },
    { label: "Véhicules", value: vessel.car_capacity?.toLocaleString("fr-FR") },
    { label: "Longueur", value: vessel.length_meters ? `${vessel.length_meters} m` : null },
    { label: "Mise en service", value: vessel.build_year },
    { label: "Vitesse", value: vessel.speed_knots ? `${vessel.speed_knots} nœuds` : null },
    { label: "Type", value: vessel.vessel_type },
  ].filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  return items.length ? (
    <dl className="bw-vessel-specs">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}

function ShipPhoto({ url, name }: { url: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="bw-ship-photo">
      <Ship size={32} aria-hidden />
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          width={88}
          height={80}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
