import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SPOKEN_EXAMPLES } from "@/lib/wallet/jargon";
import { VOICE_BUCKET, dinarVoicesQuery, playVoice, voiceDb } from "@/lib/wallet/voices";

const MAX_SECONDS = 8;

/** Enregistrer au micro, depuis l'admin, chaque montant tel qu'il se dit au bled. */
export function DinarVoiceAdmin() {
  const { user } = useAuth();
  const client = useQueryClient();
  const { data: voices } = useQuery(dinarVoicesQuery);
  const [recording, setRecording] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Blob>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  const start = async (said: string) => {
    if (recording || typeof MediaRecorder === "undefined") {
      if (!recording) toast.error("Ce navigateur ne permet pas d’enregistrer.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = media.mimeType.split(";")[0] || "audio/webm";
        setDrafts((current) => ({ ...current, [said]: new Blob(chunks, { type }) }));
        setRecording(null);
      };
      recorder.current = media;
      media.start();
      setRecording(said);
      timer.current = window.setTimeout(stop, MAX_SECONDS * 1000);
    } catch {
      toast.error("Micro indisponible : autorisez-le pour ce site, puis réessayez.");
    }
  };
  const save = async (said: string) => {
    const blob = drafts[said];
    if (!blob || !user) return;
    setBusy(said);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `${crypto.randomUUID()}.${ext}`;
      const upload = await voiceDb.storage.from(VOICE_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "86400" });
      if (upload.error) throw upload.error;
      const old = voices?.find((voice) => voice.said === said);
      const saved = await voiceDb.from("bw_dinar_voices").upsert({ said, storage_path: path, updated_at: new Date().toISOString(), updated_by: user.id });
      if (saved.error) {
        await voiceDb.storage.from(VOICE_BUCKET).remove([path]);
        throw saved.error;
      }
      if (old) await voiceDb.storage.from(VOICE_BUCKET).remove([old.storage_path]);
      setDrafts(({ [said]: _done, ...rest }) => rest);
      await client.invalidateQueries({ queryKey: dinarVoicesQuery.queryKey });
      toast.success(`« ${said} » est enregistré.`);
    } catch {
      toast.error("L’enregistrement n’a pas pu être envoyé. Réessayez.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (said: string) => {
    const old = voices?.find((voice) => voice.said === said);
    if (!old || !window.confirm(`Supprimer la voix de « ${said} » ?`)) return;
    setBusy(said);
    const deleted = await voiceDb.from("bw_dinar_voices").delete().eq("said", said);
    if (deleted.error) toast.error("Suppression impossible.");
    else await voiceDb.storage.from(VOICE_BUCKET).remove([old.storage_path]);
    await client.invalidateQueries({ queryKey: dinarVoicesQuery.queryKey });
    setBusy(null);
  };

  return (
    <section className="bw-admin-surface mt-4 space-y-3 p-4 sm:p-6" aria-labelledby="dinar-voice-title">
      <div>
        <h2 id="dinar-voice-title" className="text-xl font-bold">Voix de Mes dinars</h2>
        <p className="text-sm text-muted-foreground">
          Dites chaque montant naturellement, {MAX_SECONDS} secondes au plus. Réécoutez, puis
          enregistrez : le bouton d’écoute apparaît aussitôt pour les voyageurs.
        </p>
      </div>
      {voices === null ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Enregistrement indisponible tant que le script de la voix n’est pas appliqué en base.
        </p>
      ) : null}
      <ul className="divide-y">
        {SPOKEN_EXAMPLES.map(({ said, dinars }) => {
          const saved = voices?.find((voice) => voice.said === said);
          const draft = drafts[said];
          const isRecording = recording === said;
          return (
            <li key={said} className="flex flex-wrap items-center gap-2 py-3">
              <span className="min-w-40 flex-1">
                <strong className="block">{said}</strong>
                <small className="text-muted-foreground">
                  {dinars.toLocaleString("fr-FR")} DA · {saved ? "voix en ligne" : "pas encore de voix"}
                </small>
              </span>
              <button
                type="button"
                disabled={voices === null || Boolean(recording && !isRecording) || busy === said}
                onClick={() => (isRecording ? stop() : void start(said))}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-40 ${isRecording ? "bg-red-600" : "bg-primary"}`}
              >
                {isRecording ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                {isRecording ? "Arrêter" : saved || draft ? "Refaire" : "Enregistrer"}
              </button>
              {draft ? (
                <>
                  <button type="button" onClick={() => void new Audio(URL.createObjectURL(draft)).play()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm">
                    <Play className="size-4" aria-hidden /> Réécouter
                  </button>
                  <button type="button" disabled={busy === said} onClick={() => void save(said)} className="min-h-10 rounded-lg bg-[#102c43] px-3 text-sm font-semibold text-white disabled:opacity-40">
                    Valider
                  </button>
                </>
              ) : saved ? (
                <>
                  <button type="button" aria-label={`Écouter ${said}`} onClick={() => playVoice(saved.storage_path)} className="grid size-10 place-items-center rounded-lg border">
                    <Play className="size-4" aria-hidden />
                  </button>
                  <button type="button" aria-label={`Supprimer la voix de ${said}`} disabled={busy === said} onClick={() => void remove(said)} className="grid size-10 place-items-center rounded-lg border text-red-700">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
