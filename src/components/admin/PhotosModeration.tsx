import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, EyeOff, Flag, X } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PENDING_BUCKET, PUBLIC_BUCKET, photosKey, photoUrl } from "@/lib/photos/photos";

// Fonctions et stockage du script « photos », absents des types générés.
const db = typedSupabase as unknown as SupabaseClient;
const QUEUE_KEY = ["admin", "photos-queue"];

type QueuedPhoto = {
  id: string;
  kind: "report" | "vessel_review" | "port_review" | "chat";
  parent_id: string;
  pending_path: string | null;
  public_path: string | null;
  created_at: string;
  reports: number;
  place: string | null;
  author: string | null;
};

const KIND_LABEL: Record<QueuedPhoto["kind"], string> = {
  report: "Signalement de port",
  vessel_review: "Avis sur un navire",
  port_review: "Avis sur un port",
  chat: "Salon (signalée)",
};

/**
 * Admin → Avis : les photos envoyées par les voyageurs. Rien n'est publié sans validation ;
 * une photo refusée est effacée. Les photos de salon reviennent ici après 2 signalements.
 */
export function PhotosModeration() {
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: QUEUE_KEY,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_photos_queue");
      if (error) return null;
      const items = data as QueuedPhoto[];
      // Photos en attente : lien temporaire, réservé à l'équipe.
      const signed = await Promise.all(
        items.map(async (item) => {
          if (!item.pending_path) return item.public_path ? photoUrl(item.public_path) : null;
          const result = await db.storage
            .from(PENDING_BUCKET)
            .createSignedUrl(item.pending_path, 600);
          return result.data?.signedUrl ?? null;
        }),
      );
      return items.map((item, index) => ({ ...item, url: signed[index] }));
    },
  });
  const decide = useMutation({
    mutationFn: async ({ item, approve }: { item: QueuedPhoto; approve: boolean }) => {
      let publicPath: string | null = null;
      if (approve && item.pending_path) {
        // Validée : copiée dans l'espace public, l'original en attente part à la corbeille.
        const file = await db.storage.from(PENDING_BUCKET).download(item.pending_path);
        if (file.error || !file.data) throw new Error("Photo illisible : réessayez.");
        const ext = file.data.type === "image/jpeg" ? "jpg" : "webp";
        publicPath = `valides/${item.kind}/${item.id}.${ext}`;
        const upload = await db.storage
          .from(PUBLIC_BUCKET)
          .upload(publicPath, file.data, { contentType: file.data.type, upsert: false });
        if (upload.error) throw new Error(upload.error.message);
      }
      const { error } = await db.rpc("bw_photo_decide", {
        p_id: item.id,
        p_approve: approve,
        p_public_path: publicPath,
      });
      if (error) throw new Error(error.message);
      return approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Photo publiée." : "Photo refusée et effacée.");
      void client.invalidateQueries({ queryKey: QUEUE_KEY });
      void client.invalidateQueries({ queryKey: photosKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (queue.data === null)
    return (
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>Photos des voyageurs</strong> : exécutez le script <code>photos</code> dans Supabase
        pour activer l’envoi et la validation des photos.
      </section>
    );
  const items = queue.data ?? [];
  return (
    <section className="mb-8">
      <h3 className="text-base font-semibold">
        Photos à valider {items.length ? `(${items.length})` : ""}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        À refuser : visage reconnaissable, plaque lisible, document, contenu choquant ou hors sujet.
        Une photo refusée est effacée.
      </p>
      {queue.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Chargement…</p>
      ) : !items.length ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucune photo en attente.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl border bg-white">
              {item.url ? (
                <ModeratedImage url={item.url} />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-muted text-xs">
                  Image indisponible
                </div>
              )}
              <div className="grid gap-1 p-3 text-xs">
                <strong className="text-sm">{KIND_LABEL[item.kind]}</strong>
                <span className="text-muted-foreground">
                  {item.place ?? "—"} · {item.author ?? "Voyageur"} ·{" "}
                  {new Date(item.created_at).toLocaleDateString("fr-FR")}
                </span>
                {item.reports ? (
                  <span className="inline-flex items-center gap-1 text-red-700">
                    <Flag className="size-3" /> {item.reports} signalement(s)
                  </span>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ item, approve: true })}
                  >
                    <Check className="size-4" /> Publier
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ item, approve: false })}
                  >
                    <X className="size-4" /> Refuser
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Floutée tant que le modèle n'a pas répondu, et par défaut si elle semble explicite : l'équipe ne
 * tombe pas sur une image choquante sans l'avoir demandé.
 */
function ModeratedImage({ url }: { url: string }) {
  const [doubtful, setDoubtful] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    let stale = false;
    setDoubtful(null);
    setRevealed(false);
    void import("@/lib/photos/nsfw")
      .then((m) => m.isDoubtfulPhoto(url))
      .then((value) => !stale && setDoubtful(value));
    return () => {
      stale = true;
    };
  }, [url]);
  const hidden = !revealed && doubtful !== false;
  return (
    <div className="relative overflow-hidden">
      <a href={hidden ? undefined : url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt=""
          className={`aspect-[4/3] w-full object-cover ${hidden ? "scale-110 blur-2xl" : ""}`}
        />
      </a>
      {hidden ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 grid place-items-center gap-1 bg-black/30 p-3 text-center text-xs font-medium text-white"
        >
          {doubtful === null ? (
            <span>Analyse de la photo…</span>
          ) : (
            <span className="grid justify-items-center gap-1">
              <EyeOff className="size-5" aria-hidden />
              Contenu sensible probable
              <span className="underline">Afficher quand même</span>
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}
