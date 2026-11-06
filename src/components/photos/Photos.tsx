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

/**
 * Types acceptés par le sélecteur de fichier. Chrome sur Android 14 et plus n'ouvre que la galerie
 * quand on n'accepte que des images ; un second type lui fait proposer le choix standard
 * « Appareil photo / Fichiers ». Un fichier qui n'est pas une image est refusé à la préparation.
 */
export const PHOTO_ACCEPT = "image/*,text/plain";

/** L'accord demandé sous l'aperçu flouté, à chaque photo (règle aussi dans la charte). */
export const PHOTO_CONSENT =
  "J’ai vérifié l’aperçu : aucun visage ni plaque ne reste lisible, et j’ai le droit de publier cette photo.";

/**
 * Joindre jusqu'à `max` photos : réduites, visages floutés et sans métadonnées (position GPS
 * comprise) dès le choix. L'aperçu flouté reste sous les yeux jusqu'à l'envoi.
 */
export function PhotoPicker({
  max,
  photos,
  onChange,
  consent,
  onConsent,
  note,
  check,
  incoming,
  onIncomingDone,
  hideSources = false,
}: {
  max: number;
  photos: PreparedPhoto[];
  onChange: (photos: PreparedPhoto[]) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
  /** Ce qui se passe ensuite (« visible après validation », « publiée tout de suite »…). */
  note: string;
  /** Contrôle supplémentaire, après le filtre de contenu explicite commun à toutes les photos. */
  check?: (photo: PreparedPhoto) => Promise<string | null>;
  /** Fichiers choisis ailleurs (icônes du salon) : traités dès leur arrivée. */
  incoming?: File[] | null;
  onIncomingDone?: () => void;
  /** Les boutons « Prendre une photo / Galerie » sont ailleurs (salon). */
  hideSources?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Le détecteur de visages se charge dès que le formulaire propose une photo.
  useEffect(() => {
    void import("@/lib/photos/faces").then((module) => module.warmFaceDetector());
    void import("@/lib/photos/plates").then((module) => module.warmPlateDetector());
    void import("@/lib/photos/nsfw").then((module) => module.warmChatPhotoCheck());
  }, []);
  const add = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    // Une seule photo permise : la nouvelle remplace l'ancienne.
    const next = max === 1 ? [] : [...photos];
    if (max === 1) photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    for (const file of [...files].slice(0, max - next.length)) {
      try {
        const photo = await preparePhoto(file);
        // Contenu explicite refusé partout, avant tout envoi (le serveur recontrôle les salons).
        const verdict = await (await import("@/lib/photos/nsfw")).checkChatPhoto(photo.url);
        const refused = verdict.ok ? (check ? await check(photo) : null) : verdict.reason;
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
  useEffect(() => {
    if (!incoming?.length) return;
    void add(incoming).finally(() => onIncomingDone?.());
    // Seule l'arrivée de nouveaux fichiers déclenche le traitement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);
  return (
    <div className="bw-photo-picker">
      {photos.length ? (
        <ul>
          {photos.map((photo, index) => (
            <li key={photo.url}>
              <img src={photo.url} alt={`Photo ${index + 1}`} />
              {photo.faces + photo.plates ? (
                <span className="bw-photo-picker__faces" title="Zones floutées automatiquement">
                  <ScanFace size={12} aria-hidden /> {photo.faces + photo.plates}
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
            {blurredLabel(photos)}
            {note} Position GPS et infos de l’appareil retirées de la photo.
          </small>
        </>
      ) : null}
      {busy ? (
        <p className="bw-photo-picker__busy" role="status">
          <LoaderCircle size={15} className="animate-spin" aria-hidden /> Floutage des visages et
          plaques…
        </p>
      ) : null}
      {/* Un seul bouton : le téléphone propose lui-même « Appareil photo » ou « Galerie ». */}
      {!hideSources && (photos.length < max || max === 1) && !busy ? (
        <label className="bw-photo-picker__add">
          <Camera size={15} aria-hidden />
          {photos.length && max === 1
            ? "Changer de photo"
            : max > 1
              ? `Ajouter une photo (${photos.length}/${max})`
              : "Ajouter une photo"}
          <input
            ref={input}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple={max - photos.length > 1}
            hidden
            onChange={(event) => void add(event.target.files)}
          />
        </label>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}

/** « 2 visages et 1 plaque floutés automatiquement. » */
function blurredLabel(photos: PreparedPhoto[]) {
  const faces = photos.reduce((sum, photo) => sum + photo.faces, 0);
  const plates = photos.reduce((sum, photo) => sum + photo.plates, 0);
  const parts = [
    faces ? `${faces} visage${faces > 1 ? "s" : ""}` : null,
    plates ? `${plates} plaque${plates > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return parts.length
    ? `${parts.join(" et ")} flouté${faces + plates > 1 ? "s" : ""} automatiquement. `
    : "Visages et plaques floutés automatiquement s’il y en a. ";
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
                void deletePhoto(open)
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
