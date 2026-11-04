import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Flag, LoaderCircle, ScanFace, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  deletePhoto,
  photosKey,
  photoUrl,
  preparePhoto,
  reportPhoto,
  type PreparedPhoto,
  type PublicPhoto,
} from "@/lib/photos/photos";

/** Les règles affichées au moment de joindre une photo. */
export const PHOTO_CONSENT =
  "J’ai vérifié l’aperçu : aucun visage ni plaque ne reste lisible, et j’ai le droit de publier cette photo.";

/**
 * Joindre jusqu'à `max` photos : réduites et sans métadonnées (position GPS comprise) dès le choix.
 * L'accord de l'auteur est demandé dès qu'une photo est jointe.
 */
export function PhotoPicker({
  max,
  photos,
  onChange,
  consent,
  onConsent,
  note,
  check,
}: {
  max: number;
  photos: PreparedPhoto[];
  onChange: (photos: PreparedPhoto[]) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
  /** Ce qui se passe ensuite (« visible après validation », « publiée tout de suite »…). */
  note: string;
  /** Contrôle supplémentaire (filtre automatique des salons). */
  check?: (photo: PreparedPhoto) => Promise<string | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Le détecteur de visages se charge dès que le formulaire propose une photo.
  useEffect(() => {
    void import("@/lib/photos/faces").then((module) => module.warmFaceDetector());
  }, []);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    const next = [...photos];
    for (const file of [...files].slice(0, max - photos.length)) {
      try {
        const photo = await preparePhoto(file);
        const refused = check ? await check(photo) : null;
        if (refused) {
          URL.revokeObjectURL(photo.url);
          setProblem(refused);
          continue;
        }
        next.push(photo);
      } catch (cause) {
        setProblem(cause instanceof Error ? cause.message : "Photo illisible.");
      }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="bw-photo-picker">
      {photos.length ? (
        <ul>
          {photos.map((photo, index) => (
            <li key={photo.url}>
              <img src={photo.url} alt={`Photo ${index + 1}`} />
              {photo.faces ? (
                <span className="bw-photo-picker__faces" title="Visages floutés automatiquement">
                  <ScanFace size={12} aria-hidden /> {photo.faces}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Retirer la photo ${index + 1}`}
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  onChange(photos.filter((item) => item !== photo));
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {photos.length < max ? (
        <button
          type="button"
          className="bw-photo-picker__add"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <LoaderCircle size={15} className="animate-spin" aria-hidden />
          ) : (
            <Camera size={15} aria-hidden />
          )}
          {busy
            ? "Floutage des visages…"
            : max > 1
              ? `Ajouter une photo (${photos.length}/${max})`
              : "Ajouter une photo"}
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={max - photos.length > 1}
        hidden
        onChange={(event) => void add(event.target.files)}
      />
      {problem ? <p role="alert">{problem}</p> : null}
      {photos.length ? (
        <>
          <label className="bw-photo-picker__consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => onConsent(event.target.checked)}
            />
            <span>{PHOTO_CONSENT}</span>
          </label>
          <small>
            {photos.some((photo) => photo.faces)
              ? `${photos.reduce((sum, photo) => sum + photo.faces, 0)} visage(s) flouté(s) automatiquement. `
              : "Visages floutés automatiquement s’il y en a. "}
            {note} Position GPS et infos de l’appareil retirées de la photo.
          </small>
        </>
      ) : null}
    </div>
  );
}

/** Vignettes des photos publiées ; un toucher les agrandit, avec « Signaler ». */
export function PhotoStrip({
  photos,
  label,
}: {
  photos: PublicPhoto[] | undefined;
  label: string;
}) {
  const { user, roles } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState<PublicPhoto | null>(null);
  const [reported, setReported] = useState(false);
  const staff = roles.some((role) => role === "admin" || role === "moderator");
  if (!photos?.length) return null;
  return (
    <>
      <ul className="bw-photo-strip" aria-label={label}>
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => {
                setReported(false);
                setOpen(photo);
              }}
              aria-label={`Agrandir la photo ${index + 1}`}
            >
              <img
                src={photoUrl(photo.path)}
                alt=""
                loading="lazy"
                width={photo.width}
                height={photo.height}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="bw-photo-viewer">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">Photo partagée par un voyageur</DialogDescription>
          {open ? <img src={photoUrl(open.path)} alt="" /> : null}
          {user && open ? (
            <button
              type="button"
              className="bw-photo-viewer__report"
              disabled={reported}
              onClick={() =>
                void reportPhoto(open.id)
                  .then(() => {
                    setReported(true);
                    toast.success("Merci, l’équipe va regarder cette photo.");
                  })
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <Flag size={14} aria-hidden /> {reported ? "Signalée" : "Signaler cette photo"}
            </button>
          ) : null}
          {open && (open.mine || staff) ? (
            <button
              type="button"
              className="bw-photo-viewer__report"
              onClick={() => {
                if (!window.confirm("Retirer définitivement cette photo ?")) return;
                void deletePhoto(open.id)
                  .then(() => {
                    setOpen(null);
                    void client.invalidateQueries({ queryKey: photosKey });
                    toast.success("Photo retirée.");
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              <Trash2 size={14} aria-hidden /> {open.mine ? "Retirer ma photo" : "Retirer (équipe)"}
            </button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
