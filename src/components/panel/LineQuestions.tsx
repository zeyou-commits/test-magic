import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Flag, Send, ThumbsUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChatText } from "./ChatText";
import { OwnMessageActions } from "./OwnMessageActions";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useTravelAction } from "@/hooks/useTravelAction";
import {
  CHAT_SENT_EVENT,
  postToRoom,
  rememberPendingChat,
  takeQuestionDraft,
} from "@/lib/ferry/chat";
import { chatRefusal, roomExamples } from "@/lib/ferry/portPassage";
import { MAX_MESSAGE } from "./LiveRoom";
import { AuthorAvatar, StaffBadge, StaffTools, type ChatAuthor } from "./StaffChat";
import { useCharterGate } from "./CharterGate";
import { chatStartersQuery, startersFor, type StarterContext } from "@/lib/ferry/chatStarters";

const supabase = typedSupabase as unknown as SupabaseClient;

type Entry = {
  id: string;
  body: string;
  place: "done" | "asker";
  created_at: string;
  me: boolean;
  author: ChatAuthor;
  same: number;
  reacted: boolean;
  edited?: boolean;
  mentions?: Record<string, string>;
  replies?: Entry[];
};
type Question = Entry & { replies: Entry[] };
type Feed = {
  access: "read" | "member" | "staff";
  staff?: boolean;
  charter?: boolean;
  questions: Question[];
};

const missing = (code?: string) => code === "PGRST202" || code === "42883";
const day = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));

/** Une ligne de discussion : auteur, badge de qui a déjà fait le trajet, texte, réactions. */
function Line({
  entry,
  sameLabel,
  canAct,
  busy,
  onReact,
  onReport,
  staff = false,
  children,
}: {
  entry: Entry;
  staff?: boolean;
  sameLabel: string;
  canAct: boolean;
  busy: boolean;
  onReact: () => void;
  onReport: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <AuthorAvatar author={entry.author} size={32} />
      <div>
        <p className="bw-room__who">
          <b>{entry.me && !entry.author.official ? "Vous" : entry.author.pseudo}</b>
          <StaffBadge author={entry.author} />
          {entry.place === "done" ? <span data-place="done">a fait cette ligne</span> : null}
          <time dateTime={entry.created_at}>
            {day(entry.created_at)}
            {entry.edited ? " · modifié" : ""}
          </time>
        </p>
        <p>
          <ChatText body={entry.body} mentions={entry.mentions} />
        </p>
        <p className="bw-room__actions">
          <button
            type="button"
            aria-pressed={entry.reacted}
            disabled={!canAct || busy}
            onClick={onReact}
          >
            <ThumbsUp size={13} aria-hidden /> {sameLabel}
            {entry.same ? ` · ${entry.same}` : ""}
          </button>
          {canAct && !entry.me ? (
            <button
              type="button"
              aria-label="Signaler ce message"
              disabled={busy}
              onClick={onReport}
            >
              <Flag size={13} aria-hidden />
            </button>
          ) : null}
        </p>
        {entry.me ? (
          <OwnMessageActions
            id={entry.id}
            body={entry.body}
            deleteHint={
              entry.replies?.length ? "Supprimer cette question et ses réponses ?" : undefined
            }
          />
        ) : null}
        {staff && !entry.me ? <StaffTools id={entry.id} author={entry.author} /> : null}
        {children}
      </div>
    </>
  );
}

