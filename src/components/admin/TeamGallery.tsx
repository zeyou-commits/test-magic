import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GalleryUploader, type GalleryUpload } from "@/components/company/GalleryUploader";
import { companyAccessRequest } from "@/lib/company/access";
import {
  ALL_PHOTO_CATEGORIES,
  asPhotoCategory,
  PHOTO_CATEGORY_FORM,
  PORT_PHOTO_CATEGORIES,
  VESSEL_PHOTO_CATEGORIES,
} from "@/lib/company/galleryCategories";
import {
  companyGalleryQuery,
  galleryUrl,
  portGalleryQuery,
  type GalleryPhoto,
} from "@/lib/company/publicDesk";

/** Photos d'équipe par fiche (la base applique la même limite). */
const TEAM_LIMIT = 60;

/**
 * Admin → fiche d'un navire, d'un port ou d'une compagnie : la galerie publique, telle que les
 * voyageurs la voient, avec l'ajout de photos par l'équipe (publiées tout de suite, après le filtre
 * de contenu explicite) et le retrait de n'importe quelle photo.
 */
export function TeamGallery({
  kind,
  id,
  name,
}: {
  kind: "vessel" | "port" | "company";
  id: string;
  name: string;
}) {
  const client = useQueryClient();
  const query =
    kind === "port"
      ? portGalleryQuery(id)
      : companyGalleryQuery(kind === "company" ? id : null, kind === "vessel" ? id : null);
  const gallery = useQuery({ ...query, staleTime: 0 });
  const [adding, setAdding] = useState(false);
  const photos = gallery.data ?? [];
  const refresh = () => {
    void client.invalidateQueries({ queryKey: query.queryKey });
  };
  const remove = useMutation({
    mutationFn: (input: { id: string; note?: string }) =>
      companyAccessRequest({ action: "team_photo_remove", ...input }),
    onSuccess: () => {
      toast.success("Photo retirée.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askRemove = (photo: GalleryPhoto) => {
    if ((photo.source ?? "company") === "team") {
      if (window.confirm("Retirer cette photo ? Elle sera effacée."))
        remove.mutate({ id: photo.id });
      return;
    }
    // Photo publiée par la compagnie : elle verra le motif dans son espace.
    const note = window.prompt(
      `Photo publiée par ${photo.companyName ?? "la compagnie"}. Motif du retrait (la compagnie le verra) :`,
    );
    if (note && note.trim().length >= 3) remove.mutate({ id: photo.id, note: note.trim() });
    else if (note !== null) toast.error("Indiquez un motif de quelques mots.");
  };
  const send = (photo: GalleryUpload) =>
    companyAccessRequest({
      action: "team_photo_add",
      vesselId: kind === "vessel" ? id : null,
      companyId: kind === "company" ? id : null,
      portId: kind === "port" ? id : null,
      rights: true,
      ...photo,
    });
  const groups = ALL_PHOTO_CATEGORIES.map((category) => ({
    category,
    items: photos.filter((photo) => asPhotoCategory(photo.category) === category),
  })).filter((group) => group.items.length);
  const what = kind === "port" ? "du port" : kind === "vessel" ? "du navire" : "de la compagnie";

  return (
    <section className="grid gap-2 rounded-xl border p-3" aria-label={`Photos ${what}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Camera className="size-4" aria-hidden /> Photos {what}
            <span className="font-normal text-muted-foreground">{photos.length}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {kind === "port"
              ? "Gare maritime, files d'embarquement, parkings… Publiées tout de suite dans l'onglet pratique du port."
              : "Extérieur, ponts, cabines, restauration… Publiées tout de suite sur la fiche, avec celles de la compagnie."}
          </p>
        </div>
        {!adding && photos.length < TEAM_LIMIT ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Camera className="size-4" aria-hidden /> Ajouter des photos
          </Button>
        ) : null}
      </div>
      {adding ? (
        <GalleryUploader
          categories={kind === "port" ? PORT_PHOTO_CATEGORIES : VESSEL_PHOTO_CATEGORIES}
          remaining={TEAM_LIMIT - photos.length}
          rightsLabel={`Je déclare que BledWay peut diffuser ces photos de ${name || "cette fiche"} (prises par l'équipe ou avec l'accord de leur auteur) et que les personnes reconnaissables ont donné leur accord.`}
          onSend={send}
          onDone={refresh}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {gallery.isLoading ? (
        <p className="text-xs text-muted-foreground">Chargement des photos…</p>
      ) : groups.length ? (
        groups.map((group) => (
          <div key={group.category} className="grid gap-1">
            <h4 className="text-xs font-semibold text-muted-foreground">
              {PHOTO_CATEGORY_FORM[group.category].label} · {group.items.length}
            </h4>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.items.map((photo) => (
                <li
                  key={photo.id}
                  className="grid content-start gap-1 rounded-lg border p-1 text-xs"
                >
                  <img
                    src={galleryUrl(photo.path)}
                    alt={photo.caption}
                    loading="lazy"
                    width={photo.width}
                    height={photo.height}
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-muted-foreground">
                      {(photo.source ?? "company") === "team"
                        ? "BledWay"
                        : (photo.companyName ?? "Compagnie")}
                    </span>
                    <button
                      type="button"
                      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Retirer la photo « ${photo.caption} »`}
                      disabled={remove.isPending}
                      onClick={() => askRemove(photo)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                  <span className="line-clamp-2">{photo.caption}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">Aucune photo pour l'instant.</p>
      )}
    </section>
  );
}
