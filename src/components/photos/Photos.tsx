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
import { tr } from "@/lib/i18n";

/**
 * Types acceptés par le sélecteur de fichier. Chrome sur Android 14 et plus n'ouvre que la galerie
 * quand on n'accepte que des images ; un second type lui fait proposer le choix standard
 * « Appareil photo / Fichiers ». Un fichier qui n'est pas une image est refusé à la préparation.
 */
export const PHOTO_ACCEPT = "image/*,text/plain";

/** L'accord demandé sous l'aperçu flouté, à chaque photo (règle aussi dans la charte). */
export const PHOTO_CONSENT =
  "J’ai vérifié l’aperçu : aucun visage ni plaque ne reste lisible, et j’ai le droit de publier cette photo.";

/** L'accord demandé pour une photo de profil : le visage reste visible, c'est son but. */
export const PROFILE_PHOTO_CONSENT =
  "C’est bien moi (ou une image que j’ai le droit d’utiliser) et j’accepte que cette photo soit visible des autres voyageurs, une fois validée par l’équipe.";

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
  profile = false,
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
  /**
   * Photo de profil : recadrée en carré, visage gardé (seule exception au floutage), plaques
   * floutées, filtre de contenu explicite et accord de l'auteur comme pour toutes les photos.
   */
  profile?: boolean;
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
        const photo = await preparePhoto(
          file,
          profile ? { blurFaces: false, square: 640 } : undefined,
        );
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
        setProblem(cause instanceof Error ? cause.message : tr("ui.photos.photoIllisible"));
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
              <img src={photo.url} alt={tr("ui.photos.photo", { v: index + 1 })} />
              {photo.faces + photo.plates ? (
                <span className="bw-photo-picker__faces" title={tr("ui.photos.zonesFlouteesAutomatiquement")}>
                  <ScanFace size={12} aria-hidden /> {photo.faces + photo.plates}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={tr("ui.photos.retirerLaPhoto", { v: index + 1 })}
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
            <span>{profile ? PROFILE_PHOTO_CONSENT : PHOTO_CONSENT}</span>
          </label>
          <small>
            {profile ? "" : blurredLabel(photos)}
            {note}{tr("ui.photos.positionGpsEtInfosDe")}
          </small>
        </>
      ) : null}
      {busy ? (
        <p className="bw-photo-picker__busy" role="status">
          <LoaderCircle size={15} className="animate-spin" aria-hidden />
          {profile ? tr("ui.photos.preparationDeLaPhoto") : tr("ui.photos.floutageDesVisagesEtPlaques")}
        </p>
      ) : null}
      {/* Un seul bouton : le téléphone propose lui-même « Appareil photo » ou « Galerie ». */}
      {!hideSources && (photos.length < max || max === 1) && !busy ? (
        <label className="bw-photo-picker__add">
          <Camera size={15} aria-hidden />
          {photos.length && max === 1
            ? tr("ui.photos.changerDePhoto")
            : max > 1
              ? tr("ui.photos.ajouterUnePhoto2", { length: photos.length, max })
              : tr("ui.photos.ajouterUnePhoto")}
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
    ? tr("ui.photos.flouteAutomatiquement", { v: parts.join(" et "), v2: faces + plates > 1 ? "s" : "" })
    : tr("ui.photos.visagesEtPlaquesFloutesAutomatiquement");
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
              aria-label={tr("ui.photos.agrandirLaPhoto", { v: index + 1 })}
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
          <DialogDescription className="sr-only">{tr("ui.photos.photoPartageeParUnVoyageur")}</DialogDescription>
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
                    toast.success(tr("ui.photos.merciLEquipeVaRegarder"));
                  })
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <Flag size={14} aria-hidden /> {reported ? tr("ui.photos.signalee") : tr("ui.photos.signalerCettePhoto")}
            </button>
          ) : null}
          {open && (open.mine || staff) ? (
            <button
              type="button"
              className="bw-photo-viewer__report"
              onClick={() => {
                if (!window.confirm(tr("ui.photos.retirerDefinitivementCettePhoto"))) return;
                void deletePhoto(open)
                  .then(() => {
                    setOpen(null);
                    void client.invalidateQueries({ queryKey: photosKey });
                    toast.success(tr("ui.photos.photoRetiree"));
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              <Trash2 size={14} aria-hidden /> {open.mine ? tr("ui.photos.retirerMaPhoto") : tr("ui.photos.retirerEquipe")}
            </button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
