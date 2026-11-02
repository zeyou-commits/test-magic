import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Flag, MessagesSquare, Send, ThumbsUp, Users } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { TravellerCard } from "@/lib/community/travellers";
import {
  CHAT_SENT_EVENT,
  ENTER_ROOM_EVENT,
  enterRoom,
  postToRoom,
  rememberPendingChat,
  roomWanted,
} from "@/lib/ferry/chat";
import { currentPosition } from "@/lib/ferry/community";
import { chatRefusal, roomExamples, type RoomMoment } from "@/lib/ferry/portPassage";
import { OwnMessageActions } from "./OwnMessageActions";

const supabase = typedSupabase as unknown as SupabaseClient;
export const MAX_MESSAGE = 200;

type RoomKind = "crossing" | "port";
type Message = {
  id: string;
  body: string;
  place: "aboard" | "port" | "trip";
  /** Fil du port : la traversée d'où vient le message. */
  crossing?: string | null;
  edited?: boolean;
  created_at: string;
  me: boolean;
  author: TravellerCard;
  same: number;
  reacted: boolean;
};
type Feed = { access: "read" | "member" | "position"; messages: Message[] };

const PLACE = { aboard: "à bord", port: "au port", trip: "passager" } as const;
const missing = (code?: string) => code === "PGRST202" || code === "42883";
/** En dessous, on considère que la personne suit le direct : le fil descend tout seul. */
const FOLLOW_BOTTOM_PX = 80;
const PREVIEW_MESSAGES = 3;
export const roomKey = (kind: RoomKind, room: string) => ["bw-chat", kind, room] as const;

const time = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Le fil d'un salon ; null tant que le module n'est pas activé en base. */
export const chatFeedQuery = (kind: RoomKind, room: string, userId: string | undefined) =>
  queryOptions({
    queryKey: [...roomKey(kind, room), userId ?? "anonyme"],
    enabled: Boolean(room),
    queryFn: async (): Promise<Feed | null> => {
      const { data, error } = await supabase.rpc("bw_chat_feed", { p_kind: kind, p_room: room });
      if (error) {
        if (missing(error.code)) return null;
        throw new Error("Salon indisponible.");
      }
      return data as Feed;
    },
    retry: false,
    // Filet de sécurité : le direct passe par le canal, ceci rattrape un signal perdu.
    refetchInterval: 20_000,
  });

