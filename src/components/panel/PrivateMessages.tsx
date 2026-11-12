import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Check, Flag, Lock, Send, X } from "lucide-react";
import { ChatText } from "./ChatText";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { useAuth } from "@/hooks/useAuth";
import type { TravellerCard } from "@/lib/community/travellers";
import {
  answerDm,
  blockDm,
  dmInboxQuery,
  dmKey,
  dmState,
  leftLabel,
  metQuery,
  readDm,
  reportDm,
  requestDm,
  sendDm,
  type DmThread,
} from "@/lib/ferry/privateMessages";
import { tr } from "@/lib/i18n";

const MAX = 200;
const INTROS = ["Bonjour, je peux vous poser une question ?", "Il vous reste de la place ?"];

/** Écrire à quelqu'un : une courte présentation, envoyée comme une demande. */
export function DmRequest({
  departureId,
  card,
  onDone,
  onCancel,
}: {
  departureId: string;
  card: TravellerCard;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const met = useQuery(metQuery(departureId, user?.id)).data;
  const client = useQueryClient();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => requestDm(departureId, card.handle, text),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: dmKey });
      onDone();
    },
  });
  return (
    <div className="bw-dm">
      <header className="bw-dm__head">
        <button type="button" aria-label={tr("ui.privateMessages.annuler")} onClick={onCancel}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <TravellerAvatar card={card} size={30} mood={false} static />
        <strong>{card.pseudo}</strong>
      </header>
      <div className="bw-dm__body">
        {met?.here.includes(card.handle) ? (
          <p className="bw-dm__met">{tr("ui.privateMessages.vousAvezDejaVoyageSur")}</p>
        ) : null}
        <p className="bw-dm__rules">
          <Lock size={14} aria-hidden />
          <span>
            {card.pseudo}{tr("ui.privateMessages.doitDAbordAccepterEnsuite")}
          </span>
        </p>
        {text ? null : (
          <p className="bw-chat__examples">
            {INTROS.map((intro) => (
              <button key={intro} type="button" onClick={() => setText(intro)}>
                {intro}
              </button>
            ))}
          </p>
        )}
        {send.error ? (
          <p role="alert" className="bw-chat__error">
            {send.error.message}
          </p>
        ) : null}
      </div>
      <form
        className="bw-dm__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) send.mutate();
        }}
      >
        <input
          autoFocus
          value={text}
          maxLength={MAX}
          onChange={(event) => setText(event.target.value)}
          placeholder={tr("ui.privateMessages.votrePresentation")}
          aria-label={tr("ui.privateMessages.votrePresentation")}
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          aria-label={tr("ui.privateMessages.envoyerLaDemande")}
        >
          <Send size={17} aria-hidden />
        </button>
      </form>
    </div>
  );
}

