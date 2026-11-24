import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { roomMoment } from "@/lib/ferry/portPassage";
import type { Selection } from "@/lib/ferry/types";
import {
  CHAT_INVITE_EVENT,
  OPEN_MY_ROOM_EVENT,
  OPEN_ROOM_PICKER_EVENT,
} from "@/lib/ferry/chatDemo";
import { chatFeedQuery, LiveRoom } from "./LiveRoom";
import { RoomPicker, type RoomPickerDeparture } from "./RoomPicker";
import { tr } from "@/lib/i18n";

const DISMISS_KEY = "bledway:chat-preview-dismissed";
/** L'invitation reste le temps d'une bulle de la carte. */
const INVITE_MS = 5_000;

/**
 * Raccourci des salons, à côté de Signaler : mon salon, ou le choix d'une traversée. Les messages
 * sortent des navires et des ports sur la carte ; ici, toutes les 3 bulles, une invitation à partager.
 */
export function MessagesFab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const [open, setOpen] = useState(false);
  // Nouveau visiteur (aucune traversée suivie) : d'abord le choix « question ou salon ».
  const [start, setStart] = useState<"choose" | "salons">("salons");
  const room = useQuery({
    ...chatFeedQuery("crossing", trip?.departure.id ?? "", user?.id),
    refetchInterval: 60_000,
  }).data;
  const count = room?.messages.length ?? 0;
  const [invite, setInvite] = useState(false);
  // Le salon ouvert depuis ce bouton : seul, sans la fiche de la traversée derrière.
  const [solo, setSolo] = useState<RoomPickerDeparture | null>(null);
  const [soloOpen, setSoloOpen] = useState(false);
  const openSolo = (departure: RoomPickerDeparture) => {
    setSolo(departure);
    setSoloOpen(true);
  };
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let timer = 0;
    const show = () => {
      setInvite(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setInvite(false), INVITE_MS);
    };
    const pick = () => {
      setStart("salons");
      setOpen(true);
    };
    const mine = () => openMineRef.current("salons");
    window.addEventListener(CHAT_INVITE_EVENT, show);
    window.addEventListener(OPEN_ROOM_PICKER_EVENT, pick);
    window.addEventListener(OPEN_MY_ROOM_EVENT, mine);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHAT_INVITE_EVENT, show);
      window.removeEventListener(OPEN_ROOM_PICKER_EVENT, pick);
      window.removeEventListener(OPEN_MY_ROOM_EVENT, mine);
    };
  }, []);
  const openMine = (mode: "choose" | "salons" = "choose") => {
    if (!trip) {
      setStart(mode);
      setOpen(true);
      return;
    }
    // Le salon seul : la carte reste comme elle était, aucune fiche ne s'ouvre derrière.
    openSolo(trip.departure);
  };
  const openMineRef = useRef(openMine);
  openMineRef.current = openMine;
  return (
    <div className="bw-messages">
      <button
        type="button"
        className="bw-messages-fab"
        data-tour="salons"
        aria-label={count ? tr("ui.messagesFab.salonsMessages", { count }) : tr("ui.messagesFab.salons")}
        onClick={() => openMine()}
      >
        <MessagesSquare size={22} aria-hidden />
        <span>{tr("ui.messagesFab.salons")}</span>
        {count ? <b>{count > 99 ? "99+" : count}</b> : null}
      </button>
      {invite && !dismissed ? (
        <div className="bw-messages-preview" aria-live="polite">
          <button
            type="button"
            className="bw-messages-preview__bubble"
            data-invite
            // L'invitation parle du salon : on y va directement.
            onClick={() => openMine("salons")}
          >
            <span className="bw-messages-preview__invite-icon" aria-hidden>
              <MessagesSquare size={15} />
            </span>
            <span>
              <small>{tr("ui.messagesFab.aVous")}</small>
              <strong>
                {trip
                  ? tr("ui.messagesFab.etVousCaSePasse")
                  : tr("ui.messagesFab.vousVoyagezBientotRejoignezLe")}
              </strong>
            </span>
          </button>
          <button
            type="button"
            className="bw-messages-preview__close"
            aria-label={tr("ui.messagesFab.nePlusProposer")}
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {
                /* facultatif */
              }
            }}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}
      <SalonsPicker
        onSelect={onSelect}
        open={open}
        onOpenChange={setOpen}
        start={start}
        onPick={openSolo}
      />
      {solo ? <SoloCrossingRoom departure={solo} open={soloOpen} onOpenChange={setSoloOpen} /> : null}
    </div>
  );
}

/**
 * La liste des salons en cours : traversées en mer, puis à venir. Ma traversée en tête de
 * l'intention (« Votre salon, et les autres en lecture »).
 */
function SalonsPicker({
  onSelect,
  open,
  onOpenChange,
  start,
  onPick,
}: {
  onSelect: (selection: Selection) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start?: "choose" | "salons" | undefined;
  onPick?: ((departure: RoomPickerDeparture) => void) | undefined;
}) {
  const { trip } = useMyTrip();
  const upcoming = useQuery(upcomingDeparturesQuery()).data ?? [];
  const fleet = useQuery(fleetDeparturesQuery).data ?? [];
  const now = Date.now();
  const atSea = fleet.filter(
    (departure) =>
      departure.status !== "cancelled" &&
      Date.parse(departure.departure_at) <= now &&
      Date.parse(departure.arrival_at ?? departure.departure_at) > now,
  );
  const rooms = [...atSea, ...upcoming.filter((d) => !atSea.some((sea) => sea.id === d.id))];
  return (
    <RoomPicker
      departures={rooms.slice(0, 80)}
      currentId={trip?.departure.id}
      intro={
        trip
          ? tr("ui.messagesFab.votreSalonEtLesAutres")
          : undefined
      }
      onSelect={onSelect}
      open={open}
      onOpenChange={onOpenChange}
      start={start}
      onPick={onPick}
    />
  );
}

/** Le salon d'une traversée, seul (même contenu que dans la fiche, sans la fiche autour). */
function SoloCrossingRoom({
  departure,
  open,
  onOpenChange,
}: {
  departure: RoomPickerDeparture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const route = routes.find((item) => item.id === departure.route_id);
  const from = ports.find((port) => port.id === route?.departure_port_id);
  const to = ports.find((port) => port.id === route?.arrival_port_id);
  const vessel = vessels.find((item) => item.id === departure.vessel_id);
  const company = companies.find((item) => item.id === departure.company_id);
  return (
    <LiveRoom
      solo
      open={open}
      onOpenChange={onOpenChange}
      kind="crossing"
      room={departure.id}
      title={from && to ? tr("ui.messagesFab.salon", { name: from.name, name2: to.name }) : tr("ui.messagesFab.salonDeLaTraversee")}
      moment={roomMoment(departure.departure_at, departure.arrival_at ?? null, Date.now())}
      starterContext={{
        depart: from?.name,
        arrivee: to?.name,
        navire: vessel?.name,
        compagnie: company?.name,
      }}
    />
  );
}

/**
 * Mode voyage : le bouton des salons ouvre le salon de la traversée, et « Autres salons » ouvre
 * cette liste (choisir une autre traversée quitte le mode voyage, avec retour possible).
 */
export function VoyageSalonsPicker({
  onSelect,
  open,
  onOpenChange,
}: {
  onSelect: (selection: Selection) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <SalonsPicker onSelect={onSelect} open={open} onOpenChange={onOpenChange} />;
}
