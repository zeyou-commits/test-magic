import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  AtSign,
  Bell,
  BellOff,
  CircleHelp,
  CornerDownRight,
  Flag,
  Mail,
  MessagesSquare,
  Reply,
  Send,
  Smile,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { myTravellerQuery, type TravellerCard } from "@/lib/community/travellers";
import { afterOverlayClose, useBackClose } from "@/lib/ferry/backStack";
import {
  CHAT_SENT_EVENT,
  ENTER_ROOM_EVENT,
  enterRoom,
  muteRoom,
  postToRoom,
  rememberPendingChat,
  rememberQuestionDraft,
  roomWanted,
  withMentions,
} from "@/lib/ferry/chat";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { useCharterGate } from "./CharterGate";
import { currentPosition } from "@/lib/ferry/community";
import { chatRefusal, roomExamples, type RoomMoment } from "@/lib/ferry/portPassage";
import { emoteToken, UNICODE_EMOTES } from "@/lib/ferry/chatEmotes";
import { dmInboxQuery, dmKey, metQuery, takeDmFocus } from "@/lib/ferry/privateMessages";
import { CabasImg } from "@/components/CabasImg";
import { ChatText, useChatEmotes } from "./ChatText";
import { OwnMessageActions } from "./OwnMessageActions";
import { DmRequest, PrivateMessages } from "./PrivateMessages";
import { AuthorAvatar, StaffBadge, StaffTools, type ChatAuthor } from "./StaffChat";

const supabase = typedSupabase as unknown as SupabaseClient;
export const MAX_MESSAGE = 200;

type RoomKind = "crossing" | "port";
type Message = {
  id: string;
  body: string;
  place: "aboard" | "port" | "trip" | "staff";
  /** Fil du port : la traversée d'où vient le message. */
  crossing?: string | null;
  edited?: boolean;
  /** Identifiant → pseudo des personnes mentionnées. */
  mentions?: Record<string, string>;
  reply_to?: { id: string; body: string; me: boolean; pseudo: string } | null;
  created_at: string;
  me: boolean;
  author: ChatAuthor;
  same: number;
  reacted: boolean;
};
type Feed = {
  access: "read" | "member" | "position" | "staff";
  /** La personne fait partie de l'équipe : outils de modération et message officiel. */
  staff?: boolean;
  /** Charte déjà acceptée par ce compte. */
  charter?: boolean;
  /** Salon en sourdine : pas de notification venue de lui. */
  muted?: boolean;
  messages: Message[];
};

/** Le compte officiel, pour le mot d'accueil. */
const BLEDWAY = {
  handle: "bledway",
  pseudo: "BledWay",
  official: true,
} as ChatAuthor;
const PLACE = { aboard: "à bord", port: "au port", trip: "passager", staff: "équipe BledWay" } as const;
const missing = (code?: string) => code === "PGRST202" || code === "42883";
/** En dessous, on considère que la personne suit le direct : le fil descend tout seul. */
const FOLLOW_BOTTOM_PX = 80;
const PREVIEW_MESSAGES = 3;
/** Un message fait seulement d'émoticônes s'affiche en grand. */
const onlyEmotes = (text: string) =>
  text.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|\s/gu, "") === "";
