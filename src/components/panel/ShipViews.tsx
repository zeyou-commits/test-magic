import { EntityReviews } from "./EntityReviews";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { useAuth } from "@/hooks/useAuth";
import { LivePulse, revealLive, useLiveInfo } from "./LivePulse";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  ExternalLink,
  MapPin,
  Megaphone,
  PenLine,
  Star,
  Users,
} from "lucide-react";
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
import type { Selection } from "@/lib/ferry/types";
import type { Departure } from "@/lib/ferry/types";
import { supabase } from "@/integrations/supabase/client";
import { DemoBadge, EmptyNote, Stars } from "./shared";
import { CompanyBadge } from "./CompanyBadge";
import { CrossingCard } from "./CrossingCard";
import { TravelSignals, VesselReviews } from "./TravelCommunity";
import { TripRecap } from "./TripRecap";
import { VesselIncidentNotice } from "./VesselIncidentNotice";
import { VesselAlertBanner, VesselPhotoAlert } from "./VesselAlert";
import { MakeMyTrip } from "./MakeMyTrip";
import { ReportButton } from "./ReportButton";
import { ShipPhoto, VesselSpecs } from "./VesselBits";
import { TripStatusPicker, VesselPresence } from "./TripPresence";

function useShipData(exactDepartureId?: string) {
  const exact = useQuery({
    queryKey: ["departure", exactDepartureId],
    enabled: Boolean(exactDepartureId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departures")
        .select("*")
        .eq("id", exactDepartureId!)
        .maybeSingle();
      if (error) throw new Error("Le suivi est momentanément indisponible.");
      return data as Departure | null;
    },
    retry: false,
    refetchInterval: 60_000,
  });
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);
  const live = useLiveShips();
  const fleet = useFleet();
  const departures = [
    ...new Map(
      [...recent, ...upcoming, ...(exact.data ? [exact.data] : [])].map((d) => [d.id, d]),
    ).values(),
  ];
  return { vessels, companies, routes, ports, departures, live, fleet, exact };
}

