import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquareReply } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { tr, type MessageKey } from "@/lib/i18n";
import {
  ALL_PHOTO_CATEGORIES,
  asPhotoCategory,
  type PhotoCategory,
} from "@/lib/company/galleryCategories";
import {
  companyGalleryQuery,
  galleryUrl,
  portGalleryQuery,
  type GalleryPhoto,
  type PublicCompanyReply,
} from "@/lib/company/publicDesk";

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

/** Galerie d'une compagnie (vesselId absent) ou d'un navire. Rien si elle est vide. */
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
  const photos = gallery.data ?? [];
  if (!photos.length) return null;
  const name = companyName ?? photos.find((photo) => photo.companyName)?.companyName ?? "";
  return (
    <PhotoGallery
      photos={photos}
      title={
        vesselId
          ? tr("ui.companyVoice.photosNavire")
          : tr("ui.companyVoice.photosTitre", { company: name })
      }
    />
  );
}

/** Galerie d'un port (photos ajoutées par BledWay). Rien si elle est vide. */
export function PortGallery({
  portId,
  className,
}: {
  portId: string;
  className?: string | undefined;
}) {
  const gallery = useQuery(portGalleryQuery(portId));
  const photos = gallery.data ?? [];
  if (!photos.length) return null;
  return (
    <PhotoGallery photos={photos} title={tr("ui.companyVoice.photosPort")} className={className} />
  );
}

const categoryLabel = (category: PhotoCategory) =>
  tr(`ui.companyVoice.categories.${category}` as MessageKey);

/** Bandeau de photos, filtres par catégorie quand il y en a plusieurs, agrandissement. */
function PhotoGallery({
  photos,
  title,
  className,
}: {
  photos: GalleryPhoto[];
  title: string;
  className?: string | undefined;
}) {
  const [filter, setFilter] = useState<PhotoCategory | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // Catégories présentes, dans l'ordre de la liste (extérieur, ponts, cabines…).
  const counts = new Map<PhotoCategory, number>();
  for (const photo of photos) {
    const category = asPhotoCategory(photo.category);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const present = ALL_PHOTO_CATEGORIES.filter((category) => counts.has(category));
  const shown = filter
    ? photos.filter((photo) => asPhotoCategory(photo.category) === filter)
    : photos;
  const current = open === null ? null : shown[open];
  const sources = new Set(photos.map((photo) => photo.source ?? "company"));
  const legend =
    sources.size > 1
      ? tr("ui.companyVoice.photosLegendeMixte")
      : sources.has("team")
        ? tr("ui.companyVoice.photosLegendeEquipe")
        : tr("ui.companyVoice.photosLegende");
  return (
    <section className={`grid gap-1.5 ${className ?? ""}`} aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {present.length > 1 ? (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5"
          role="group"
          aria-label={tr("ui.companyVoice.filtrer")}
        >
          {[null, ...present].map((category) => (
            <button
              key={category ?? "all"}
              type="button"
              aria-pressed={filter === category}
              onClick={() => {
                setFilter(category);
                setOpen(null);
              }}
              className="inline-flex min-h-8 flex-none items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {category ? categoryLabel(category) : tr("ui.companyVoice.toutes")}
              <span className="opacity-70">{category ? counts.get(category) : photos.length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
        {shown.map((photo, index) => (
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
      <p className="text-xs text-muted-foreground">{legend}</p>
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
                <span className="text-muted-foreground">
                  {" · "}
                  {categoryLabel(asPhotoCategory(current.category))}
                  {current.credit
                    ? ` · © ${current.credit}`
                    : current.source === "team"
                      ? ` · ${tr("ui.companyVoice.photoBledway")}`
                      : ""}
                </span>
              </p>
              {shown.length > 1 ? (
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="bw-action-secondary inline-flex min-h-10 items-center gap-1"
                    onClick={() => setOpen((open! - 1 + shown.length) % shown.length)}
                  >
                    <ChevronLeft className="size-4" aria-hidden />{" "}
                    {tr("ui.companyVoice.photoPrecedente")}
                  </button>
                  <button
                    type="button"
                    className="bw-action-secondary inline-flex min-h-10 items-center gap-1"
                    onClick={() => setOpen((open! + 1) % shown.length)}
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
