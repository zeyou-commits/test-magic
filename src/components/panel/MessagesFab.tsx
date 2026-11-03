import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { upcomingDeparturesQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import {
  CHAT_INVITE_EVENT,
  OPEN_ROOM_PICKER_EVENT,
  chatDemoQuery,
  recentChatQuery,
} from "@/lib/ferry/chatDemo";
import { chatFeedQuery } from "./LiveRoom";
import { RoomPicker } from "./RoomPicker";
import { AuthorAvatar } from "./StaffChat";
import { CabasStack } from "./TripPresence";

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
  // Des visages plutôt qu'une icône : ceux de mon salon, sinon ceux qui écrivent en ce moment dans
  // les salons, sinon les exemples de l'équipe (sans chiffre : on n'invente jamais une activité).
  const recent = useQuery({ ...recentChatQuery, enabled: !trip }).data ?? [];
  const demos = useQuery({ ...chatDemoQuery, enabled: !trip }).data ?? [];
  const mine = room?.messages ?? [];
  const count = trip ? mine.length : recent.length;
  const faces: { key: string; node: React.ReactNode }[] = [];
  const seen = new Set<string>();
  const add = (key: string, node: React.ReactNode) => {
    if (faces.length >= 3 || seen.has(key)) return;
    seen.add(key);
    faces.push({ key, node });
  };
  if (trip)
    [...mine]
      .reverse()
      .filter((message) => !message.me)
      .forEach((message) =>
        add(message.author.handle ?? message.author.pseudo, <AuthorAvatar author={message.author} size={22} />),
      );
  else
    [
      ...recent.map((message) => ({ pseudo: message.author.pseudo, avatar: message.author.avatar })),
      ...(recent.length ? [] : demos.filter((demo) => demo.active)),
    ].forEach((person) =>
      person.avatar ? add(person.pseudo, <img src={person.avatar} alt="" width={22} height={22} />) : null,
    );
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
        data-faces
      >
        <span className="bw-messages-fab__faces" aria-hidden>
          {faces.length ? (
            faces.map((face) => <i key={face.key}>{face.node}</i>)
          ) : (
            <CabasStack count={3} seed="salons" size={22} />
          )}
        </span>
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