export function VesselView({
  vesselId,
  onSelect,
  contextDepartureId,
}: {
  vesselId: string;
  onSelect: (s: Selection) => void;
  contextDepartureId?: string;
}) {
  const data = useShipData(contextDepartureId);
  const { user, isAdmin } = useAuth();
  const communityAvailable = true;
  const guided = useQuery(entityReviewsQuery("vessel", vesselId));
  const [writeRating, setWriteRating] = useState(false);
  const [tab, setTab] = useState(contextDepartureId ? "onboard" : "tracking");

  useEffect(() => {
    if (user && window.sessionStorage.getItem(`bledway:rating:vessel:${vesselId}`))
      setTab("reviews");
  }, [user, vesselId]);
  // « Noter » : onglet Avis, formulaire ouvert (après connexion si besoin).
  const rateVessel = () => {
    setTab("reviews");
    setWriteRating(true);
  };
  // Infos BledWay de ses lignes à venir et de sa compagnie, signalements à bord.
  const vesselCompany = data.vessels.find((v) => v.id === vesselId)?.company_id;
  const liveInfo = useLiveInfo({
    routeIds: [
      ...new Set(
        data.departures
          .filter((d) => d.vessel_id === vesselId && Date.parse(d.departure_at) > Date.now())
          .map((d) => d.route_id),
      ),
    ],
    companyIds: vesselCompany ? [vesselCompany] : [],
    signalVesselIds: [vesselId],
  });
  const liveId = `live-vessel-${vesselId}`;
  const openLive = () => {
    setTab("tracking");
    revealLive(liveId);
  };
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
  const live = data.live.find(
    (s) =>
      s.vessel.id === vesselId && (!contextDepartureId || s.departure.id === contextDepartureId),
  );
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
  const automaticDeparture =
    (live
      ? departureForSignal(
          data.departures,
          vessel,
          live.position,
          data.routes,
          Date.now(),
          data.ports,
        )
      : null) ??
    data.departures.find((d) => d.id === ship?.departureId) ??
    next[0];
  const departure = contextDepartureId
    ? data.departures.find((d) => d.id === contextDepartureId && d.vessel_id === vesselId)
    : automaticDeparture;
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
        <VesselAlertBanner vesselId={vessel.id} />
        <VesselIncidentNotice vesselId={vessel.id} vesselName={vessel.name} />
        {liveInfo.official + liveInfo.travellers > 0 ? (
          <LivePulse info={liveInfo} onOpen={openLive} />
        ) : null}
        <div className="bw-ship-hero-photo bw-ship-hero-photo--compact">
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

          <div className="relative">
            <ShipPhoto key={photo?.url ?? vesselId} url={photo?.url} name={vessel.name} />
            <VesselPhotoAlert vesselId={vessel.id} />
          </div>
        </div>
      </header>
      {!vessel.is_demo ? (
        <MakeMyTrip kind="vessel" targetId={vessel.id} label={vessel.name} onSelect={onSelect} />
      ) : null}
      {!contextDepartureId && departure && from && to ? (
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
      <VesselPresence vesselId={vesselId} />
      {communityAvailable ? (
        <button type="button" className="pv-rating" onClick={() => setTab("reviews")}>
          {guided.data?.count ? (
            <>
              <Stars value={guided.data.average ?? 0} />
              <span>· {guided.data.count} avis</span>
            </>
          ) : (
            <>
              <span className="pv-stars-empty" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={15} />
                ))}
              </span>
              <span>Pas encore d’avis · soyez le premier à noter ce bateau</span>
            </>
          )}
        </button>
      ) : null}
      <div className="pv-actions pv-actions--two">
        <button type="button" onClick={requestVesselSignal} className="pv-action pv-action--signal">
          <span aria-hidden>
            <Megaphone size={18} />
          </span>
          Signaler
        </button>
        {communityAvailable ? (
          <button type="button" className="pv-action" onClick={rateVessel}>
            <span aria-hidden>
              <PenLine size={18} />
            </span>
            Noter
          </button>
        ) : null}
      </div>
      {liveInfo.official + liveInfo.travellers === 0 ? (
        <LivePulse info={liveInfo} onOpen={openLive} />
      ) : null}
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
          <TabsTrigger value="tracking">Suivi</TabsTrigger>
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
              {/* Où en êtes-vous ? Les 4 cabas, pour la traversée en cours ou la prochaine. */}
              <TripStatusPicker
                departureId={departure.id}
                departureAt={departure.departure_at}
                fromPortId={from.id}
              />
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
          <div id={liveId} data-live-anchor>
            <TravelSignals key={vesselId} kind="vessel" target={vesselId} compact />
          </div>
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
          <EntityReviews
            key={vesselId}
            kind="vessel"
            target={vesselId}
            openForm={writeRating}
            onFormClosed={() => setWriteRating(false)}
          />
          <VesselReviews key={`legacy-${vesselId}`} vesselId={vesselId} readOnly />
        </TabsContent>
      </Tabs>
      <div className="mt-2 px-1">
        <ReportButton
          targetType="vessel"
          targetId={vesselId}
          label="Ce navire semble immobilisé ?"
          initialReason="vessel_immobilized"
          variant="link"
        />
      </div>
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
  const data = useShipData(departureId);
  const departure = data.departures.find((d) => d.id === departureId);
  if (!departure && data.exact.isPending) return <EmptyNote>Chargement du suivi…</EmptyNote>;
  if (!departure && data.exact.isError)
    return (
      <EmptyNote>
        Le suivi est momentanément indisponible. Réessayez dans quelques instants.
      </EmptyNote>
    );
  if (!departure) return <EmptyNote>Traversée introuvable.</EmptyNote>;
  const route = data.routes.find((r) => r.id === departure.route_id);
  const from = data.ports.find((p) => p.id === route?.departure_port_id);
  const to = data.ports.find((p) => p.id === route?.arrival_port_id);
  if (!from || !to) return <EmptyNote>Traversée introuvable.</EmptyNote>;
  return (
    <TripRecap
      departure={departure}
      from={from}
      to={to}
      vessel={data.vessels.find((v) => v.id === departure.vessel_id)}
      company={data.companies.find((c) => c.id === departure.company_id)}
      live={data.live.find((s) => s.departure.id === departureId)}
      onSelect={onSelect}
    />
  );
}
