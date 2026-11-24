import { useEffect, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobToBase64 } from "@/lib/company/desk";
import { PHOTO_CATEGORY_FORM, type PhotoCategory } from "@/lib/company/galleryCategories";
import { tr } from "@/lib/i18n";

/** Photo prête à partir : réduite, floutée, convertie en JPEG par le navigateur. */
export type GalleryUpload = {
  image: string;
  width: number;
  height: number;
  category: PhotoCategory;
  caption: string;
  credit?: string;
};

type Item = {
  key: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  caption: string;
};

/** Nombre de photos envoyées en une fois. */
const BATCH_MAX = 10;

/**
 * Envoi de photos de galerie : une catégorie, une ou plusieurs photos (choisies ou glissées),
 * une légende facultative par photo. Partagé par l'espace compagnie et l'admin.
 */
export function GalleryUploader({
  categories,
  remaining,
  rightsLabel,
  onSend,
  onDone,
  onClose,
}: {
  categories: readonly PhotoCategory[];
  /** Places restantes dans la galerie. */
  remaining: number;
  rightsLabel: string;
  onSend: (photo: GalleryUpload) => Promise<unknown>;
  /** Après chaque photo publiée (rafraîchir la galerie). */
  onDone: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<PhotoCategory | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const max = Math.max(0, Math.min(BATCH_MAX, remaining));
  const room = max - items.length - preparing;

  // Les aperçus locaux sont libérés en quittant le formulaire.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const pick = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const taken = images.slice(0, Math.max(0, room));
    if (images.length > taken.length)
      toast.message(
        room > 0
          ? tr("ui.galleryUploader.photoGardeeSurAuPlus", { length: taken.length, v: taken.length > 1 ? "s" : "", v2: taken.length > 1 ? "s" : "", length2: images.length, max })
          : tr("ui.galleryUploader.plusDePlacePourCet"),
      );
    const { preparePhoto } = await import("@/lib/photos/photos");
    for (const file of taken) {
      setPreparing((n) => n + 1);
      try {
        const result = await preparePhoto(file);
        if (Math.min(result.width, result.height) < 200 || result.blob.size > 2 * 1024 * 1024)
          throw new Error(`${file.name} : photo trop petite ou trop lourde.`);
        const item: Item = {
          key: `${file.name}-${file.lastModified}-${Math.random()}`,
          blob: result.blob,
          url: result.url,
          width: result.width,
          height: result.height,
          caption: "",
        };
        setItems((list) => [...list, item]);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  };

  const drop = (key: string) =>
    setItems((list) => {
      const gone = list.find((item) => item.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((item) => item.key !== key);
    });

  const send = async () => {
    if (!category) return;
    const { asJpeg } = await import("@/lib/photos/photos");
    const queue = [...items];
    setSending({ done: 0, total: queue.length });
    let done = 0;
    for (const item of queue) {
      try {
        // Le serveur contrôle la photo en JPEG avant de la publier.
        const jpeg = await asJpeg({ ...item, faces: 0, plates: 0 });
        await onSend({
          image: await blobToBase64(jpeg),
          width: item.width,
          height: item.height,
          category,
          caption: item.caption.trim() || PHOTO_CATEGORY_FORM[category].label,
          ...(credit.trim() ? { credit: credit.trim() } : {}),
        });
        done += 1;
        drop(item.key);
        setSending({ done, total: queue.length });
        onDone();
      } catch (error) {
        toast.error((error as Error).message);
        break;
      }
    }
    setSending(null);
    if (done === queue.length) {
      toast.success(done > 1 ? tr("ui.galleryUploader.photosPubliees", { done }) : tr("ui.galleryUploader.photoPubliee"));
      onClose();
    } else if (done)
      toast.message(tr("ui.galleryUploader.photoPubliee2", { done, v: done > 1 ? "s" : "", v2: done > 1 ? "s" : "" }));
  };

  const busy = Boolean(sending) || preparing > 0;
  const ready = category && items.length > 0 && rights && !busy;
  return (
    // Pas de <form> : le bloc peut s'afficher dans une fiche qui en contient déjà un.
    <div
      role="group"
      aria-label={tr("ui.galleryUploader.ajouterDesPhotos")}
      className="grid gap-3 rounded-xl border border-border p-3 text-sm"
    >
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 font-semibold">{tr("ui.galleryUploader.t1QueMontrentLesPhotos")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              disabled={Boolean(sending)}
              onClick={() => setCategory(value)}
              className="min-h-9 rounded-full border border-border px-3 text-[13px] font-medium transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {PHOTO_CATEGORY_FORM[value].label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {category
            ? tr("ui.galleryUploader.parExemple", { v: PHOTO_CATEGORY_FORM[category].hint.toLowerCase() })
            : tr("ui.galleryUploader.choisissezUneCategorieLesVoyageurs")}
        </span>
      </fieldset>

      <div className="grid gap-1.5">
        <span className="font-semibold">{tr("ui.galleryUploader.t2LesPhotos")}</span>
        {room > 0 ? (
          <label
            className={`grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed px-3 py-5 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void pick([...event.dataTransfer.files]);
            }}
          >
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
            <span className="font-semibold">{tr("ui.galleryUploader.choisirDesPhotos")}</span>
            <span className="text-xs text-muted-foreground">
              {tr("ui.galleryUploader.ouGlissezLesIci")}{max}{tr("ui.galleryUploader.auPlusParEnvoi")}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void pick(files);
              }}
            />
          </label>
        ) : remaining <= 0 ? (
          <p className="text-xs text-muted-foreground">
            {tr("ui.galleryUploader.galerieCompleteRetirezUnePhoto")}
          </p>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {preparing
            ? tr("ui.galleryUploader.preparationReductionFloutageDesVisages")
            : tr("ui.galleryUploader.reduitesA1600Px")}
        </span>
        {items.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((item, index) => (
              <li key={item.key} className="flex gap-2 rounded-lg border border-border p-1.5">
                <img
                  src={item.url}
                  alt={tr("ui.galleryUploader.photoPreteAPartir", { v: index + 1 })}
                  className="h-16 w-24 flex-none rounded-md object-cover"
                />
                <div className="grid min-w-0 flex-1 content-start gap-1">
                  <Input
                    value={item.caption}
                    maxLength={200}
                    aria-label={tr("ui.galleryUploader.legendeDeLaPhoto", { v: index + 1 })}
                    placeholder={
                      category
                        ? tr("ui.galleryUploader.legendeSinon", { label: PHOTO_CATEGORY_FORM[category].label })
                        : tr("ui.galleryUploader.legendeFacultatif")
                    }
                    disabled={Boolean(sending)}
                    onChange={(event) =>
                      setItems((list) =>
                        list.map((other) =>
                          other.key === item.key
                            ? { ...other, caption: event.target.value }
                            : other,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center gap-1 justify-self-start text-xs text-muted-foreground hover:text-foreground"
                    disabled={Boolean(sending)}
                    onClick={() => drop(item.key)}
                  >
                    <X className="size-3.5" aria-hidden />{tr("ui.galleryUploader.retirer")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="grid gap-1">
        <span className="font-semibold">{tr("ui.galleryUploader.creditFacultatif")}</span>
        <Input
          value={credit}
          maxLength={120}
          placeholder={tr("ui.galleryUploader.auteurOuService")}
          disabled={Boolean(sending)}
          onChange={(event) => setCredit(event.target.value)}
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={rights}
          disabled={Boolean(sending)}
          onChange={(event) => setRights(event.target.checked)}
        />
        <span>{rightsLabel}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!ready} onClick={() => void send()}>
          <Send className="size-4" aria-hidden />{" "}
          {sending
            ? tr("ui.galleryUploader.envoiSur", { v: Math.min(sending.done + 1, sending.total), total: sending.total })
            : items.length > 1
              ? tr("ui.galleryUploader.publierLesPhotos", { length: items.length })
              : tr("ui.galleryUploader.publierLaPhoto")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={Boolean(sending)}
          onClick={onClose}
        >
          {tr("ui.galleryUploader.annuler")}
        </Button>
        {!category && items.length ? (
          <span className="text-xs text-muted-foreground">{tr("ui.galleryUploader.choisissezDAbordUneCategorie")}</span>
        ) : null}
      </div>
    </div>
  );
}