function Conversation({ thread, onBack }: { thread: DmThread; onBack: () => void }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: dmKey });
  const state = dmState(thread);
  const send = useMutation({
    mutationFn: () => sendDm(thread.id, text),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });
  const answer = useMutation({
    mutationFn: (accept: boolean) => answerDm(thread.id, accept),
    onSuccess: (_, accept) => {
      refresh();
      if (!accept) onBack();
    },
  });
  const stop = useMutation({
    mutationFn: (kind: "block" | "report") =>
      kind === "block" ? blockDm(thread.id) : reportDm(thread.id),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const unread = thread.unread;
  // Lu dès l'ouverture, et à chaque nouveau message reçu pendant la lecture.
  useEffect(() => {
    if (unread && state !== "to-answer") void readDm(thread.id).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, unread, state]);
  const problem = send.error ?? answer.error ?? stop.error;
  return (
    <div className="bw-dm">
      <header className="bw-dm__head">
        <button type="button" aria-label={tr("ui.privateMessages.retourAuxMessages")} onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <TravellerAvatar card={thread.other} size={30} mood={false} />
        <span>
          <strong>{thread.other.pseudo}</strong>
          {thread.line ? <small>{thread.line}</small> : null}
        </span>
      </header>
      <ol className="bw-dm__lines">
        <li data-me={thread.mine || undefined}>
          <p>
            <ChatText body={thread.intro} />
          </p>
        </li>
        {thread.messages.map((message) => (
          <li key={message.id} data-me={message.me || undefined}>
            <p>
              <ChatText body={message.body} />
            </p>
          </li>
        ))}
      </ol>
      {problem ? (
        <p role="alert" className="bw-chat__error">
          {problem.message}
        </p>
      ) : null}
      {confirm ? (
        <p className="bw-dm__confirm">
          <span>
            {confirm === "block"
              ? `Bloquer ${thread.other.pseudo} ? Vous ne pourrez plus vous écrire.`
              : `Signaler cette conversation ? ${thread.other.pseudo} sera bloqué et l'équipe pourra la lire.`}
          </span>
          <button type="button" disabled={stop.isPending} onClick={() => stop.mutate(confirm)}>
            {tr("ui.privateMessages.oui")}
          </button>
          <button type="button" onClick={() => setConfirm(null)}>
            {tr("ui.privateMessages.non")}
          </button>
        </p>
      ) : null}
      {state === "to-answer" ? (
        <div className="bw-dm__answer">
          <p>
            {thread.other.pseudo}{tr("ui.privateMessages.souhaiteVousEcrireSiVous")}
          </p>
          <span>
            <button type="button" disabled={answer.isPending} onClick={() => answer.mutate(true)}>
              <Check size={16} aria-hidden />{tr("ui.privateMessages.accepter")}
            </button>
            <button type="button" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
              <X size={16} aria-hidden />{tr("ui.privateMessages.refuser")}
            </button>
          </span>
        </div>
      ) : state === "waiting" ? (
        <p className="bw-dm__note">{tr("ui.privateMessages.enAttenteDeLaReponse")}{thread.other.pseudo}.</p>
      ) : state === "closed" ? (
        <p className="bw-dm__note">{tr("ui.privateMessages.cetteConversationEstFermee")}</p>
      ) : state === "used-up" ? (
        <p className="bw-dm__note">
          {leftLabel(0)}. {thread.other.pseudo}{tr("ui.privateMessages.peutEncoreEnEnvoyer")}{thread.other_left}.
        </p>
      ) : (
        <>
          <p className="bw-dm__left">{leftLabel(thread.my_left)}</p>
          <form
            className="bw-dm__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) send.mutate();
            }}
          >
            <input
              value={text}
              maxLength={MAX}
              onChange={(event) => setText(event.target.value)}
              placeholder={tr("ui.privateMessages.votreMessage")}
              aria-label={tr("ui.privateMessages.votreMessage")}
            />
            <button type="submit" disabled={!text.trim() || send.isPending} aria-label={tr("ui.privateMessages.envoyer")}>
              <Send size={17} aria-hidden />
            </button>
          </form>
        </>
      )}
      {state === "closed" || confirm ? null : (
        <p className="bw-dm__safety">
          <button type="button" onClick={() => setConfirm("block")}>
            <Ban size={13} aria-hidden />{tr("ui.privateMessages.bloquer")}
          </button>
          <button type="button" onClick={() => setConfirm("report")}>
            <Flag size={13} aria-hidden />{tr("ui.privateMessages.signaler")}
          </button>
        </p>
      )}
    </div>
  );
}

/** Mes messages privés, dans le salon. */
export function PrivateMessages({
  onBack,
  initialThread,
}: {
  onBack: () => void;
  initialThread?: string | null;
}) {
  const { user } = useAuth();
  const inbox = useQuery(dmInboxQuery(user?.id));
  const [openId, setOpenId] = useState<string | null>(initialThread ?? null);
  const threads = inbox.data ?? [];
  const open = threads.find((thread) => thread.id === openId);
  if (open) return <Conversation thread={open} onBack={() => setOpenId(null)} />;
  return (
    <div className="bw-dm">
      <header className="bw-dm__head">
        <button type="button" aria-label={tr("ui.privateMessages.retourAuSalon")} onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <strong>{tr("ui.privateMessages.messagesPrives")}</strong>
      </header>
      <div className="bw-dm__body">
        {threads.length ? (
          <ul className="bw-dm__list">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button type="button" onClick={() => setOpenId(thread.id)}>
                  <TravellerAvatar card={thread.other} size={38} mood={false} static />
                  <span>
                    <strong>{thread.other.pseudo}</strong>
                    <small>
                      {dmState(thread) === "to-answer" ? (
                        tr("ui.privateMessages.souhaiteVousEcrire")
                      ) : dmState(thread) === "waiting" ? (
                        tr("ui.privateMessages.enAttenteDeReponse")
                      ) : (
                        <ChatText body={thread.messages.at(-1)?.body ?? thread.intro} size={16} />
                      )}
                    </small>
                    {thread.line ? <small>{thread.line}</small> : null}
                  </span>
                  {thread.unread ? <b>{thread.unread}</b> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bw-dm__note">
            {tr("ui.privateMessages.aucunMessagePriveDansLe")}
          </p>
        )}
        <p className="bw-dm__rules">
          <Lock size={14} aria-hidden />
          <span>
            {tr("ui.privateMessages.vosMessagesPrivesNeSont")}
          </span>
        </p>
      </div>
    </div>
  );
}