type Present = { key: string; card: TravellerCard | null };
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
function useRoomChannel(
  kind: RoomKind,
  room: string,
  present: boolean,
  card: TravellerCard | null,
) {
  const client = useQueryClient();
  const [people, setPeople] = useState<Present[]>([]);
  useEffect(() => {
    const channel = supabase.channel(`chat:${kind}:${room}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channel
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: roomKey(kind, room) });
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ card?: TravellerCard | null }>();
        setPeople(
          Object.entries(state).map(([key, entries]) => ({ key, card: entries[0]?.card ?? null })),
        );
      })
      .subscribe((status) => {
        // Seuls le pseudo et le cabas, déjà publics, sont partagés ; jamais la position.
        if (status === "SUBSCRIBED" && present) void channel.track({ card });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, kind, room, present, card]);
  return people;
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
  people,
  myHandle,
  myPseudo,
  staff = false,
  charter,
  muted = false,
  onAskLine,
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment: RoomMoment;
  messages: Message[];
  canWrite: boolean;
  closed: boolean;
  people: Present[];
  myHandle: string | undefined;
  myPseudo?: string | undefined;
  staff?: boolean;
  charter?: boolean | undefined;
  muted?: boolean;
  /** Salon du port, hors du port : passer la question aux voyageurs d'une ligne. */
  onAskLine?: ((routeId: string) => void) | undefined;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [official, setOfficial] = useState(false);
  // Les @Pseudo choisis dans la liste, transformés en mentions à l'envoi.
  const chosen = useRef(new Map<string, string>());
  const gate = useCharterGate(charter);
  const [selected, setSelected] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const [dmView, setDmView] = useState<"inbox" | null>(() => (takeDmFocus() ? "inbox" : null));
  const [dmTo, setDmTo] = useState<TravellerCard | null>(null);
  const siteEmotes = useChatEmotes();
  const met = useQuery(metQuery(kind === "crossing" ? room : "", user?.id)).data;
  const metHere = new Set(met?.here ?? []);
  const inbox = useQuery(dmInboxQuery(user?.id)).data;
  const dmUnread = inbox?.reduce((sum, thread) => sum + thread.unread, 0) ?? 0;
  // Réveil des messages privés : le signal ne dit rien de leur contenu.
  useEffect(() => {
    if (!user || inbox === null) return;
    const channel = supabase
      .channel(`dm:${user.id}`)
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: dmKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, inbox === null, client]);
  // Les passagers peuvent s'écrire : seulement sur une traversée, et en étant soi-même passager.
  const canDm = kind === "crossing" && canWrite && !closed && Boolean(user) && inbox !== null;
  const inputRef = useRef<HTMLInputElement>(null);
  const online = people.length;
  const named = people.filter((person) => person.card);
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
    mutationFn: () =>
      postToRoom(
        kind,
        room,
        withMentions(text, chosen.current),
        undefined,
        replyTo?.id,
        staff && official,
      ),
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      setShowEmotes(false);
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
    const clear = () => {
      setText("");
      setReplyTo(null);
    };
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
      gate.guard(() => send.mutate());
      return;
    }
    rememberPendingChat({ kind, room, body: text, ...(replyTo ? { replyTo: replyTo.id } : {}) });
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
  const mute = useMutation({
    mutationFn: () => muteRoom(kind, room, !muted),
    onSuccess: refresh,
  });
  const problem = send.error ?? react.error ?? report.error ?? mute.error;
  // Qui peut être mentionné : les auteurs du salon et les présents, sauf soi et le compte officiel.
  const mentionable = [
    ...new Map(
      [...messages.map((message) => message.author as ChatAuthor), ...named.map((person) => person.card as ChatAuthor)]
        .filter((card) => card && !card.official && card.handle !== myHandle)
        .map((card) => [card.handle, card] as const),
    ).values(),
  ];
  const typing = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const suggestions = typing
    ? mentionable
        .filter((card) => card.pseudo.toLowerCase().includes(typing[1]!.toLowerCase()))
        .slice(0, 5)
    : [];
  const mention = (card: TravellerCard, replace: boolean) => {
    chosen.current.set(card.pseudo, card.handle);
    setText((value) =>
      (replace
        ? value.replace(/@([^\s@]*)$/, `@${card.pseudo} `)
        : `${value}${value && !value.endsWith(" ") ? " " : ""}@${card.pseudo} `
      ).slice(0, MAX_MESSAGE),
    );
    inputRef.current?.focus();
  };
  // Pas sur le port : la question part aux voyageurs d'une des lignes de ce port.
  const notHere =
    kind === "port" && (send.error as (Error & { code?: string }) | null)?.code === "not_here";
  const { data: allRoutes = [] } = useQuery({ ...routesQuery, enabled: notHere });
  const { data: allPorts = [] } = useQuery({ ...portsQuery, enabled: notHere });
  // Une seule liaison par port d'en face : la ligne au départ d'ici, sinon celle qui y arrive.
  const portName = (id: string) => allPorts.find((port) => port.id === id)?.name ?? "—";
  const portLines = notHere
    ? [
        ...new Map(
          allRoutes
            .filter((route) => route.departure_port_id === room || route.arrival_port_id === room)
            .sort((a, b) => Number(b.departure_port_id === room) - Number(a.departure_port_id === room))
            .map((route) => {
              const other =
                route.departure_port_id === room ? route.arrival_port_id : route.departure_port_id;
              return [other, { id: route.id, line: `${portName(room)} ↔ ${portName(other)}` }] as const;
            })
            .reverse(),
        ).values(),
      ].sort((a, b) => a.line.localeCompare(b.line))
    : [];
  if (dmTo)
    return (
      <DmRequest
        departureId={room}
        card={dmTo}
        onCancel={() => setDmTo(null)}
        onDone={() => {
          setDmTo(null);
          setDmView("inbox");
        }}
      />
    );
  if (dmView) return <PrivateMessages onBack={() => setDmView(null)} />;
  return (
    <div className="bw-chat">
      {gate.dialog}
      <header className="bw-chat__head">
        {user && inbox !== null ? (
          <button
            type="button"
            className="bw-chat__mail"
            aria-label={dmUnread ? `Messages privés, ${dmUnread} non lus` : "Messages privés"}
            onClick={() => setDmView("inbox")}
          >
            <Mail size={19} aria-hidden />
            {dmUnread ? <b>{dmUnread}</b> : null}
          </button>
        ) : null}
        {user ? (
          <button
            type="button"
            className="bw-chat__mute"
            aria-pressed={muted}
            disabled={mute.isPending}
            title={muted ? "Réactiver les notifications de ce salon" : "Mettre ce salon en sourdine"}
            aria-label={
              muted ? "Réactiver les notifications de ce salon" : "Mettre ce salon en sourdine"
            }
            onClick={() => mute.mutate()}
          >
            {muted ? <BellOff size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
          </button>
        ) : null}
        <span className="bw-chat__live">
          <i aria-hidden /> En direct
        </span>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <button
            type="button"
            className="bw-chat__online"
            aria-expanded={showPeople}
            onClick={() => setShowPeople((value) => !value)}
          >
            <Users size={13} aria-hidden /> {online ? `${online} en ligne` : "Vous êtes ici"}
          </button>
        </DialogDescription>
      </header>
      {showPeople ? (
        <div className="bw-chat__people">
          {named.length ? (
            <ul>
              {named.map((person) => (
                <li key={person.key}>
                  <TravellerAvatar card={person.card!} size={30} mood={false} />
                  <span>{person.card!.pseudo}</span>
                  {metHere.has(person.card!.handle) ? (
                    <small className="bw-chat__met">déjà croisé</small>
                  ) : null}
                  {canDm && person.card!.handle !== myHandle ? (
                    <button
                      type="button"
                      className="bw-chat__dm"
                      aria-label={`Message privé à ${person.card!.pseudo}`}
                      onClick={() => setDmTo(person.card)}
                    >
                      <Mail size={15} aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {met?.total ? (
            <p>
              Vous avez déjà croisé {met.total} voyageur{met.total > 1 ? "s" : ""} sur BledWay
              {metHere.size ? `, dont ${metHere.size} sur cette traversée` : ""}.
            </p>
          ) : null}
          {online > named.length ? (
            <p>
              {online - named.length} visiteur{online - named.length > 1 ? "s" : ""} sans compte
            </p>
          ) : null}
        </div>
      ) : null}
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
        {/* Le mot d'accueil de BledWay : affiché à chacun, jamais enregistré dans le fil. */}
        <li className="bw-chat__welcome">
          <AuthorAvatar author={BLEDWAY} size={26} />
          <div>
            <p className="bw-chat__welcome-who">
              <b>BledWay</b>
              <StaffBadge author={BLEDWAY} />
            </p>
            <p>
              Salam{myPseudo ? ` ${myPseudo}` : ""} et bienvenue ! Ici on s'entraide entre
              voyageurs :{" "}
              {kind === "port"
                ? "la file, le parking, l'ambiance sur le port"
                : "la file au port, l'ambiance à bord, l'état de la mer"}
              . Restez courtois, ne partagez ni numéro ni lien, et signalez plutôt que de répondre
              à un message gênant.{" "}
              <a href="/charte" target="_blank" rel="noreferrer">
                Lire la charte
              </a>
            </p>
          </div>
        </li>
        {lines.length ? null : (
          <li className="bw-chat__hello">Soyez le premier ou la première à écrire ici.</li>
        )}
        {lines.map((message) => (
          <li
            key={message.id}
            data-me={message.me || undefined}
            data-mention={
              message.reply_to?.me ||
              Boolean(myHandle && message.body.includes(`@[${myHandle}]`)) ||
              undefined
            }
          >
            <AuthorAvatar author={message.author} size={26} />
            <div>
              {message.reply_to ? (
                <p className="bw-chat__quote">
                  <CornerDownRight size={12} aria-hidden />
                  <b>{message.reply_to.me ? "Vous" : message.reply_to.pseudo}</b>
                  <span>
                    <ChatText body={message.reply_to.body} size={14} />
                  </span>
                </p>
              ) : null}
              <button
                type="button"
                className="bw-chat__line"
                aria-expanded={selected === message.id}
                onClick={() => setSelected(selected === message.id ? null : message.id)}
              >
                <b>{message.me && !message.author.official ? "Vous" : message.author.pseudo}</b>
                <StaffBadge author={message.author} />
                {/* Le badge de l'équipe dit déjà d'où vient le message. */}
                {message.place === "staff" && !message.crossing ? null : (
                  <small data-place={message.place}>{message.crossing ?? PLACE[message.place]}</small>
                )}
                <span data-big={onlyEmotes(message.body) || undefined}>
                  <ChatText body={message.body} mentions={message.mentions} myHandle={myHandle} />
                </span>
                {metHere.has(message.author.handle) && !message.me ? (
                  <small className="bw-chat__met">déjà croisé</small>
                ) : null}
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
                  {closed ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(message);
                        setSelected(null);
                        inputRef.current?.focus();
                      }}
                    >
                      <Reply size={13} aria-hidden /> Répondre
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={message.reacted}
                    disabled={react.isPending}
                    onClick={() => react.mutate(message.id)}
                  >
                    <ThumbsUp size={13} aria-hidden /> Pareil ici
                  </button>
                  {canWrite && !closed && !message.me && !message.author.official ? (
                    <button
                      type="button"
                      onClick={() => {
                        mention(message.author, false);
                        setSelected(null);
                      }}
                    >
                      <AtSign size={13} aria-hidden /> Mentionner
                    </button>
                  ) : null}
                  {canDm && !message.me && !message.author.official ? (
                    <button type="button" onClick={() => setDmTo(message.author)}>
                      <Mail size={13} aria-hidden /> Message privé
                    </button>
                  ) : null}
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
                  {staff && !message.me ? <StaffTools id={message.id} author={message.author} /> : null}
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
      {notHere && onAskLine && portLines.length ? (
        <div role="alert" className="bw-chat__elsewhere">
          <p>
            <b>Vous n'êtes pas sur le port.</b> Ce salon est réservé à ceux qui y sont. Posez
            plutôt votre question aux voyageurs d'une ligne : ils vous répondront.
          </p>
          <div>
            {portLines.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (text.trim()) rememberQuestionDraft(item.id, text.trim());
                  setText("");
                  send.reset();
                  onAskLine(item.id);
                }}
              >
                <CircleHelp size={14} aria-hidden /> {item.line}
              </button>
            ))}
          </div>
        </div>
      ) : problem ? (
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
          {replyTo ? (
            <p className="bw-chat__replying">
              <Reply size={13} aria-hidden />
              <span>
                Répondre à <b>{replyTo.me ? "vous-même" : replyTo.author.pseudo}</b> :{" "}
                {replyTo.body}
              </span>
              <button
                type="button"
                aria-label="Annuler la réponse"
                onClick={() => setReplyTo(null)}
              >
                <X size={15} aria-hidden />
              </button>
            </p>
          ) : null}
          {showEmotes ? (
            <div className="bw-chat__panel">
              {siteEmotes.length ? (
                <p className="bw-chat__site-emotes">
                  {siteEmotes.map((emote) => (
                    <button
                      key={emote.code}
                      type="button"
                      aria-label={emote.label}
                      title={emote.label}
                      onClick={() =>
                        setText((value) =>
                          `${value}${value && !value.endsWith(" ") ? " " : ""}${emoteToken(emote.code)} `.slice(
                            0,
                            MAX_MESSAGE,
                          ),
                        )
                      }
                    >
                      <CabasImg src={emote.image} alt="" width={40} height={40} loading="lazy" />
                    </button>
                  ))}
                </p>
              ) : null}
              <p className="bw-chat__emotes">
                {UNICODE_EMOTES.map((emote) => (
                  <button
                    key={emote}
                    type="button"
                    aria-label={`Ajouter ${emote}`}
                    onClick={() => setText((value) => `${value}${emote}`.slice(0, MAX_MESSAGE))}
                  >
                    {emote}
                  </button>
                ))}
              </p>
            </div>
          ) : text || replyTo ? null : (
            <p className="bw-chat__examples">
              {roomExamples(kind === "port" ? "port" : moment).map((example) => (
                <button key={example} type="button" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </p>
          )}
          {suggestions.length ? (
            <ul className="bw-chat__mentions" aria-label="Mentionner un voyageur">
              {suggestions.map((card) => (
                <li key={card.handle}>
                  <button type="button" onClick={() => mention(card, true)}>
                    <TravellerAvatar card={card} size={22} mood={false} />
                    {card.pseudo}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/:[a-z0-9_]+:/.test(text) ? (
            <p className="bw-chat__draft">
              <ChatText body={text} size={22} />
            </p>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <button
              type="button"
              className="bw-chat__emote-toggle"
              aria-label="Émoticônes"
              aria-expanded={showEmotes}
              onClick={() => setShowEmotes((value) => !value)}
            >
              <Smile size={20} aria-hidden />
            </button>
            <input
              ref={inputRef}
              value={text}
              maxLength={MAX_MESSAGE}
              onChange={(event) => setText(event.target.value)}
              placeholder={replyTo ? "Votre réponse" : "Envoyer un message"}
              aria-label="Votre message"
            />
            {text.length > MAX_MESSAGE - 40 ? <small>{MAX_MESSAGE - text.length}</small> : null}
            {staff ? (
              <label className="bw-chat__official" title="Le message s'affiche au nom de BledWay">
                <input
                  type="checkbox"
                  checked={official}
                  onChange={(event) => setOfficial(event.target.checked)}
                />
                BledWay
              </label>
            ) : null}
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
  onAskLine,
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment?: RoomMoment;
  onAskLine?: (routeId: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const feed = useQuery(chatFeedQuery(kind, room, user?.id));
  const card = useQuery(myTravellerQuery(user?.id)).data ?? null;
  const people = useRoomChannel(kind, room, open, card);
  const online = people.length;
  useBackClose(open, () => setOpen(false));
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
  const canWrite =
    feed.data?.access === "member" ||
    feed.data?.access === "position" ||
    feed.data?.access === "staff";
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
              <b>{message.me && !message.author.official ? "Vous" : message.author.pseudo}</b>{" "}
              <StaffBadge author={message.author} />{" "}
              <ChatText body={message.body} size={18} mentions={message.mentions} />
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="bw-room__enter" onClick={() => setOpen(true)}>
        <MessagesSquare size={18} aria-hidden />
        Rejoindre le salon
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
            people={people}
            myHandle={card?.handle}
            myPseudo={card?.pseudo}
            charter={feed.data?.charter}
            muted={Boolean(feed.data?.muted)}
            onAskLine={
              onAskLine
                ? (routeId) => {
                    setOpen(false);
                    afterOverlayClose(() => onAskLine(routeId));
                  }
                : undefined
            }
            staff={Boolean(feed.data?.staff)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
