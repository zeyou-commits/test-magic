import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { deleteOwnMessage, editOwnMessage } from "@/lib/ferry/chat";
import { photosKey, removePublicFiles } from "@/lib/photos/photos";
import { tr } from "@/lib/i18n";

/** Modifier ou supprimer son propre message, sa question ou sa réponse. */
export function OwnMessageActions({
  id,
  body,
  deleteHint,
  photoPaths = [],
}: {
  id: string;
  body: string;
  /** Photos jointes : leurs fichiers sont effacés tout de suite avec le message. */
  photoPaths?: string[];
  /** Précision avant suppression, par exemple pour une question qui a des réponses. */
  deleteHint?: string | undefined;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(body);
  const refresh = () => void client.invalidateQueries({ queryKey: ["bw-chat"] });
  const edit = useMutation({
    mutationFn: () => editOwnMessage(id, text),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      await deleteOwnMessage(id);
      // Le message et sa photo sont effacés en base ; le fichier part aussitôt, sans attendre la nuit.
      await removePublicFiles(photoPaths);
    },
    onSuccess: () => {
      refresh();
      void client.invalidateQueries({ queryKey: photosKey });
    },
  });
  const problem = edit.error ?? remove.error;
  return (
    <div className="bw-room__own">
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) edit.mutate();
          }}
        >
          <input
            autoFocus
            value={text}
            maxLength={200}
            onChange={(event) => setText(event.target.value)}
            aria-label={tr("ui.ownMessageActions.modifierVotreMessage")}
          />
          <button type="submit" disabled={!text.trim() || edit.isPending} aria-label={tr("ui.ownMessageActions.enregistrer")}>
            <Check size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="bw-room__own-cancel"
            aria-label={tr("ui.ownMessageActions.annuler")}
            onClick={() => {
              setText(body);
              setEditing(false);
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </form>
      ) : confirming ? (
        <p>
          <span>{deleteHint ?? tr("ui.ownMessageActions.supprimerCeMessage")}</span>
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {tr("ui.ownMessageActions.ouiSupprimer")}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {tr("ui.ownMessageActions.non")}
          </button>
        </p>
      ) : (
        <p>
          <button type="button" onClick={() => setEditing(true)}>
            <Pencil size={12} aria-hidden />{tr("ui.ownMessageActions.modifier")}
          </button>
          <button type="button" onClick={() => setConfirming(true)}>
            <Trash2 size={12} aria-hidden />{tr("ui.ownMessageActions.supprimer")}
          </button>
        </p>
      )}
      {problem ? (
        <p role="alert" className="bw-community-error">
          {problem.message}
        </p>
      ) : null}
    </div>
  );
}
