import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Flag, History, MapPin, Ship } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTravelFollows } from "@/hooks/useTravelFollows";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { departureEventsQuery, relativeAge } from "@/lib/ferry/flash";
import type { Selection } from "@/lib/ferry/types";
import { requestQuickReport } from "@/components/map/QuickReport";
import { FlashFeed } from "./FlashFeed";
import { TripStatusPicker } from "./TripPresence";
import { PushStatusLine } from "./PushStatusLine";

/** Historique des changements d'un départ (horaire, navire, annulation), alimenté par la base. */
export function TripChanges({ departureId }: { departureId: string }) {
  const events = useQuery(departureEventsQuery(departureId));
  if (events.isPending || events.data === null) return null;
  if (events.isError)
    return (
      <p className="bw-community-error" role="status">
        L’historique de la traversée est momentanément indisponible.{" "}
        <button type="button" onClick={() => void events.refetch()}>
          Réessayer
        </button>
      </p>
    );
  const list = events.data ?? [];
  return (
    <section className="bw-trip-changes" aria-label="Changements de la traversée">
      <h3 className="bw-flash-title">
        <History size={15} aria-hidden /> Changements
      </h3>
      {list.length ? (
        <ol>
          {list.map((event, index) => (
            <li key={event.id} data-latest={index === 0}>
              <div className="bw-trip-change-head">
                <strong>{event.title}</strong>
                <time dateTime={event.created_at}>{relativeAge(event.created_at)}</time>
              </div>
              <p>{event.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="bw-flash-empty">
          Aucun changement signalé depuis la publication de ce départ.
        </p>
      )}
    </section>
  );
}

/**
 * « Ma traversée » : tout ce qui concerne un départ précis, réuni au même endroit.
 * Les infos viennent de la base (changements), de l'équipe (Flash info) et des voyageurs.
 */
export function MyTripPanel({
  departureId,
  routeId,
  fromPortId,
  toPortId,
  companyId,
  vesselId,
  fromName,
  departureAt,
  onSelect,
}: {
  departureAt?: string | undefined;
  departureId: string;
  routeId: string;
  fromPortId?: string | undefined;
  toPortId?: string | undefined;
  companyId?: string | null | undefined;
  vesselId?: string | null | undefined;
  fromName?: string | undefined;
  onSelect: (selection: Selection) => void;
}) {
  const portIds = [fromPortId, toPortId].filter((id): id is string => Boolean(id));
  return (
    <div className="bw-my-trip">
      {departureAt ? (
        <TripStatusPicker departureId={departureId} departureAt={departureAt} fromPortId={fromPortId} />
      ) : null}
      <PushStatusLine />
      <TripChanges departureId={departureId} />
      <FlashFeed
        title="Infos sur votre traversée"
        context={{
          departureIds: [departureId],
          routeIds: [routeId],
          portIds,
          companyIds: companyId ? [companyId] : [],
        }}
        expandFirst
        signalPortIds={fromPortId ? [fromPortId] : []}
        signalVesselIds={vesselId ? [vesselId] : []}
        onSelect={onSelect}
        limit={5}
        emptyText="Aucune perturbation connue sur cette traversée pour le moment."
      />
      {/* Le jour J : signaler ce que l'on voit, port et navire déjà renseignés. */}
      <button
        type="button"
        className="bw-trip-prepare bw-trip-signal"
        onClick={() =>
          requestQuickReport({
            type: "departure",
            id: departureId,
            portId: fromPortId ?? null,
            vesselId: vesselId ?? null,
          })
        }
      >
        <Flag size={18} aria-hidden />
        <span>
          <small>Au port ou à bord ?</small>
          <strong>Signaler une situation (file, retard, embarquement…)</strong>
        </span>
        <ArrowRight size={16} aria-hidden />
      </button>
      {fromPortId ? (
        <button
          type="button"
          className="bw-trip-prepare"
          onClick={() => onSelect({ type: "port", id: fromPortId })}
        >
          <MapPin size={18} aria-hidden />
          <span>
            <small>Rejoindre le port</small>
            <strong>Accès, services et lieux pratiques{fromName ? ` · ${fromName}` : ""}</strong>
          </span>
          <ArrowRight size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

const dayCount = (iso: string) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
};

/** Accueil : raccourci vers les traversées suivies à venir (compte connecté uniquement). */
export function MyTripsShortcut({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return <MyTripsList userId={user.id} onSelect={onSelect} />;
}

function MyTripsList({
  userId,
  onSelect,
}: {
  userId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { follows, details } = useTravelFollows(userId);
  // « Ma traversée » est déjà affichée en grand au-dessus : pas de doublon ici.
  const { trip: myTrip } = useMyTrip();
  const now = Date.now();
  const trips = (follows.data ?? [])
    .filter((follow) => follow.target_kind === "departure" && follow.traveller && follow.target_id !== myTrip?.departure.id)
    .flatMap((follow) => {
      const detail = details.data?.[follow.target_id];
      if (!detail?.departureAt || Date.parse(detail.departureAt) < now - 36 * 3_600_000) return [];
      return [{ id: follow.target_id, label: detail.label, at: detail.departureAt }];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, 2);
  if (!trips.length) return null;
  return (
    <section className="bw-my-trips" aria-label="Ma traversée">
      {trips.map((trip) => {
        const days = dayCount(trip.at);
        return (
          <button
            type="button"
            key={trip.id}
            className="bw-my-trip-card"
            onClick={() => onSelect({ type: "departure", id: trip.id })}
          >
            <span className="bw-my-trip-icon" aria-hidden>
              <Ship size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <small>
                <CalendarClock size={12} aria-hidden /> Traversée suivie ·{" "}
                {days <= 0 ? "aujourd’hui" : days === 1 ? "demain" : `J-${days}`}
              </small>
              <strong>{trip.label}</strong>
            </span>
            <ArrowRight size={16} aria-hidden />
          </button>
        );
      })}
    </section>
  );
}
