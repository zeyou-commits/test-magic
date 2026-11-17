import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquareReply } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { tr } from "@/lib/i18n";
import { companyGalleryQuery, galleryUrl, type PublicCompanyReply } from "@/lib/company/publicDesk";

/** Réponse publiée d'une compagnie, sous un avis ou un signalement. */
export function CompanyReplyNote({ reply }: { reply: PublicCompanyReply | undefined }) {
  if (!reply) return null;
  return (
    <div className="mt-1.5 grid gap-0.5 rounded-lg border-l-2 border-primary/50 bg-muted/50 px-2.5 py-1.5 text-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <MessageSquareReply className="size-3.5" aria-hidden />
        {tr("ui.companyVoice.reponseDe", { company: reply.companyName })}
        <time className="font-normal text-muted-foreground" dateTime={reply.date}>
          {new Date(reply.date).toLocaleDateString("fr-FR")}
        </time>
      </span>
      <p className="whitespace-pre-line">{reply.body}</p>
    </div>
  );
}

/** Galerie relue d'une compagnie (vesselId absent) ou d'un navire. Rien si elle est vide. */
export function CompanyGallery({
  companyId,
  vesselId,
  companyName,
}: {
  companyId?: string | null;
  vesselId?: string | null;
  companyName?: string;
}) {
  const gallery = useQuery(
    companyGalleryQuery(vesselId ? null : (companyId ?? null), vesselId ?? null),
  );
  const [open, setOpen] = useState<number | null>(null);
  const photos = gallery.data ?? [];
  if (!photos.length) return null;
  const current = open === null ? null : photos[open];
  const title = vesselId
    ? tr("ui.companyVoice.photosNavire")
    : tr("ui.companyVoice.photosTitre", { company: companyName ?? photos[0]!.companyName });
  return (
    <section className="grid gap-1.5" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <li key={photo.id} className="flex-none snap-start">
            <button
              type="button"
              className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={tr("ui.companyVoice.agrandir", { caption: photo.caption })}
              onClick={() => setOpen(index)}
            >
              <img
                src={galleryUrl(photo.path)}
                alt={photo.caption}
                loading="lazy"
                width={photo.width}
                height={photo.height}
                className="h-24 w-36 object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{tr("ui.companyVoice.photosLegende")}</p>
      <Dialog
        open={current !== null && current !== undefined}
        onOpenChange={(value) => !value && setOpen(null)}
      >
        <DialogContent className="max-w-3xl gap-2 p-2 sm:p-3">
          {current ? (
            <>
              <DialogTitle className="sr-only">{current.caption}</DialogTitle>
              <img
                src={galleryUrl(current.path)}
                alt={current.caption}
                width={current.width}
                height={current.height}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
              <p className="px-1 text-sm">
                {current.caption}
                {current.credit ? (
                  <span className="text-muted-foreground"> · © {current.credit}</span>
                ) : null}
              </p>
              {photos.length > 1 ? (
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="bw-action-secondary inline-flex min-h-10 items-center gap-1"
                    onClick={() => setOpen((open! - 1 + photos.length) % photos.length)}
                  >
                    <ChevronLeft className="size-4" aria-hidden />{" "}
                    {tr("ui.companyVoice.photoPrecedente")}
                  </button>
                  <button
                    type="button"
                    className="bw-action-secondary inline-flex min-h-10 items-center gap-1"
                    onClick={() => setOpen((open! + 1) % photos.length)}
                  >
                    {tr("ui.companyVoice.photoSuivante")}{" "}
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
