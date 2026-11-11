import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { fleetDeparturesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import {
  CHAT_INVITE_EVENT,
  OPEN_MY_ROOM_EVENT,
  OPEN_ROOM_PICKER_EVENT,
} from "@/lib/ferry/chatDemo";
import { chatFeedQuery } from "./LiveRoom";
import { RoomPicker } from "./RoomPicker";

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
    onSelect({ type: "departure", id: trip.departure.id });
    enterRoom("crossing", trip.departure.id);
  };
  const openMineRef = useRef(openMine);
  openMineRef.current = openMine;
  return (
    <div className="bw-messages">
      <button
        type="button"
        className="bw-messages-fab"
        aria-label={count ? `Salons, ${count} messages` : "Salons"}
        onClick={() => openMine()}
      >
        <MessagesSquare size={22} aria-hidden />
        <span>Salons</span>
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
              <small>À vous</small>
              <strong>
                {trip
                  ? "Et vous, ça se passe comment ? Racontez-le dans votre salon"
                  : "Vous voyagez bientôt ? Rejoignez le salon de votre traversée"}
              </strong>
            </span>
          </button>
          <button
            type="button"
            className="bw-messages-preview__close"
            aria-label="Ne plus proposer"
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
      <SalonsPicker onSelect={onSelect} open={open} onOpenChange={setOpen} start={start} />
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
}: {
  onSelect: (selection: Selection) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start?: "choose" | "salons" | undefined;
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
      title={trip ? "Les salons en cours" : undefined}
      intro={
        trip
          ? "Votre salon, et les autres en lecture : vous pouvez y réagir avec « Pareil ici »."
          : undefined
      }
      onSelect={onSelect}
      open={open}
      onOpenChange={onOpenChange}
      start={start}
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
