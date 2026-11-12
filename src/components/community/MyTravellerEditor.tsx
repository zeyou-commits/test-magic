import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, LoaderCircle, Smile } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  avatarColors,
  communityKey,
  myTravellerQuery,
  openTravellerProfile,
  pseudoError,
  saveTraveller,
  type AvatarColor,
  type PersonaId,
} from "@/lib/community/travellers";
import { LibraryPicker } from "./LibraryPicker";
import { MoodPicker } from "./MoodPicker";
import { TravellerAvatar } from "./TravellerAvatar";
import { tr } from "@/lib/i18n";

/** Mon profil voyageur : cabas, couleur, pseudo, humeur et visibilité sur mes traversées. */
export function MyTravellerEditor() {
  const { user } = useAuth();
  const client = useQueryClient();
  const me = useQuery(myTravellerQuery(user?.id));
  const [pseudo, setPseudo] = useState("");
  const [avatar, setAvatar] = useState<PersonaId>("lina");
  const [color, setColor] = useState<AvatarColor>("menthe");
  const [visible, setVisible] = useState(true);
  const [moodOpen, setMoodOpen] = useState(false);
  useEffect(() => {
    if (!me.data) return;
    setPseudo(me.data.pseudo);
    setAvatar(me.data.avatar);
    setColor(me.data.color);
    setVisible(me.data.show_on_trip);
  }, [me.data]);
  const locked = Boolean(me.data?.pseudo_locked);
  const renamed = Boolean(me.data) && pseudo.trim().replace(/\s+/g, " ") !== me.data!.pseudo;
  const error = locked ? null : pseudoError(pseudo);
  const save = useMutation({
    mutationFn: () => saveTraveller({ pseudo, avatar, color, showOnTrip: visible }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: communityKey });
      toast.success("Profil voyageur enregistré.");
    },
    onError: (failure: Error) => toast.error(failure.message),
  });
  if (me.isPending)
    return (
      <p className="bw-traveller-editor__loading" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />{tr("ui.myTravellerEditor.chargement")}
      </p>
    );
  if (!me.data)
    return (
      <p className="text-sm text-muted-foreground">
        {tr("ui.myTravellerEditor.leProfilVoyageurArriveBientot")}
      </p>
    );
  const preview = { ...me.data, pseudo: pseudo || me.data.pseudo, avatar, color };
  return (
    <div className="bw-traveller-editor">
      <div className="bw-traveller-editor__preview">
        <TravellerAvatar card={preview} size={76} moodLabel static />
        <div>
          <strong>{preview.pseudo}</strong>
          <p>{tr("ui.myTravellerEditor.cEstAinsiQueLes")}</p>
          <div className="bw-traveller-editor__links">
            <button type="button" onClick={() => setMoodOpen(true)}>
              <Smile size={14} aria-hidden />{" "}
              {me.data.mood ? tr("ui.myTravellerEditor.changerDHumeur") : tr("ui.myTravellerEditor.choisirUneHumeur")}
            </button>
            <button type="button" onClick={() => openTravellerProfile(me.data!.handle)}>
              <Eye size={14} aria-hidden />{tr("ui.myTravellerEditor.voirMonProfilPublic")}
            </button>
          </div>
        </div>
      </div>

      <fieldset>
        <legend>{tr("ui.myTravellerEditor.votreAvatar")}</legend>
        {/* Toute la bibliothèque : personnages, humeurs, réactions, pictos, ajouts de l'équipe. */}
        <LibraryPicker
          selected={avatar}
          onPick={(row) => setAvatar(row.id)}
          ariaLabel="Votre avatar"
          background={avatarColors[color]}
          size={56}
        />
      </fieldset>

      <fieldset>
        <legend>{tr("ui.myTravellerEditor.saCouleur")}</legend>
        <div className="bw-color-row" role="radiogroup" aria-label={tr("ui.myTravellerEditor.couleurDuFond")}>
          {(Object.keys(avatarColors) as AvatarColor[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={key}
              style={{ background: avatarColors[key] }}
              onClick={() => setColor(key)}
            />
          ))}
        </div>
      </fieldset>

      <label className="bw-traveller-editor__field">
        {tr("ui.myTravellerEditor.pseudo")}
        <input
          value={pseudo}
          maxLength={24}
          disabled={locked}
          onChange={(event) => setPseudo(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        <small data-error={Boolean(error) || undefined}>
          {error ??
            (locked
              ? tr("ui.myTravellerEditor.vousAvezDejaUtiliseVotre")
              : tr("ui.myTravellerEditor.attentionVousNePouvezLe"))}
        </small>
      </label>

      <label className="bw-traveller-editor__toggle">
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        <span>
          <strong>{tr("ui.myTravellerEditor.apparaitreParmiLesVoyageursDe")}</strong>
          <small>{tr("ui.myTravellerEditor.avecVotreCabasVotrePseudo")}</small>
        </span>
      </label>

      <div className="bw-traveller-editor__save">
        <button
          type="button"
          className="bw-action-primary"
          disabled={Boolean(error) || save.isPending}
          onClick={() => {
            if (
              !renamed ||
              window.confirm(
                `Changer votre pseudo pour « ${pseudo.trim()} » ? Ce changement est unique et définitif.`,
              )
            )
              save.mutate();
          }}
        >
          {save.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {tr("ui.myTravellerEditor.enregistrer")}
        </button>
      </div>
      <MoodPicker
        open={moodOpen}
        onOpenChange={setMoodOpen}
        moment={null}
        current={me.data.mood?.code ?? null}
        currentImage={me.data.mood?.image ?? null}
      />
    </div>
  );
}
