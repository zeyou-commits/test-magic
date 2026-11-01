import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessagesSquare, Send, ThumbsUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { TravellerCard } from "@/lib/community/travellers";
import { currentPosition } from "@/lib/ferry/community";
import { chatRefusal } from "@/lib/ferry/portPassage";

const supabase = typedSupabase as unknown as SupabaseClient;
export const MAX_MESSAGE = 200;

type RoomKind = "crossing" | "port";
type Message = {
  id: string;
  body: string;
  place: "aboard" | "port" | "trip";
  created_at: string;
  me: boolean;
  author: TravellerCard;
  same: number;
  reacted: boolean;
};
type Feed = { access: "read" | "member" | "position"; messages: Message[] };

const PLACE = { aboard: "à bord", port: "au port", trip: "passager" } as const;
const missing = (code?: string) => code === "PGRST202" || code === "42883";
export const roomKey = (kind: RoomKind, room: string) => ["bw-chat", kind, room] as const;

export async function postToRoom(kind: RoomKind, room: string, body: string) {
  const here = kind === "port" ? await currentPosition() : null;
  const { data, error } = await supabase.rpc("bw_chat_post", {
    p_kind: kind,
    p_room: room,
    p_body: body,
    p_lat: here?.[1] ?? null,
    p_lon: here?.[0] ?? null,
  });
  if (error) throw new Error("Message non envoyé. Réessayez.");
  const result = data as { ok: boolean; refused?: string };
  if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
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
    refetchInterval: 15_000,
  });

/** Entrée du salon depuis Ma traversée : la fiche s'ouvre, puis on descend jusqu'au salon. */
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
        window.setTimeout(() => document.querySelector(".bw-room")?.scrollIntoView(), 700);
      }}
    >
      <MessagesSquare size={15} aria-hidden /> Salon de la traversée
      {count ? ` · ${count === 80 ? "80+" : count} message${count > 1 ? "s" : ""}` : ""}
    </button>
  );
}

/** Salon en direct : tout le monde lit ; seuls les passagers et les personnes sur le port écrivent. */
export function LiveRoom({ kind, room, title }: { kind: RoomKind; room: string; title: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const feed = useQuery(chatFeedQuery(kind, room, user?.id));
  const refresh = () => void client.invalidateQueries({ queryKey: roomKey(kind, room) });
  const send = useMutation({
    mutationFn: () => postToRoom(kind, room, text),
    onSuccess: () => {
      setText("");
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
  // Module pas encore activé en base : rien à afficher.
  if (feed.data === null) return null;
  const messages = feed.data?.messages ?? [];
  const canWrite = feed.data?.access === "member" || feed.data?.access === "position";
  const problem = send.error ?? react.error ?? report.error;
  return (
    <section className="bw-room" aria-label={title}>
      <header>
        <MessagesSquare size={17} aria-hidden />
        <h3>{title}</h3>
        <small>
          {messages.length
            ? `${messages.length} message${messages.length > 1 ? "s" : ""}`
            : "En direct"}
        </small>
      </header>
      {canWrite ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) send.mutate();
          }}
        >
          <input
            value={text}
            maxLength={MAX_MESSAGE}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              kind === "port" ? "Que se passe-t-il sur le port ?" : "Que se passe-t-il ?"
            }
            aria-label="Votre message"
          />
          <small aria-hidden>{MAX_MESSAGE - text.length}</small>
          <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Envoyer">
            <Send size={16} aria-hidden />
          </button>
        </form>
      ) : (
        <p className="bw-room__locked">
          {kind === "crossing"
            ? "Vous pouvez lire. Pour écrire, indiquez que vous voyagez sur cette traversée."
            : "Vous pouvez lire. Réservé à l'écriture aux personnes présentes sur le port."}
        </p>
      )}
      {problem ? (
        <p role="alert" className="bw-community-error">
          {problem.message}
        </p>
      ) : null}
      {messages.length ? (
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              <TravellerAvatar card={message.author} size={34} static />
              <div>
                <p className="bw-room__who">
                  <b>{message.me ? "Vous" : message.author.pseudo}</b>
                  <span data-place={message.place}>{PLACE[message.place]}</span>
                  <time dateTime={message.created_at}>{time(message.created_at)}</time>
                </p>
                <p>{message.body}</p>
                <p className="bw-room__actions">
                  <button
                    type="button"
                    aria-pressed={message.reacted}
                    disabled={!canWrite || react.isPending}
                    onClick={() => react.mutate(message.id)}
                  >
                    <ThumbsUp size={13} aria-hidden /> Pareil ici
                    {message.same ? ` · ${message.same}` : ""}
                  </button>
                  {user && !message.me ? (
                    <button
                      type="button"
                      aria-label="Signaler ce message"
                      disabled={report.isPending}
                      onClick={() => report.mutate(message.id)}
                    >
                      <Flag size={13} aria-hidden />
                    </button>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : feed.isPending ? null : (
        <p className="bw-room__empty">Personne n'a encore écrit ici.</p>
      )}
      <footer>Messages courts et modérés. Pas de photo de contrôle, aucun agent nommé.</footer>
    </section>
  );
}