/** Le direct : relire dès qu'un message bouge, et compter les personnes présentes dans le salon. */
function useRoomChannel(kind: RoomKind, room: string, present: boolean) {
  const client = useQueryClient();
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const channel = supabase.channel(`chat:${kind}:${room}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channel
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: roomKey(kind, room) });
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).length);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && present) void channel.track({ here: true });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, kind, room, present]);
  return online;
}

/** Entrée du salon depuis Ma traversée. */
export function RoomButton({ departureId, onOpen }: { departureId: string; onOpen: () => void }) {
  const { user } = useAuth();
  const feed = useQuery({
    ...chatFeedQuery("crossing", departureId, user?.id),
    refetchInterval: 60_000,
  });
  if (feed.data === null) return null;
  const count = feed.data?.messages.length ?? 0;
  return (
    <button
      type="button"
      className="bw-passage__room"
      onClick={() => {
        onOpen();
        enterRoom("crossing", departureId);
      }}
    >
      <MessagesSquare size={15} aria-hidden /> Salon de la traversée
      {count ? ` · ${count === 80 ? "80+" : count} message${count > 1 ? "s" : ""}` : ""}
    </button>
  );
}

/** Le salon en direct : une conversation, les nouveaux messages arrivent en bas. */
function LiveChat({
  kind,
  room,
  title,
  moment,
  messages,
  canWrite,
  closed,
  online,
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment: RoomMoment;
  messages: Message[];
  canWrite: boolean;
  closed: boolean;
  online: number;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const lastId = useRef<string | null>(null);
  const lines = [...messages].reverse();
  const refresh = () => void client.invalidateQueries({ queryKey: roomKey(kind, room) });
  const toBottom = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    following.current = true;
    setUnread(0);
  };
  const send = useMutation({
    mutationFn: () => postToRoom(kind, room, text),
    onSuccess: () => {
      setText("");
      following.current = true;
      refresh();
    },
  });
  const react = useMutation({
    mutationFn: async (id: string) => {
      const here = kind === "port" ? await currentPosition() : null;
      const { data, error } = await supabase.rpc("bw_chat_react", {
        p_message: id,
        p_lat: here?.[1] ?? null,
        p_lon: here?.[0] ?? null,
      });
      if (error) throw new Error("Réaction non enregistrée.");
      const result = data as { ok: boolean; refused?: string };
      if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
    },
    onSuccess: refresh,
  });
  const report = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("bw_chat_report", { p_message: id });
      if (error) throw new Error("Signalement non envoyé.");
    },
    onSuccess: refresh,
  });
  // Parti après une inscription : le champ se vide.
  useEffect(() => {
    const clear = () => setText("");
    window.addEventListener(CHAT_SENT_EVENT, clear);
    return () => window.removeEventListener(CHAT_SENT_EVENT, clear);
  }, []);
  // On suit le direct, sauf si la personne est remontée lire : elle est alors prévenue.
  const newest = lines[lines.length - 1]?.id ?? null;
  useLayoutEffect(() => {
    if (newest === lastId.current) return;
    const first = lastId.current === null;
    const fresh = first
      ? 0
      : lines.length - 1 - lines.findIndex((line) => line.id === lastId.current);
    lastId.current = newest;
    if (first || following.current) toBottom();
    else setUnread((count) => count + Math.max(fresh, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest]);
  // On écrit d'abord ; l'inscription n'arrive qu'à l'envoi, et le message est gardé.
  const submit = () => {
    if (!text.trim()) return;
    if (canWrite) {
      send.mutate();
      return;
    }
    rememberPendingChat({ kind, room, body: text });
    request(
      kind === "crossing"
        ? {
            type: "follow",
            kind: "departure",
            targetId: room,
            label: title,
            traveller: true,
            purpose: "voyageur",
          }
        : { type: "chat", label: title },
    );
  };
  const problem = send.error ?? react.error ?? report.error;
  return (
    <div className="bw-chat">
      <header className="bw-chat__head">
        <span className="bw-chat__live">
          <i aria-hidden /> En direct
        </span>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="bw-chat__online">
          <Users size={13} aria-hidden /> {online ? `${online} en ligne` : "Vous êtes ici"}
        </DialogDescription>
      </header>
      <ol
        ref={listRef}
        className="bw-chat__lines"
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget;
          following.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_BOTTOM_PX;
          if (following.current) setUnread(0);
        }}
      >
        {lines.length ? null : (
          <li className="bw-chat__hello">Soyez le premier ou la première à écrire ici.</li>
        )}
        {lines.map((message) => (
          <li key={message.id} data-me={message.me || undefined}>
            <TravellerAvatar card={message.author} size={26} mood={false} />
            <div>
              <button
                type="button"
                className="bw-chat__line"
                aria-expanded={selected === message.id}
                onClick={() => setSelected(selected === message.id ? null : message.id)}
              >
                <b>{message.me ? "Vous" : message.author.pseudo}</b>
                <small data-place={message.place}>{message.crossing ?? PLACE[message.place]}</small>
                <span>{message.body}</span>
                {message.same ? (
                  <em>
                    <ThumbsUp size={11} aria-hidden /> {message.same}
                  </em>
                ) : null}
              </button>
              {selected === message.id ? (
                <div className="bw-chat__tools">
                  <time dateTime={message.created_at}>
                    {time(message.created_at)}
                    {message.edited ? " · modifié" : ""}
                  </time>
                  <button
                    type="button"
                    aria-pressed={message.reacted}
                    disabled={react.isPending}
                    onClick={() => react.mutate(message.id)}
                  >
                    <ThumbsUp size={13} aria-hidden /> Pareil ici
                  </button>
                  {user && !message.me ? (
                    <button
                      type="button"
                      disabled={report.isPending}
                      onClick={() => report.mutate(message.id)}
                    >
                      <Flag size={13} aria-hidden /> Signaler
                    </button>
                  ) : null}
                  {message.me ? <OwnMessageActions id={message.id} body={message.body} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {unread ? (
        <button type="button" className="bw-chat__unread" onClick={toBottom}>
          <ArrowDown size={14} aria-hidden /> {unread} nouveau{unread > 1 ? "x" : ""} message
          {unread > 1 ? "s" : ""}
        </button>
      ) : null}
      {problem ? (
        <p role="alert" className="bw-chat__error">
          {problem.message}
        </p>
      ) : null}
      {closed ? (
        <p className="bw-chat__closed">
          Ce salon est fermé à l'écriture. Vous pouvez encore le lire.
        </p>
      ) : (
        <div className="bw-chat__write">
          {text ? null : (
            <p className="bw-chat__examples">
              {roomExamples(kind === "port" ? "port" : moment).map((example) => (
                <button key={example} type="button" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={text}
              maxLength={MAX_MESSAGE}
              onChange={(event) => setText(event.target.value)}
              placeholder="Envoyer un message"
              aria-label="Votre message"
            />
            {text.length > MAX_MESSAGE - 40 ? <small>{MAX_MESSAGE - text.length}</small> : null}
            <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Envoyer">
              <Send size={17} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Dans la fiche : un aperçu du direct et la porte d'entrée du salon. */
export function LiveRoom({
  kind,
  room,
  title,
  moment = "before",
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment?: RoomMoment;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const feed = useQuery(chatFeedQuery(kind, room, user?.id));
  const online = useRoomChannel(kind, room, open);
  // Demandé depuis une tuile, une invitation ou le raccourci : on entre directement.
  useEffect(() => {
    const enter = () => {
      if (roomWanted(kind, room)) setOpen(true);
    };
    enter();
    window.addEventListener(ENTER_ROOM_EVENT, enter);
    return () => window.removeEventListener(ENTER_ROOM_EVENT, enter);
  }, [kind, room]);
  // Module pas encore activé en base : rien à afficher.
  if (feed.data === null) return null;
  const messages = feed.data?.messages ?? [];
  const canWrite = feed.data?.access === "member" || feed.data?.access === "position";
  const closed = kind === "crossing" && moment === "over";
  const preview = messages.slice(0, PREVIEW_MESSAGES).reverse();
  return (
    <section className="bw-room" aria-label={title}>
      <header>
        <MessagesSquare size={17} aria-hidden />
        <h3>{title}</h3>
        <small className="bw-chat__live">
          <i aria-hidden /> {online ? `${online} en ligne` : "En direct"}
        </small>
      </header>
      {preview.length ? (
        <ol className="bw-room__preview">
          {preview.map((message) => (
            <li key={message.id}>
              <b>{message.me ? "Vous" : message.author.pseudo}</b> {message.body}
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="bw-room__enter" onClick={() => setOpen(true)}>
        <MessagesSquare size={18} aria-hidden />
        {closed ? "Lire le salon" : "Entrer dans le salon"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bw-chat-window">
          <LiveChat
            kind={kind}
            room={room}
            title={title}
            moment={moment}
            messages={messages}
            canWrite={canWrite}
            closed={closed}
            online={online}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
