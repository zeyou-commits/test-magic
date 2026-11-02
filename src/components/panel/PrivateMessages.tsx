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
        <button type="button" aria-label="Annuler" onClick={onCancel}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <TravellerAvatar card={card} size={30} mood={false} static />
        <strong>{card.pseudo}</strong>
      </header>
      <div className="bw-dm__body">
        {met?.here.includes(card.handle) ? (
          <p className="bw-dm__met">Vous avez déjà voyagé sur le même bateau.</p>
        ) : null}
        <p className="bw-dm__rules">
          <Lock size={14} aria-hidden />
          <span>
            {card.pseudo} doit d'abord accepter. Ensuite, vous aurez chacun 3 messages sur cette
            traversée. Pas de lien, d'e-mail ni de numéro de téléphone.
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
          placeholder="Votre présentation"
          aria-label="Votre présentation"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          aria-label="Envoyer la demande"
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
        <button type="button" aria-label="Retour aux messages" onClick={onBack}>
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
            Oui
          </button>
          <button type="button" onClick={() => setConfirm(null)}>
            Non
          </button>
        </p>
      ) : null}
      {state === "to-answer" ? (
        <div className="bw-dm__answer">
          <p>
            {thread.other.pseudo} souhaite vous écrire. Si vous acceptez, vous aurez chacun 3
            messages.
          </p>
          <span>
            <button type="button" disabled={answer.isPending} onClick={() => answer.mutate(true)}>
              <Check size={16} aria-hidden /> Accepter
            </button>
            <button type="button" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
              <X size={16} aria-hidden /> Refuser
            </button>
          </span>
        </div>
      ) : state === "waiting" ? (
        <p className="bw-dm__note">En attente de la réponse de {thread.other.pseudo}.</p>
      ) : state === "closed" ? (
        <p className="bw-dm__note">Cette conversation est fermée.</p>
      ) : state === "used-up" ? (
        <p className="bw-dm__note">
          {leftLabel(0)}. {thread.other.pseudo} peut encore en envoyer {thread.other_left}.
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
              placeholder="Votre message"
              aria-label="Votre message"
            />
            <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Envoyer">
              <Send size={17} aria-hidden />
            </button>
          </form>
        </>
      )}
      {state === "closed" || confirm ? null : (
        <p className="bw-dm__safety">
          <button type="button" onClick={() => setConfirm("block")}>
            <Ban size={13} aria-hidden /> Bloquer
          </button>
          <button type="button" onClick={() => setConfirm("report")}>
            <Flag size={13} aria-hidden /> Signaler
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
        <button type="button" aria-label="Retour au salon" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <strong>Messages privés</strong>
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
                        "Souhaite vous écrire"
                      ) : dmState(thread) === "waiting" ? (
                        "En attente de réponse"
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
            Aucun message privé. Dans le salon, touchez le message d'un passager puis « Message
            privé ».
          </p>
        )}
        <p className="bw-dm__rules">
          <Lock size={14} aria-hidden />
          <span>
            Vos messages privés ne sont lus par l'équipe que si l'un de vous les signale. Ils
            disparaissent 7 jours après la traversée.
          </span>
        </p>
      </div>
    </div>
  );
}