/** Questions d'une ligne : tout le monde lit, tout compte connecté demande ou répond. */
export function LineQuestions({
  routeId,
  title,
  starterContext,
}: {
  routeId: string;
  title: string;
  starterContext?: StarterContext;
}) {
  const starters = useQuery(chatStartersQuery).data;
  const { user } = useAuth();
  const request = useTravelAction();
  const client = useQueryClient();
  // Venu du salon du port : la question déjà écrite est reprise ici.
  const [text, setText] = useState(() => takeQuestionDraft(routeId));
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const key = ["bw-chat", "route", routeId, user?.id ?? "anonyme"];
  const feed = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Feed | null> => {
      const { data, error } = await supabase.rpc("bw_chat_questions", { p_route: routeId });
      if (error) {
        if (missing(error.code)) return null;
        throw new Error("Questions indisponibles.");
      }
      return data as Feed;
    },
    retry: false,
    refetchInterval: 60_000,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["bw-chat", "route", routeId] });
  // Parti après une inscription : les formulaires se vident.
  useEffect(() => {
    const clear = () => {
      setText("");
      setReply("");
      setReplyTo(null);
    };
    window.addEventListener(CHAT_SENT_EVENT, clear);
    return () => window.removeEventListener(CHAT_SENT_EVENT, clear);
  }, []);
  const send = useMutation({
    mutationFn: (input: { body: string; parent?: string }) =>
      postToRoom("route", routeId, input.body, input.parent),
    onSuccess: (_, input) => {
      if (input.parent) {
        setReply("");
        setReplyTo(null);
      } else setText("");
      refresh();
    },
  });
  const react = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("bw_chat_react", { p_message: id });
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
  const gate = useCharterGate(feed.data?.charter);
  // Module pas encore activé en base : rien à afficher.
  if (feed.data === null) return null;
  const questions = feed.data?.questions ?? [];
  const canAct = feed.data?.access === "member" || feed.data?.access === "staff";
  const busy = react.isPending || report.isPending;
  const problem = send.error ?? react.error ?? report.error;
  // On écrit d'abord ; l'inscription n'arrive qu'à l'envoi, et le message est gardé.
  const submit = (body: string, parent?: string) => {
    if (!body.trim()) return;
    if (user) {
      gate.guard(() => send.mutate({ body, ...(parent ? { parent } : {}) }));
      return;
    }
    rememberPendingChat({ kind: "route", room: routeId, body, ...(parent ? { parent } : {}) });
    request({ type: "chat", label: title });
  };
  return (
    <section className="bw-room bw-room--questions" aria-label={title}>
      {gate.dialog}
      <header>
        <CircleHelp size={17} aria-hidden />
        <h3>{title}</h3>
        {questions.length ? (
          <small>
            {questions.length} question{questions.length > 1 ? "s" : ""}
          </small>
        ) : null}
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
      >
        <input
          value={text}
          maxLength={MAX_MESSAGE}
          onChange={(event) => setText(event.target.value)}
          placeholder="Posez votre question sur cette ligne"
          aria-label="Votre question"
        />
        <small aria-hidden>{MAX_MESSAGE - text.length}</small>
        <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Envoyer">
          <Send size={16} aria-hidden />
        </button>
      </form>
      {text ? null : (
        <p className="bw-room__examples">
          {startersFor("questions", starters, starterContext ?? {}, roomExamples("questions")).map(
            (example) => (
              <button key={example} type="button" onClick={() => setText(example)}>
                {example}
              </button>
            ),
          )}
        </p>
      )}
      {problem ? (
        <p role="alert" className="bw-community-error">
          {problem.message}
        </p>
      ) : null}
      {questions.length ? (
        <ul>
          {questions.map((question) => (
            <li key={question.id}>
              <Line
                entry={question}
                sameLabel="Même question"
                canAct={canAct}
                staff={Boolean(feed.data?.staff)}
                busy={busy}
                onReact={() => react.mutate(question.id)}
                onReport={() => report.mutate(question.id)}
              >
                {question.replies.length ? (
                  <ul className="bw-room__replies">
                    {question.replies.map((answer) => (
                      <li key={answer.id}>
                        <Line
                          entry={answer}
                          sameLabel="Utile"
                          canAct={canAct}
                          staff={Boolean(feed.data?.staff)}
                          busy={busy}
                          onReact={() => react.mutate(answer.id)}
                          onReport={() => report.mutate(answer.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="bw-room__empty">
                    Personne n'a encore répondu. En attendant, voyez le{" "}
                    <Link to="/guide">guide du voyage</Link>.
                  </p>
                )}
                {replyTo === question.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit(reply, question.id);
                    }}
                  >
                    <input
                      autoFocus
                      value={reply}
                      maxLength={MAX_MESSAGE}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Votre réponse"
                      aria-label="Votre réponse"
                    />
                    <small aria-hidden>{MAX_MESSAGE - reply.length}</small>
                    <button
                      type="submit"
                      disabled={!reply.trim() || send.isPending}
                      aria-label="Envoyer la réponse"
                    >
                      <Send size={16} aria-hidden />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="bw-room__reply"
                    onClick={() => {
                      setReply("");
                      setReplyTo(question.id);
                    }}
                  >
                    Répondre
                  </button>
                )}
              </Line>
            </li>
          ))}
        </ul>
      ) : feed.isPending ? null : (
        <p className="bw-room__empty">
          Aucune question pour l'instant. Soyez le premier ou la première à demander, ou voyez le{" "}
          <Link to="/guide">guide du voyage</Link>.
        </p>
      )}
      <footer>Questions visibles 30 jours. Messages courts et modérés.</footer>
    </section>
  );
}
