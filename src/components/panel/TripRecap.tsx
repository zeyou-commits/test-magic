import { useState } from "react";
import { TripTravellers } from "@/components/community/TripTravellers";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TripShare } from "./TripShare";
import { VesselMiniCard } from "./VesselMiniCard";
import {
  Anchor,
  ArrowRight,
  CarFront,
  ClipboardCheck,
  Footprints,
  MapPin,
  Megaphone,
  Ship,
  Radio,
  Timer,
} from "lucide-react";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { departureStopped, incidentForVessel, incidentsQuery } from "@/lib/ferry/incidents";
import { getBoardingMilestones } from "@/lib/ferry/boarding";
import { formatDuration } from "@/lib/ferry/format";
import { dateKeyInZone, portTimeZone, zoneLabel } from "@/lib/ferry/time";
import type { LiveShip } from "@/lib/ferry/tracking";
import type { Company, Departure, Port, Selection, Vessel } from "@/lib/ferry/types";
import { requestQuickReport } from "@/components/map/QuickReport";
import { BookingLink, ReliabilityNote } from "./shared";
import { FlashFeed } from "./FlashFeed";
import { hasSignalFocus, LivePulse, revealLive, useLiveInfo } from "./LivePulse";
import { VesselElsewhereNotice } from "./VesselElsewhereNotice";
import { DepartureIncidentNotice } from "./VesselIncidentNotice";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { VesselAlertBanner } from "./VesselAlert";
import { MakeMyTrip } from "./MakeMyTrip";
import { HelpRequests } from "@/components/community/HelpRequests";
import { FollowButton } from "./FollowButton";
import { JourneyChecklist } from "./JourneyChecklist";
import { JourneyPlanner } from "./JourneyPlanner";
import { MiniFerry } from "./MiniFerry";
import { TripChanges } from "./MyTrip";
import { PushStatusLine } from "./PushStatusLine";
import { ReportButton } from "./ReportButton";
import { TravelSignals } from "./TravelCommunity";
import { PortPresence, TripStatusPicker, VesselPresence } from "./TripPresence";
import { VesselSpecs } from "./VesselBits";

