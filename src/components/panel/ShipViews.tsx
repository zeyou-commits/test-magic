import { ActionHub, revealBlock, type HubTile } from "./ActionHub";
import { RoomPicker, useRoomCounts } from "./RoomPicker";
import { VesselSeaBadge } from "./SeaForecast";
import { PlaceReactions } from "./PlaceReactions";
import { EntityReviews } from "./EntityReviews";
import { RateStars } from "./RateStars";
import { presetRating } from "@/lib/ferry/reviewCriteria";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { useAuth } from "@/hooks/useAuth";
import { revealLive, useLiveInfo } from "./LivePulse";
import { FlashFeed } from "./FlashFeed";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  ExternalLink,
  MapPin,
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
import { DemoBadge, EmptyNote } from "./shared";
import { CompanyBadge } from "./CompanyBadge";
import { CrossingCard } from "./CrossingCard";
import { TravelSignals, VesselReviews } from "./TravelCommunity";
import { TripRecap } from "./TripRecap";
import { VesselIncidentNotice } from "./VesselIncidentNotice";
import { VesselPhotoAlert, VesselPhotoInfo } from "./VesselAlert";
import { MakeMyTrip } from "./MakeMyTrip";
import { VesselAlertDepartures } from "./VesselAlertDepartures";
import { ReportButton } from "./ReportButton";
import { ShipPhoto, VesselSpecs } from "./VesselBits";
import { VesselIdentity, VesselPhotoBadge } from "./VesselFacts";
import { TripStatusPicker, VesselPresence } from "./TripPresence";
import { tr } from "@/lib/i18n";

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
  const [ratingNonce, setRatingNonce] = useState(0);
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
    vesselId,
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
  if (!vessel) return <EmptyNote>{tr("ui.shipViews.navireIntrouvable")}</EmptyNote>;
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
  // Le choix du salon : les traversées à venir, et celle qui vient de partir ou d'arriver.
  const roomCrossings = data.departures.filter(
    (d) =>
      d.vessel_id === vesselId &&
      d.status !== "cancelled" &&
      Date.parse(d.departure_at) >= Date.now() - 3 * 86_400_000,
  );
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
              <CompanyBadge
                name={company.name}
                logoUrl={company.logo_url}
                size={34}
                tone="framed"
              />
            </button>
          ) : null}
          <div className="min-w-0">
            <h2>{vessel.name}</h2>
            {company ? <p className="bw-ship-hero-company">{company.name}</p> : null}
          </div>
          {vessel.is_demo ? <DemoBadge /> : null}
          <PlaceReactions kind="vessel" target={vesselId} />
        </div>
        {!vessel.is_demo ? (
          <MakeMyTrip kind="vessel" targetId={vessel.id} label={vessel.name} onSelect={onSelect} />
        ) : null}
        <div className="bw-ship-hero-photo bw-ship-hero-photo--compact">
          <dl className="bw-ship-hero-stats" aria-label={tr("ui.shipViews.leNavireEnChiffres")}>
            <div>
              <CalendarDays size={12} aria-hidden />
              <dt>{tr("ui.shipViews.age")}</dt>
              <dd>
                {vessel.build_year && vessel.build_year <= new Date().getFullYear()
                  ? `${new Date().getFullYear() - vessel.build_year} ans`
                  : "—"}
              </dd>
            </div>
            <div>
              <Users size={12} aria-hidden />
              <dt>{tr("ui.shipViews.passagers")}</dt>
              <dd>{vessel.passenger_capacity?.toLocaleString("fr-FR") ?? "—"}</dd>
            </div>
            <div>
              <CarFront size={12} aria-hidden />
              <dt>{tr("ui.shipViews.vehicules")}</dt>
              <dd>{vessel.car_capacity?.toLocaleString("fr-FR") ?? "—"}</dd>
            </div>
          </dl>

          <div className="relative">
            <ShipPhoto key={photo?.url ?? vesselId} url={photo?.url} name={vessel.name} />
            <VesselPhotoAlert vesselId={vessel.id} />
            <VesselPhotoBadge vesselId={vessel.id} />
            {departure && from && to ? (
              <VesselSeaBadge
                departureId={departure.id}
                from={from}
                to={to}
                departureAt={departure.departure_at}
                arrivalAt={departure.arrival_at ?? null}
              />
            ) : null}
            <VesselPhotoInfo count={liveInfo.official + liveInfo.travellers} onOpen={openLive} />
          </div>
        </div>
      </header>
      <VesselIncidentNotice vesselId={vessel.id} vesselName={vessel.name} />
      <VesselAlertDepartures vesselId={vessel.id} onSelect={onSelect} />
      {!contextDepartureId && departure && from && to ? (
        <div className="bw-ship-crossing-first">
          <CrossingCard departure={departure} from={from} to={to} live={live} />
        </div>
      ) : null}
      {isAdmin && (vessel.imo || vessel.mmsi) ? (
        <aside className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="mb-1 font-semibold">{tr("ui.shipViews.controleAdminDuSuivi")}</p>
          <p className="mb-2 text-muted-foreground">
            {live
              ? `Signal AIS associé · âge ${Math.round(live.ageMinutes)} min`
              : tr("ui.shipViews.aucunSignalAisAssociePosition")}
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
            {tr("ui.shipViews.voirSurVesselfinder")}<ExternalLink size={14} aria-hidden />
          </a>
        </aside>
      ) : null}
      <VesselPresence vesselId={vesselId} departureId={departure?.id} />
      {communityAvailable ? (
        <div className="pv-rating">
          <RateStars
            average={guided.data?.average}
            count={guided.data?.count ?? 0}
            subject="ce navire"
            onRate={(score) => {
              presetRating("vessel", vesselId, score);
              setRatingNonce((n) => n + 1);
              rateVessel();
            }}
            onOpen={() => setTab("reviews")}
          />
        </div>
      ) : null}
      <VesselHub
        departures={roomCrossings}
        onWhere={
          departure
            ? () => {
                setTab("tracking");
                revealBlock(".bw-trip-status, .bw-trip-status-teaser");
              }
            : undefined
        }
        signals={liveInfo.official + liveInfo.travellers}
        onSignal={liveInfo.official + liveInfo.travellers ? openLive : requestVesselSignal}
        onSelect={onSelect}
      />
      {photo?.source === "commons" ? (
        <details className="bw-photo-credit">
          <summary>{tr("ui.shipViews.creditPhoto")}</summary>
          {photo.credit} · {photo.license}
          {photo.pageUrl ? (
            <>
              {" "}
              ·{" "}
              <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer">
                {tr("ui.shipViews.wikimediaCommons")}
              </a>
            </>
          ) : null}
        </details>
      ) : null}
      <Tabs value={activeTab} onValueChange={setTab} className="bw-ship-tabs">
        <TabsList aria-label={tr("ui.shipViews.ficheDuNavire")}>
          <TabsTrigger value="tracking">{tr("ui.shipViews.suivi")}</TabsTrigger>
          <TabsTrigger value="onboard">{tr("ui.shipViews.aBord")}</TabsTrigger>
          {communityAvailable ? (
            <TabsTrigger value="reviews">
              <Star size={14} aria-hidden />
              {tr("ui.shipViews.avis")}
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
                arrivalAt={departure.arrival_at}
                fromPortId={from.id}
              />
              <button
                className="bw-detail-link"
                type="button"
                onClick={() => onSelect({ type: "departure", id: departure.id })}
              >
                {Date.parse(departure.departure_at) <= Date.now()
                  ? tr("ui.shipViews.voirCetteTraversee")
                  : tr("ui.shipViews.preparerCetteTraversee")}
                <ArrowRight size={16} aria-hidden />
              </button>
            </>
          ) : (
            <p className="bw-community-empty">
              {tr("ui.shipViews.lesProchainesTraverseesSerontAffichees")}
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
              {tr("ui.shipViews.voirSurLaCarte")}
            </button>
          ) : null}
          <div id={liveId} data-live-anchor>
            <FlashFeed
              title={tr("ui.shipViews.infosSurCeNavire")}
              context={{
                vesselId,
                attachedOnly: true,
                routeIds: [...new Set(next.map((d) => d.route_id))],
                companyIds: vessel.company_id ? [vessel.company_id] : [],
              }}
              withSignals={false}
              expandFirst
              onSelect={onSelect}
            />
            <TravelSignals key={vesselId} kind="vessel" target={vesselId} compact />
          </div>
          {next.length ? (
            <section className="bw-next-crossings">
              <div className="bw-section-heading">
                <h3>{tr("ui.shipViews.prochainesTraversees")}</h3>
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
            <h3>{tr("ui.shipViews.faitesConnaissanceAvec")}{vessel.name}</h3>
            {vessel.description ? <p>{vessel.description}</p> : null}
            <VesselIdentity vesselId={vessel.id} />
            <VesselSpecs vessel={vessel} />
            {communityAvailable ? (
              <div className="bw-community-invite">
                <Users size={25} aria-hidden />
                <h3>{tr("ui.shipViews.vousConnaissezCeNavire")}</h3>
                <p>{tr("ui.shipViews.votreExperienceAideLesFamilles")}</p>
                <Button variant="outline" onClick={() => setTab("reviews")}>
                  {tr("ui.shipViews.partagerMonAvis")}
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
            nonce={ratingNonce}
          />
          <VesselReviews key={`legacy-${vesselId}`} vesselId={vesselId} readOnly />
        </TabsContent>
      </Tabs>
      <div className="mt-2 px-1">
        <ReportButton
          targetType="vessel"
          targetId={vesselId}
          label={tr("ui.shipViews.ceNavireSembleImmobilise")}
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
  if (!departure && data.exact.isPending) return <EmptyNote>{tr("ui.shipViews.chargementDuSuivi")}</EmptyNote>;
  if (!departure && data.exact.isError)
    return (
      <EmptyNote>
        {tr("ui.shipViews.leSuiviEstMomentanementIndisponible")}
      </EmptyNote>
    );
  if (!departure) return <EmptyNote>{tr("ui.shipViews.traverseeIntrouvable")}</EmptyNote>;
  const route = data.routes.find((r) => r.id === departure.route_id);
  const from = data.ports.find((p) => p.id === route?.departure_port_id);
  const to = data.ports.find((p) => p.id === route?.arrival_port_id);
  if (!from || !to) return <EmptyNote>{tr("ui.shipViews.traverseeIntrouvable")}</EmptyNote>;
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

/** Les tuiles de la fiche bateau, et le choix de la traversée ou de la ligne. */
function VesselHub({
  departures,
  onWhere,
  signals,
  onSignal,
  onSelect,
}: {
  departures: { id: string; departure_at: string; route_id: string }[];
  onWhere: (() => void) | undefined;
  signals: number;
  onSignal: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const [picker, setPicker] = useState<"salon" | "questions" | null>(null);
  const counts = useRoomCounts(departures.map((item) => item.id)).data;
  const total = [...(counts?.values() ?? [])].reduce((sum, count) => sum + count, 0);
  const tiles: HubTile[] = [
    ...(departures.length
      ? ([
          { id: "salon", label: "Salon", count: total, onClick: () => setPicker("salon") },
          { id: "questions", label: "Questions", onClick: () => setPicker("questions") },
        ] as HubTile[])
      : []),
    ...(onWhere ? ([{ id: "where", label: "Vous êtes où ?", onClick: onWhere }] as HubTile[]) : []),
    { id: "report", label: "Signaler", count: signals, onClick: onSignal },
  ];
  return (
    <>
      <ActionHub tiles={tiles} />
      <RoomPicker
        departures={departures}
        onSelect={onSelect}
        open={picker !== null}
        onOpenChange={(next) => setPicker(next ? "salon" : null)}
        questionsFirst={picker === "questions"}
      />
    </>
  );
}
