import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PinnedInfo } from "./PinnedInfo";
import { track } from "@/lib/usage";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  AtSign,
  Bell,
  BellOff,
  Camera,
  CircleHelp,
  CornerDownRight,
  Flag,
  Mail,
  MessagesSquare,
  Reply,
  Send,
  Smile,
  ThumbsUp,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { Dialog, DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RoomSheet } from "./RoomSheet";
import {
  PENDING_INVITE_EVENT,
  pendingRoomInvite,
  roomInviteInfoQuery,
} from "@/lib/ferry/roomGuests";
import { useAuth } from "@/hooks/useAuth";
import { useTravelAction } from "@/hooks/useTravelAction";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  myTravellerQuery,
  openTravellerProfile,
  type TravellerCard,
} from "@/lib/community/travellers";
import { afterOverlayClose, useBackClose } from "@/lib/ferry/backStack";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { OPEN_MY_ROOM_EVENT, OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
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
import { chatStartersQuery, startersFor, type StarterContext } from "@/lib/ferry/chatStarters";
import { currentPosition } from "@/lib/ferry/community";
import { chatRefusal, roomExamples, type RoomMoment } from "@/lib/ferry/portPassage";
import { emoteToken, UNICODE_EMOTES } from "@/lib/ferry/chatEmotes";
import { dmInboxQuery, dmKey, metQuery, takeDmFocus } from "@/lib/ferry/privateMessages";
import { CabasImg } from "@/components/CabasImg";
import { ChatText, useChatEmotes } from "./ChatText";
import { LibraryPicker } from "@/components/community/LibraryPicker";
import { useLibrary } from "@/lib/community/library";
import { OwnMessageActions } from "./OwnMessageActions";
import { DmRequest, PrivateMessages } from "./PrivateMessages";
import { AuthorAvatar, StaffBadge, StaffTools, type ChatAuthor } from "./StaffChat";
import { PHOTO_ACCEPT, PhotoPicker, PhotoStrip } from "@/components/photos/Photos";
import { photosKey, photosQuery, sendChatPhoto, type PreparedPhoto } from "@/lib/photos/photos";
import { tr } from "@/lib/i18n";

const supabase = typedSupabase as unknown as SupabaseClient;
export const MAX_MESSAGE = 200;

type RoomKind = "crossing" | "port";
type Message = {
  id: string;
  body: string;
  place: "aboard" | "port" | "trip" | "staff" | "guest";
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
  access: "read" | "member" | "position" | "staff" | "guest";
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
const PLACE = {
  aboard: "à bord",
  port: "au port",
  trip: "passager",
  staff: "équipe BledWay",
  guest: "invité",
} as const;
const missing = (code?: string) => code === "PGRST202" || code === "42883";
/** En dessous, on considère que la personne suit le direct : le fil descend tout seul. */
const FOLLOW_BOTTOM_PX = 80;
const PREVIEW_MESSAGES = 3;
/** Un message fait seulement d'émoticônes s'affiche en grand. */
const onlyEmotes = (text: string) =>
  text.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|\s/gu, "") === "";
type Present = { key: string; card: TravellerCard | null };
export const roomKey = (kind: RoomKind, room: string) => ["bw-chat", kind, room] as const;

// Messages signalés par cet appareil : masqués pour la personne qui les a signalés.
const REPORTED_KEY = "bledway:chat-reported";
function readReported(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(REPORTED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveReported(ids: Set<string>) {
  try {
    window.localStorage.setItem(REPORTED_KEY, JSON.stringify([...ids].slice(-300)));
  } catch {
    /* stockage plein ou interdit : le masquage dure le temps de la page */
  }
}

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
      <MessagesSquare size={15} aria-hidden />
      {tr("ui.liveRoom.salon")}
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
  guest = false,
  charter,
  muted = false,
  onAskLine,
  starterContext,
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
  /** Invité par un passager : écrit ici, sans messages privés. */
  guest?: boolean;
  charter?: boolean | undefined;
  muted?: boolean;
  /** Salon du port, hors du port : passer la question aux voyageurs d'une ligne. */
  onAskLine?: ((routeId: string) => void) | undefined;
  starterContext?: StarterContext | undefined;
}) {
  const starters = useQuery(chatStartersQuery).data;
  const { user } = useAuth();
  const request = useTravelAction();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [official, setOfficial] = useState(false);
  // Les @Pseudo choisis dans la liste, transformés en mentions à l'envoi.
  const chosen = useRef(new Map<string, string>());
  const gate = useCharterGate(charter);
  const [selected, setSelected] = useState<string | null>(null);
  // Défilement ou saisie : l'info épinglée se replie pour laisser la place à la conversation.
  const [pinActivity, setPinActivity] = useState(0);
  const nudgePin = () => setPinActivity((value) => value + 1);
  // Signalement : confirmation avant l’envoi, puis le message disparaît pour la personne qui l’a signalé.
  const [confirmReport, setConfirmReport] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(() => readReported());
  const [reportDone, setReportDone] = useState(false);
  const [unread, setUnread] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  // Une photo par personne et par salon, filtrée sur l'appareil puis publiée avec le message.
  const [showPhoto, setShowPhoto] = useState(false);
  const [chatPhotos, setChatPhotos] = useState<PreparedPhoto[]>([]);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [incoming, setIncoming] = useState<File[] | null>(null);
  // Un toucher sur l'appareil photo ou la galerie : la photo arrive directement dans le salon.
  const pickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setIncoming([...files]);
    setShowPhoto(true);
  };
  const [dmView, setDmView] = useState<"inbox" | null>(() => (takeDmFocus() ? "inbox" : null));
  const [dmTo, setDmTo] = useState<TravellerCard | null>(null);
  const siteEmotes = useChatEmotes();
  const library = useLibrary();
  // Une image de la bibliothèque s'écrit :code: dans le message.
  const addEmote = (code: string) =>
    setText((value) =>
      `${value}${value && !value.endsWith(" ") ? " " : ""}${emoteToken(code)} `.slice(
        0,
        MAX_MESSAGE,
      ),
    );
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
  const canDm =
    kind === "crossing" && canWrite && !guest && !closed && Boolean(user) && inbox !== null;
  // Invitation reçue par lien, pas encore acceptée (pas de compte) : on écrit, le compte se crée à l'envoi.
  const [invite, setInvite] = useState(() => (kind === "crossing" ? pendingRoomInvite() : null));
  useEffect(() => {
    const sync = () => setInvite(kind === "crossing" ? pendingRoomInvite() : null);
    window.addEventListener(PENDING_INVITE_EVENT, sync);
    return () => window.removeEventListener(PENDING_INVITE_EVENT, sync);
  }, [kind]);
  const invitedHere = !canWrite && invite?.departureId === room ? invite : null;
  const inviteInfo = useQuery(roomInviteInfoQuery(invitedHere?.token ?? null)).data;
  // Je suis une autre traversée : ce salon se lit, et l'on y réagit avec « Pareil ici », sans écrire.
  const { trip: myTrip } = useMyTrip();
  const reader =
    kind === "crossing" && !canWrite && !staff && Boolean(myTrip) && myTrip?.departure.id !== room;
  // Fermer ce salon, puis ouvrir la liste des salons (ou le mien).
  const leaveFor = (event: string) =>
    afterOverlayClose(() => window.dispatchEvent(new Event(event)));
  const inputRef = useRef<HTMLInputElement>(null);
  const online = people.length;
  const named = people.filter((person) => person.card);
  const listRef = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const lastId = useRef<string | null>(null);
  const lines = [...messages].reverse().filter((message) => !reported.has(message.id));
  const messagePhotos = useQuery(
    photosQuery(
      "chat",
      messages.map((message) => message.id),
    ),
  ).data;
  const refresh = () => void client.invalidateQueries({ queryKey: roomKey(kind, room) });
  const toBottom = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    following.current = true;
    setUnread(0);
  };
  const send = useMutation({
    mutationFn: async () => {
      const photo = chatPhotos[0];
      await postToRoom(
        kind,
        room,
        text.trim() ? withMentions(text, chosen.current) : "📷",
        undefined,
        replyTo?.id,
        staff && official,
      );
      if (photo && user) await sendChatPhoto(kind, room, user.id, photo);
    },
    onSuccess: () => {
      track("message-salon", kind);
      chatPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setChatPhotos([]);
      setPhotoConsent(false);
      setShowPhoto(false);
      void client.invalidateQueries({ queryKey: photosKey });
      setText("");
      setReplyTo(null);
      setShowEmotes(false);
      following.current = true;
      refresh();
    },
  });
  const react = useMutation({
    mutationFn: async (id: string) => {
      const here = kind === "port" && !reader ? await currentPosition() : null;
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
      const { data, error } = await supabase.rpc("bw_chat_report", { p_message: id });
      const result = data as { ok?: boolean; refused?: string } | null;
      if (error || !result?.ok)
        throw new Error("Signalement non envoyé. Réessayez dans un instant.");
      return id;
    },
    onSuccess: (id) => {
      setReported((current) => {
        const next = new Set(current).add(id);
        saveReported(next);
        return next;
      });
      setConfirmReport(null);
      setSelected(null);
      setReportDone(true);
      window.setTimeout(() => setReportDone(false), 4000);
      refresh();
    },
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
    if (!text.trim() && !chatPhotos.length) return;
    if (chatPhotos.length && !photoConsent) return;
    if (canWrite) {
      gate.guard(() => send.mutate());
      return;
    }
    rememberPendingChat({ kind, room, body: text, ...(replyTo ? { replyTo: replyTo.id } : {}) });
    request(
      invitedHere && inviteInfo?.open
        ? { type: "chat", label: title, invite: invitedHere.token }
        : kind === "crossing"
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
      [
        ...messages.map((message) => message.author as ChatAuthor),
        ...named.map((person) => person.card as ChatAuthor),
      ]
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
            .sort(
              (a, b) => Number(b.departure_port_id === room) - Number(a.departure_port_id === room),
            )
            .map((route) => {
              const other =
                route.departure_port_id === room ? route.arrival_port_id : route.departure_port_id;
              return [
                other,
                { id: route.id, line: `${portName(room)} ↔ ${portName(other)}` },
              ] as const;
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
      {/* En-tête compact : deux lignes, la hauteur va à la conversation. */}
      <header className="bw-chat__head" data-tools={user ? (inbox !== null ? 2 : 1) : 0}>
        <div className="bw-chat__headtools">
          {user && inbox !== null ? (
            <button
              type="button"
              className="bw-chat__mail"
              aria-label={
                dmUnread ? `Messages privés, ${dmUnread} non lus` : tr("ui.liveRoom.messagesPrives")
              }
              onClick={() => setDmView("inbox")}
            >
              <Mail size={18} aria-hidden />
              {dmUnread ? <b>{dmUnread}</b> : null}
            </button>
          ) : null}
          {user ? (
            <button
              type="button"
              className="bw-chat__mute"
              aria-pressed={muted}
              disabled={mute.isPending}
              title={
                muted
                  ? tr("ui.liveRoom.reactiverLesNotificationsDeCe")
                  : tr("ui.liveRoom.mettreCeSalonEnSourdine")
              }
              aria-label={
                muted
                  ? tr("ui.liveRoom.reactiverLesNotificationsDeCe")
                  : tr("ui.liveRoom.mettreCeSalonEnSourdine")
              }
              onClick={() => mute.mutate()}
            >
              {muted ? <BellOff size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
            </button>
          ) : null}
        </div>
        <DialogTitle>{title}</DialogTitle>
        <div className="bw-chat__headrow">
          <span className="bw-chat__live">
            <i aria-hidden />
            {tr("ui.liveRoom.enDirect")}
          </span>
          <DialogDescription asChild>
            <button
              type="button"
              className="bw-chat__online"
              aria-expanded={showPeople}
              onClick={() => setShowPeople((value) => !value)}
            >
              <Users size={13} aria-hidden />{" "}
              {online ? `${online} en ligne` : tr("ui.liveRoom.vousEtesIci")}
            </button>
          </DialogDescription>
          {kind === "crossing" ? (
            <DialogClose asChild>
              <button
                type="button"
                className="bw-chat__others"
                title={tr("ui.liveRoom.uneAutreDateChoisirUn")}
                onClick={() => leaveFor(OPEN_ROOM_PICKER_EVENT)}
              >
                <MessagesSquare size={13} aria-hidden />
                {tr("ui.liveRoom.autresSalons")}
              </button>
            </DialogClose>
          ) : null}
        </div>
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
                    <small className="bw-chat__met">{tr("ui.liveRoom.dejaCroise")}</small>
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
              {tr("ui.liveRoom.vousAvezDejaCroise")}
              {met.total}
              {tr("ui.liveRoom.voyageur")}
              {met.total > 1 ? "s" : ""}
              {tr("ui.liveRoom.surBledway")}
              {metHere.size ? `, dont ${metHere.size} sur cette traversée` : ""}.
            </p>
          ) : null}
          {online > named.length ? (
            <p>
              {online - named.length}
              {tr("ui.liveRoom.visiteur")}
              {online - named.length > 1 ? "s" : ""}
              {tr("ui.liveRoom.sansCompte")}
            </p>
          ) : null}
        </div>
      ) : null}
      <PinnedInfo kind={kind} room={room} activity={pinActivity} />
      <ol
        ref={listRef}
        onWheel={nudgePin}
        onTouchMove={nudgePin}
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
          <AuthorAvatar author={BLEDWAY} size={22} />
          <div>
            <p>
              <b className="bw-chat__welcome-who">{tr("ui.liveRoom.bledway")}</b>{" "}
              <StaffBadge author={BLEDWAY} /> {tr("ui.liveRoom.salam")}
              {myPseudo ? ` ${myPseudo}` : ""}
              {tr("ui.liveRoom.bienvenueOnSEntraideEntre")}{" "}
              {kind === "port"
                ? tr("ui.liveRoom.laFileLeParkingL")
                : tr("ui.liveRoom.laFileAuPortL")}
            </p>
            <details className="bw-chat__rules">
              <summary>{tr("ui.liveRoom.lesReglesDuSalon")}</summary>
              <p>
                {tr("ui.liveRoom.restezCourtoisNePartagezNi")}{" "}
                <a href="/charte" target="_blank" rel="noreferrer">
                  {tr("ui.liveRoom.lireLaCharte")}
                </a>
              </p>
            </details>
          </div>
        </li>
        {lines.length ? null : (
          <li className="bw-chat__hello">{tr("ui.liveRoom.soyezLePremierOuLa")}</li>
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
                  <b>{message.reply_to.me ? tr("ui.liveRoom.vous") : message.reply_to.pseudo}</b>
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
                {/* Comme sur les réseaux sociaux : le pseudo ouvre le profil (le reste de la ligne, les actions). */}
                {message.author.official ? (
                  <b>{message.author.pseudo}</b>
                ) : (
                  <b
                    className="bw-chat__who"
                    onClick={(event) => {
                      event.stopPropagation();
                      openTravellerProfile(message.author.handle);
                    }}
                  >
                    {message.me ? tr("ui.liveRoom.vous") : message.author.pseudo}
                  </b>
                )}
                <StaffBadge author={message.author} />
                {/* Le badge de l'équipe dit déjà d'où vient le message. */}
                {message.place === "staff" && !message.crossing ? null : (
                  <small data-place={message.place}>
                    {message.crossing ?? PLACE[message.place]}
                  </small>
                )}
                <span data-big={onlyEmotes(message.body) || undefined}>
                  <ChatText body={message.body} mentions={message.mentions} myHandle={myHandle} />
                </span>
                <PhotoStrip
                  photos={messagePhotos?.get(message.id)}
                  label={tr("ui.liveRoom.photoDuMessage")}
                />
                {metHere.has(message.author.handle) && !message.me ? (
                  <small className="bw-chat__met">{tr("ui.liveRoom.dejaCroise")}</small>
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
                    {message.edited ? tr("ui.liveRoom.modifie") : ""}
                  </time>
                  {closed || reader ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(message);
                        setSelected(null);
                        inputRef.current?.focus();
                      }}
                    >
                      <Reply size={13} aria-hidden />
                      {tr("ui.liveRoom.repondre")}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={message.reacted}
                    disabled={react.isPending}
                    onClick={() => react.mutate(message.id)}
                  >
                    <ThumbsUp size={13} aria-hidden />
                    {tr("ui.liveRoom.pareilIci")}
                  </button>
                  {!message.author.official ? (
                    <button
                      type="button"
                      onClick={() => openTravellerProfile(message.author.handle)}
                    >
                      <UserRound size={13} aria-hidden />
                      {message.me ? "Mon profil" : "Voir le profil"}
                    </button>
                  ) : null}
                  {canWrite && !closed && !message.me && !message.author.official ? (
                    <button
                      type="button"
                      onClick={() => {
                        mention(message.author, false);
                        setSelected(null);
                      }}
                    >
                      <AtSign size={13} aria-hidden />
                      {tr("ui.liveRoom.mentionner")}
                    </button>
                  ) : null}
                  {canDm && !message.me && !message.author.official ? (
                    <button type="button" onClick={() => setDmTo(message.author)}>
                      <Mail size={13} aria-hidden />
                      {tr("ui.liveRoom.messagePrive")}
                    </button>
                  ) : null}
                  {user && !message.me ? (
                    confirmReport === message.id ? (
                      <span
                        className="bw-chat__confirm"
                        role="group"
                        aria-label={tr("ui.liveRoom.confirmerLeSignalement")}
                      >
                        {tr("ui.liveRoom.signalerCeMessageAL")}
                        <button
                          type="button"
                          className="bw-chat__confirm-yes"
                          disabled={report.isPending}
                          onClick={() => report.mutate(message.id)}
                        >
                          {report.isPending
                            ? tr("ui.liveRoom.envoi")
                            : tr("ui.liveRoom.ouiSignaler")}
                        </button>
                        <button type="button" onClick={() => setConfirmReport(null)}>
                          {tr("ui.liveRoom.annuler")}
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmReport(message.id)}>
                        <Flag size={13} aria-hidden />
                        {tr("ui.liveRoom.signaler")}
                      </button>
                    )
                  ) : null}
                  {message.me ? (
                    <OwnMessageActions
                      id={message.id}
                      body={message.body}
                      photoPaths={(messagePhotos?.get(message.id) ?? []).map((photo) => photo.path)}
                    />
                  ) : null}
                  {staff && !message.me ? (
                    <StaffTools id={message.id} author={message.author} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {unread ? (
        <button type="button" className="bw-chat__unread" onClick={toBottom}>
          <ArrowDown size={14} aria-hidden /> {unread}
          {tr("ui.liveRoom.nouveau")}
          {unread > 1 ? "x" : ""}
          {tr("ui.liveRoom.message")}
          {unread > 1 ? "s" : ""}
        </button>
      ) : null}
      {notHere && onAskLine && portLines.length ? (
        <div role="alert" className="bw-chat__elsewhere">
          <p>
            <b>{tr("ui.liveRoom.vousNEtesPasSur")}</b>
            {tr("ui.liveRoom.ceSalonEstReserveA")}
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
      ) : reportDone ? (
        <p role="status" className="bw-chat__reported">
          {tr("ui.liveRoom.merciLeMessageEstSignale")}
        </p>
      ) : null}
      {invitedHere && inviteInfo?.open && !closed ? (
        <p className="bw-chat__guest-note" role="status">
          <UserPlus size={15} aria-hidden />
          <span>
            <b>{inviteInfo.inviter}</b> vous invite dans ce salon. Écrivez votre message : votre
            compte gratuit se crée à l'envoi.
          </span>
        </p>
      ) : null}
      {closed ? (
        <p className="bw-chat__closed">{tr("ui.liveRoom.ceSalonEstFermeA")}</p>
      ) : reader ? (
        <div className="bw-chat__closed bw-chat__reader">
          <p>{tr("ui.liveRoom.salonEnLectureVousSuivez")}</p>
          <DialogClose asChild>
            <button type="button" onClick={() => leaveFor(OPEN_MY_ROOM_EVENT)}>
              {tr("ui.liveRoom.revenirAMonSalon")}
            </button>
          </DialogClose>
        </div>
      ) : (
        <div className="bw-chat__write">
          {replyTo ? (
            <p className="bw-chat__replying">
              <Reply size={13} aria-hidden />
              <span>
                {tr("ui.liveRoom.repondreA")}
                <b>{replyTo.me ? tr("ui.liveRoom.vousMeme") : replyTo.author.pseudo}</b> :{" "}
                {replyTo.body}
              </span>
              <button
                type="button"
                aria-label={tr("ui.liveRoom.annulerLaReponse")}
                onClick={() => setReplyTo(null)}
              >
                <X size={15} aria-hidden />
              </button>
            </p>
          ) : null}
          {showEmotes ? (
            <div className="bw-chat__panel">
              {library.managed ? (
                // Toute la bibliothèque, par catégories, avec recherche.
                <LibraryPicker
                  onPick={(row) => addEmote(row.id)}
                  ariaLabel="Émoticônes BledWay"
                  labels={false}
                  size={36}
                  compact
                />
              ) : siteEmotes.length ? (
                <p className="bw-chat__site-emotes">
                  {siteEmotes.map((emote) => (
                    <button
                      key={emote.code}
                      type="button"
                      aria-label={emote.label}
                      title={emote.label}
                      onClick={() => addEmote(emote.code)}
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
              {startersFor(
                kind === "port" ? "port" : moment === "over" ? "sea" : moment,
                starters,
                starterContext ?? {},
                roomExamples(kind === "port" ? "port" : moment),
              ).map((example) => (
                <button key={example} type="button" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </p>
          )}
          {suggestions.length ? (
            <ul className="bw-chat__mentions" aria-label={tr("ui.liveRoom.mentionnerUnVoyageur")}>
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
          {(showPhoto || chatPhotos.length) && canWrite && user ? (
            <div className="bw-chat__photo">
              <PhotoPicker
                max={1}
                photos={chatPhotos}
                onChange={setChatPhotos}
                incoming={incoming}
                onIncomingDone={() => setIncoming(null)}
                hideSources
                consent={photoConsent}
                onConsent={setPhotoConsent}
                note="Une photo par personne dans ce salon, vérifiée automatiquement puis publiée avec votre message."
              />
              {chatPhotos.length ? (
                <button
                  type="button"
                  className="bw-chat__photo-send"
                  disabled={send.isPending || !photoConsent}
                  onClick={submit}
                >
                  <Send size={15} aria-hidden />
                  {send.isPending
                    ? tr("ui.liveRoom.envoi")
                    : tr("ui.liveRoom.envoyerAvecCettePhoto")}
                </button>
              ) : null}
            </div>
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
              aria-label={tr("ui.liveRoom.emoticones")}
              aria-expanded={showEmotes}
              onClick={() => setShowEmotes((value) => !value)}
            >
              <Smile size={20} aria-hidden />
            </button>
            {canWrite && user ? (
              <label
                className="bw-chat__emote-toggle"
                aria-label={tr("ui.liveRoom.ajouterUnePhoto")}
                title={tr("ui.liveRoom.ajouterUnePhoto")}
                data-filled={chatPhotos.length ? "" : undefined}
                onPointerDown={() =>
                  void import("@/lib/photos/nsfw").then((m) => m.warmChatPhotoCheck())
                }
              >
                <Camera size={19} aria-hidden />
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  hidden
                  onChange={(event) => {
                    pickFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            <input
              ref={inputRef}
              value={text}
              maxLength={MAX_MESSAGE}
              onChange={(event) => setText(event.target.value)}
              onFocus={nudgePin}
              placeholder={
                replyTo ? tr("ui.liveRoom.votreReponse") : tr("ui.liveRoom.envoyerUnMessage")
              }
              aria-label={tr("ui.liveRoom.votreMessage")}
            />
            {text.length > MAX_MESSAGE - 40 ? <small>{MAX_MESSAGE - text.length}</small> : null}
            {staff ? (
              <label className="bw-chat__official" title={tr("ui.liveRoom.leMessageSAfficheAu")}>
                <input
                  type="checkbox"
                  checked={official}
                  onChange={(event) => setOfficial(event.target.checked)}
                />
                {tr("ui.liveRoom.bledway")}
              </label>
            ) : null}
            <button
              type="submit"
              disabled={
                (!text.trim() && !chatPhotos.length) ||
                (chatPhotos.length > 0 && !photoConsent) ||
                send.isPending
              }
              aria-label={tr("ui.liveRoom.envoyer")}
            >
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
  starterContext,
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment?: RoomMoment;
  onAskLine?: (routeId: string) => void;
  /** Ports, navire, compagnie : de quoi contextualiser les phrases d'amorce. */
  starterContext?: StarterContext;
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
    feed.data?.access === "guest" ||
    feed.data?.access === "staff";
  const closed = kind === "crossing" && moment === "over";
  const preview = messages.slice(0, PREVIEW_MESSAGES).reverse();
  return (
    <section className="bw-room" aria-label={title}>
      <header>
        <MessagesSquare size={17} aria-hidden />
        <h3>{title}</h3>
        <small className="bw-chat__live">
          <i aria-hidden /> {online ? `${online} en ligne` : tr("ui.liveRoom.enDirect2")}
        </small>
      </header>
      {preview.length ? (
        <ol className="bw-room__preview">
          {preview.map((message) => (
            <li key={message.id}>
              <b>
                {message.me && !message.author.official
                  ? tr("ui.liveRoom.vous")
                  : message.author.pseudo}
              </b>{" "}
              <StaffBadge author={message.author} />{" "}
              <ChatText body={message.body} size={18} mentions={message.mentions} />
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="bw-room__enter" onClick={() => setOpen(true)}>
        <MessagesSquare size={18} aria-hidden />
        {tr("ui.liveRoom.rejoindreLeSalon")}
      </button>
      <RoomSheet
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        room={room}
        title={title}
        canInvite={feed.data?.access === "member" || feed.data?.access === "staff"}
      >
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
          starterContext={starterContext}
          onAskLine={
            onAskLine
              ? (routeId) => {
                  setOpen(false);
                  afterOverlayClose(() => onAskLine(routeId));
                }
              : undefined
          }
          staff={Boolean(feed.data?.staff)}
          guest={feed.data?.access === "guest"}
        />
      </RoomSheet>
    </section>
  );
}

/**
 * Le même salon, ouvert directement dans la page (« Mon voyage ») plutôt que dans une fenêtre :
 * mêmes messages, même charte, mêmes droits d'écriture que LiveRoom.
 */
export function EmbeddedRoom({
  kind,
  room,
  title,
  moment = "before",
  starterContext,
}: {
  kind: RoomKind;
  room: string;
  title: string;
  moment?: RoomMoment;
  starterContext?: StarterContext;
}) {
  const { user } = useAuth();
  const feed = useQuery(chatFeedQuery(kind, room, user?.id));
  const card = useQuery(myTravellerQuery(user?.id)).data ?? null;
  const people = useRoomChannel(kind, room, true, card);
  // Module pas encore activé en base : rien à afficher.
  if (feed.data === null) return null;
  const canWrite =
    feed.data?.access === "member" ||
    feed.data?.access === "position" ||
    feed.data?.access === "guest" ||
    feed.data?.access === "staff";
  // LiveChat pose son titre comme celui d'une fenêtre : le contexte suffit, sans rien ouvrir.
  return (
    <div className="bw-chat-embedded">
      <Dialog open>
        <LiveChat
          kind={kind}
          room={room}
          title={title}
          moment={moment}
          messages={feed.data?.messages ?? []}
          canWrite={canWrite}
          closed={kind === "crossing" && moment === "over"}
          people={people}
          myHandle={card?.handle}
          myPseudo={card?.pseudo}
          charter={feed.data?.charter}
          muted={Boolean(feed.data?.muted)}
          starterContext={starterContext}
          staff={Boolean(feed.data?.staff)}
          guest={feed.data?.access === "guest"}
        />
      </Dialog>
    </div>
  );
}
