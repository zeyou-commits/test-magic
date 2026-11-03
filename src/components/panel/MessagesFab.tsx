import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { upcomingDeparturesQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import { CHAT_INVITE_EVENT, OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
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
  const upcoming = useQuery(upcomingDeparturesQuery()).data ?? [];
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
    const pick = () => setOpen(true);
    window.addEventListener(CHAT_INVITE_EVENT, show);
    window.addEventListener(OPEN_ROOM_PICKER_EVENT, pick);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHAT_INVITE_EVENT, show);
      window.removeEventListener(OPEN_ROOM_PICKER_EVENT, pick);
    };
  }, []);
  const openMine = () => {
    if (!trip) {
      setOpen(true);
      return;
    }
    onSelect({ type: "departure", id: trip.departure.id });
    enterRoom("crossing", trip.departure.id);
  };
  return (
    <div className="bw-messages">
      <button
        type="button"
        className="bw-messages-fab"
        aria-label={count ? `Salons, ${count} messages` : "Salons"}
        onClick={openMine}
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
            onClick={openMine}
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
      <RoomPicker
        departures={upcoming.slice(0, 60)}
        onSelect={onSelect}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