const HOUR = 3_600_000;
const time = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
const day = (iso: string, timeZone: string) => {
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
/** Jours calendaires entre aujourd'hui et le départ, vus depuis le port de départ. */
function daysUntil(iso: string, timeZone: string) {
  const today = Date.parse(`${dateKeyInZone(new Date(), timeZone)}T12:00:00Z`);
  const target = Date.parse(`${dateKeyInZone(iso, timeZone)}T12:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

type Tab = "prepare" | "live" | "ship";

/**
 * « Votre traversée » : un récapitulatif lisible d'un coup d'œil (billet, ce qui se passe, bateau),
 * puis le détail en trois onglets. Les données viennent des mêmes sources que la carte.
 */
export function TripRecap({
  departure,
  from,
  to,
  vessel,
  company,
  live,
  onSelect,
}: {
  departure: Departure;
  from: Port;
  to: Port;
  vessel: Vessel | undefined;
  company: Company | undefined;
  live: LiveShip | undefined;
  onSelect: (selection: Selection) => void;
}) {
  const { user } = useAuth();
  const follow = useQuery({
    queryKey: ["follow", user?.id, "departure", departure.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await (typedSupabase as unknown as SupabaseClient)
        .from("bw_follows")
        .select("id,active,traveller,follow_purpose")
        .eq("user_id", user!.id)
        .eq("target_kind", "departure")
        .eq("target_id", departure.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        active: boolean;
        traveller: boolean;
        follow_purpose: string | null;
      } | null;
    },
    retry: false,
  });
  // Une traversée suivie par curiosité ou pour un proche n'est pas « Ma traversée ».
  const myDeparture = Boolean(follow.data?.active && follow.data.traveller);
  const heading = myDeparture ? "Ma traversée" : "Cette traversée";
  const fromZone = portTimeZone(from);
  const toZone = portTimeZone(to);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const stopped = departureStopped(incidentForVessel(incidents, departure.vessel_id), departure);
  const vesselAlert = useVesselAlert(departure.vessel_id);
  const progress = crossingProgress(departure, from, to, live, Date.now(), stopped);
  const { times } = progress;
  const departIso = times.departure.iso ?? departure.departure_at;
  const car = getBoardingMilestones(departIso, from, {
    presentationMinutes: departure.presentation_minutes,
  });
  const walk = getBoardingMilestones(departIso, from, {
    presentationMinutes: departure.presentation_minutes,
    onFoot: true,
  });
  const arriveIso = times.arrival.iso;
  const nextDay =
    arriveIso && dateKeyInZone(arriveIso, toZone) !== dateKeyInZone(departIso, fromZone);
  const shift = times.departure.shiftMinutes ?? times.arrival.shiftMinutes;
  const now = Date.now();
  const cancelled = departure.status === "cancelled";
  const arrived =
    times.arrival.kind === "observed" || (arriveIso ? Date.parse(arriveIso) < now : false);
  const { hold } = progress;
  const atSea =
    !arrived &&
    !hold &&
    !stopped &&
    (progress.signal?.phase === "sea" || Date.parse(departIso) < now);
  const status = cancelled
    ? { tone: "bad", label: "Annulée" }
    : arrived && !stopped
      ? { tone: "done", label: "Arrivée" }
      : stopped
        ? { tone: "bad", label: vesselAlert?.label ?? "Navire immobilisé" }
        : vesselAlert && Date.parse(departIso) > now
          ? { tone: "bad", label: `${vesselAlert.label} · départ à confirmer` }
        : hold
          ? { tone: "warn", label: hold.fresh ? "Encore à quai" : "Départ à confirmer" }
          : atSea
            ? { tone: "live", label: "En mer" }
            : shift !== null && shift >= 5
              ? { tone: "warn", label: `Retard ≈ ${formatDuration(shift)}` }
              : departure.status === "modified"
                ? { tone: "warn", label: "Horaire modifié" }
                : { tone: "ok", label: "Prévue" };
  const days = daysUntil(departIso, fromZone);
  const countdown =
    cancelled || arrived || atSea || hold || vesselAlert
      ? null
      : days <= 0
        ? "Aujourd’hui"
        : days === 1
          ? "Demain"
          : `J-${days}`;
  // Arrivée « pas avant » : un minimum, la durée de traversée reste celle de l'horaire.
  const durationEnd = times.arrival.notBefore ? times.arrival.scheduledIso : arriveIso;
  const duration =
    durationEnd && Date.parse(durationEnd) > Date.parse(departIso)
      ? Math.round((Date.parse(durationEnd) - Date.parse(departIso)) / 60_000)
      : departure.duration_minutes;

  // Ce qui se passe : même calcul que sur les fiches port et bateau.
  const info = useLiveInfo({
    departureId: departure.id,
    routeIds: [departure.route_id],
    portIds: [from.id, to.id],
    companyIds: departure.company_id ? [departure.company_id] : [],
    signalPortIds: [from.id],
    signalVesselIds: vessel ? [vessel.id] : [],
    vesselId: departure.vessel_id,
  });
  const liveCount = info.official + info.travellers;
  const liveId = `live-${departure.id}`;
  const [tab, setTab] = useState<Tab | null>(null);
  const activeTab: Tab = tab ?? (liveCount || hasSignalFocus() ? "live" : "prepare");
  const openLive = () => {
    setTab("live");
    revealLive(liveId);
  };
  const report = () =>
    requestQuickReport({
      type: "departure",
      id: departure.id,
      portId: from.id,
      vesselId: vessel?.id ?? null,
    });

  const upcoming = !cancelled && Date.parse(departure.departure_at) > now;

  return (
    <article className="bw-recap">
      {/* Une alerte passe avant tout le reste. */}
      {!cancelled && !arrived ? <VesselAlertBanner vesselId={departure.vessel_id} onDeparture /> : null}
      {!cancelled ? <DepartureIncidentNotice departure={departure} /> : null}
      {/* 1. Le billet */}
      <section className="bw-recap__ticket" data-tone={status.tone} aria-label={heading}>
        <header className="bw-recap__head">
          <div>
            <span className="bw-recap__kicker">
              {heading}
              {countdown ? <b>{countdown}</b> : null}
            </span>
            <p className="bw-recap__date">
              {day(departIso, fromZone)}
              <span className="bw-recap__status" data-tone={status.tone}>
                {status.tone === "live" ? <Radio size={12} aria-hidden /> : null}
                {status.label}
              </span>
            </p>
          </div>
          <div className="bw-recap__personal-actions">
            <TripShare
              departureId={departure.id}
              from={from.name}
              to={to.name}
              departureAt={departIso}
              timeZone={fromZone}
            />
            <FollowButton
              kind="departure"
              targetId={departure.id}
              iconOnly
              label={`${from.name} → ${to.name}`}
              demo={Boolean(departure.is_demo)}
            />
          </div>
        </header>

        <div className="bw-recap__route">
          <button
            type="button"
            className="bw-recap__end"
            onClick={() => onSelect({ type: "port", id: from.id })}
          >
            <strong>{time(departIso, fromZone)}</strong>
            <span>{from.name}</span>
            <small>{zoneLabel(fromZone)}</small>
          </button>
          <div className="bw-recap__line" aria-hidden={progress.ratio === null}>
            <span className="bw-recap__anchor">
              <Anchor size={13} aria-hidden />
            </span>
            <span className="bw-recap__track">
              <span style={{ width: `${(progress.ratio ?? 0) * 100}%` }} />
              <i style={{ left: `${Math.max(6, Math.min(94, (progress.ratio ?? 0) * 100))}%` }}>
                <MiniFerry size={40} />
              </i>
            </span>
            <span className="bw-recap__anchor">
              <Anchor size={13} aria-hidden />
            </span>
            <small className="bw-recap__duration">
              <Timer size={11} aria-hidden /> {formatDuration(duration)}
              {progress.ratio !== null && progress.ratio > 0 && !arrived
                ? ` · ${Math.round(progress.ratio * 100)} %`
                : ""}
            </small>
          </div>
          <button
            type="button"
            className="bw-recap__end bw-recap__end--to"
            onClick={() => onSelect({ type: "port", id: to.id })}
          >
            {times.arrival.notBefore ? <small>pas avant</small> : null}
            <strong>
              {arriveIso ? time(arriveIso, toZone) : "—"}
              {nextDay ? <sup>+1</sup> : null}
            </strong>
            <span>{to.name}</span>
            <small>{zoneLabel(toZone)}</small>
          </button>
        </div>
        {shift !== null && Math.abs(shift) >= 5 && times.departure.scheduledIso ? (
          <p className="bw-recap__shift">
            Prévu à {time(times.departure.scheduledIso, fromZone)} ·{" "}
            {shift > 0
              ? `${times.arrival.notBefore ? "retard d'au moins" : "retard estimé"} ${formatDuration(shift)}`
              : `avance ${formatDuration(-shift)}`}
          </p>
        ) : null}

        <div className="bw-recap__vessel-summary">
          {vessel ? (
            <VesselMiniCard
              vessel={vessel}
              company={company}
              onOpen={() => onSelect({ type: "vessel", id: vessel.id })}
              onCompanyOpen={
                company ? () => onSelect({ type: "company", id: company.id }) : undefined
              }
            />
          ) : (
            <span className="bw-recap__chip-muted">Navire à confirmer</span>
          )}
          {!vessel && company ? (
            <button type="button" onClick={() => onSelect({ type: "company", id: company.id })}>
              {company.name}
            </button>
          ) : null}
        </div>
      </section>

      {myDeparture ? <JourneyPlanner departureId={departure.id} onSelect={onSelect} /> : null}
      {upcoming && !departure.is_demo ? (
        <MakeMyTrip kind="departure" targetId={departure.id} label={`${from.name} → ${to.name}`} />
      ) : null}

      {/* 2. Ce qui se passe, d'un coup d'œil */}
      <LivePulse info={info} onOpen={openLive} onReport={upcoming || atSea ? report : undefined} />
      {!cancelled ? <VesselElsewhereNotice departure={departure} /> : null}
      {!cancelled && upcoming ? <HelpRequests kind="departure" scopeId={departure.id} /> : null}

      {/* 3. Où en êtes-vous ? (une ligne tant que ce n'est pas la veille) */}
      {!cancelled && myDeparture ? (
        <TripStatusPicker
          departureId={departure.id}
          departureAt={departure.departure_at}
          fromPortId={from.id}
        />
      ) : null}

      {/* 3 bis. Les voyageurs de la traversée, leur cabas et leur humeur */}
      <TripTravellers
        departureId={departure.id}
        departureAt={departure.departure_at}
        arrivalAt={arriveIso ?? null}
      />

      {/* 4. Le détail */}
      <div className="bw-recap__tabs" role="tablist" aria-label="Détail de la traversée">
        {(
          [
            ["prepare", "Préparer", ClipboardCheck],
            ["live", "En direct", Radio],
            ["ship", "Bateau", Ship],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={14} aria-hidden /> {label}
            {id === "live" && info.official ? <b data-kind="official">{info.official}</b> : null}
            {id === "live" && info.travellers ? <b>{info.travellers}</b> : null}
          </button>
        ))}
      </div>

      {activeTab === "prepare" ? (
        <div className="bw-recap__panel" role="tabpanel">
          {upcoming && car && walk ? (
            <div className="bw-recap__arrive">
              <p>
                Être à {from.name}{" "}
                <small>
                  ({day(car.callTime.toISOString(), fromZone)}, {zoneLabel(fromZone)})
                </small>
              </p>
              <div>
                <span>
                  <CarFront size={16} aria-hidden /> Véhicule <strong>{car.callLabel}</strong>
                </span>
                <span>
                  <Footprints size={16} aria-hidden /> À pied <strong>{walk.callLabel}</strong>
                </span>
              </div>
              <small>
                {departure.presentation_minutes != null
                  ? "Consigne renseignée pour cette traversée. L’heure de convocation de votre billet reste la référence."
                  : "Repère : 4 h avant en véhicule, 3 h à pied. L’heure de convocation de votre billet reste la référence."}
              </small>
            </div>
          ) : null}
          {myDeparture ? (
            <JourneyChecklist
              departureId={departure.id}
              departureAt={departure.departure_at}
              presentationMinutes={departure.presentation_minutes}
              port={from}
              compact
            />
          ) : null}
          {myDeparture ? (
            <a
              href="/ma-bezass"
              className="flex items-center justify-between rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"
            >
              Découvrir Ma bezass · compter mes billets et devises{" "}
              <ArrowRight size={14} aria-hidden />
            </a>
          ) : null}
          <PushStatusLine />
          <div className="bw-recap__ports">
            {[from, to].map((port, index) => (
              <button
                key={port.id}
                type="button"
                onClick={() => onSelect({ type: "port", id: port.id })}
              >
                <MapPin size={15} aria-hidden />
                <span>
                  <small>{index === 0 ? "Port de départ" : "Port d’arrivée"}</small>
                  <strong>{port.name}</strong>
                </span>
                <ArrowRight size={14} aria-hidden />
              </button>
            ))}
          </div>
          {departure.notes ? (
            <p className="bw-recap__note">
              <strong>À savoir :</strong> {departure.notes}
            </p>
          ) : null}
          {!cancelled ? (
            <div className="bw-recap__book">
              <BookingLink company={company} compact />
            </div>
          ) : null}
        </div>
      ) : activeTab === "live" ? (
        <div className="bw-recap__panel" role="tabpanel" id={liveId} data-live-anchor>
          <TripChanges departureId={departure.id} />
          <FlashFeed
            title="Infos BledWay sur votre traversée"
            context={{
              departureIds: [departure.id],
              routeIds: [departure.route_id],
              portIds: [from.id, to.id],
              companyIds: departure.company_id ? [departure.company_id] : [],
              vesselId: departure.vessel_id,
            }}
            withSignals={false}
            expandFirst
            onSelect={onSelect}
            limit={6}
            emptyText="Aucune information BledWay sur cette traversée pour le moment."
          />
          <TravelSignals
            key={from.id}
            kind="port"
            target={from.id}
            compact
            title={`Voyageurs · port de ${from.name}`}
          />
          {vessel ? (
            <TravelSignals
              key={vessel.id}
              kind="vessel"
              target={vessel.id}
              departureId={departure.id}
              compact
              title={`Voyageurs · à bord de ${vessel.name}`}
            />
          ) : null}
          <PortPresence portId={from.id} />
          {upcoming || atSea ? (
            <button type="button" className="bw-recap__share" onClick={report}>
              <Megaphone size={15} aria-hidden /> Partager ce que je vois (file, retard,
              embarquement…)
            </button>
          ) : null}
        </div>
      ) : (
        <div className="bw-recap__panel" role="tabpanel">
          {vessel ? (
            <>
              {vessel.description ? <p className="mb-3 text-sm">{vessel.description}</p> : null}
              <VesselPresence vesselId={vessel.id} />
              <VesselSpecs vessel={vessel} />
            </>
          ) : (
            <p className="bw-recap__empty">
              <Ship size={16} aria-hidden /> Le bateau n’est pas encore affecté par la compagnie. Il
              apparaîtra ici dès qu’il sera connu.
            </p>
          )}
        </div>
      )}

      <footer className="bw-recap__foot">
        <details>
          <summary>Source des horaires</summary>
          <ReliabilityNote
            reliability={departure.reliability}
            sourceName={departure.source_name}
            sourceUrl={departure.source_url}
            verifiedAt={departure.last_verified_at}
          />
        </details>
        <ReportButton targetType="departure" targetId={departure.id} variant="link" />
      </footer>
    </article>
  );
}
