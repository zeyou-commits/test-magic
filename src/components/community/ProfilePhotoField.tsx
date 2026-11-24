import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PhotoPicker } from "@/components/photos/Photos";
import { communityKey } from "@/lib/community/travellers";
import {
  deletePhoto,
  myProfilePhotoQuery,
  photosKey,
  photoUrl,
  submitProfilePhoto,
  type PreparedPhoto,
} from "@/lib/photos/photos";
import { tr } from "@/lib/i18n";

/**
 * Ma photo de profil, en plus des avatars : réduite, sans métadonnées, filtre de contenu explicite
 * (téléphone puis serveur) et accord, sans floutage du visage. Publiée tout de suite, sans attendre
 * l'équipe ; deux signalements la retirent et la renvoient à l'équipe.
 */
export function ProfilePhotoField() {
  const { user } = useAuth();
  const client = useQueryClient();
  const mine = useQuery(myProfilePhotoQuery(user?.id));
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [consent, setConsent] = useState(false);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: photosKey });
    void client.invalidateQueries({ queryKey: communityKey });
  };
  const send = useMutation({
    mutationFn: () => submitProfilePhoto(user!.id, photos[0]!),
    onSuccess: () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setPhotos([]);
      setConsent(false);
      refresh();
      toast.success(tr("ui.profilePhotoField.photoPublieeElleRemplaceVotre"));
    },
    onError: (failure: Error) => toast.error(failure.message),
  });
  const remove = useMutation({
    mutationFn: (photo: { id: string; path: string }) => deletePhoto(photo),
    onSuccess: () => {
      refresh();
      toast.success(tr("ui.profilePhotoField.photoRetireeVotreAvatarReprend"));
    },
    onError: (failure: Error) => toast.error(failure.message),
  });
  // Script SQL pas encore exécuté : rien à proposer, sans erreur à l'écran.
  if (!user || mine.data === null || mine.isPending) return null;
  const approved = mine.data?.approved ?? null;
  const pending = mine.data?.pending ?? null;
  return (
    <fieldset className="bw-profile-photo">
      <legend>{tr("ui.profilePhotoField.votrePhotoDeProfil")}</legend>
      <p className="text-xs text-muted-foreground">
        {tr("ui.profilePhotoField.facultativeElleRemplaceVotreAvatar")}
      </p>
      {approved ? (
        <div className="mt-2 flex items-center gap-3">
          <img
            src={photoUrl(approved.path)}
            alt={tr("ui.profilePhotoField.votrePhotoDeProfil")}
            width={56}
            height={56}
            className="size-14 rounded-full object-cover"
          />
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(tr("ui.profilePhotoField.retirerVotrePhotoDeProfil"))
              )
                remove.mutate(approved);
            }}
          >
            <Trash2 size={14} aria-hidden />{tr("ui.profilePhotoField.retirerMaPhoto")}
          </button>
        </div>
      ) : null}
      {pending ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          <Clock size={14} aria-hidden />
          {tr("ui.profilePhotoField.votrePhotoEstEnCours")}
          <button
            type="button"
            className="ms-auto font-semibold underline"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ id: pending.id, path: "" })}
          >
            {tr("ui.profilePhotoField.laRetirer")}
          </button>
        </p>
      ) : null}
      <div className="mt-2">
        <PhotoPicker
          max={1}
          profile
          photos={photos}
          onChange={setPhotos}
          consent={consent}
          onConsent={setConsent}
          note="Visible tout de suite par les autres voyageurs."
        />
      </div>
      {photos.length ? (
        <button
          type="button"
          className="bw-action-primary mt-2"
          disabled={!consent || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {tr("ui.profilePhotoField.publierMaPhoto")}
        </button>
      ) : null}
    </fieldset>
  );
}
