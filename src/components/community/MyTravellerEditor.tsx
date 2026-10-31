import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, LoaderCircle, Smile } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  avatarColors,
  communityKey,
  myTravellerQuery,
  openTravellerProfile,
  personaImage,
  personas,
  pseudoError,
  saveTraveller,
  type AvatarColor,
  type PersonaId,
} from "@/lib/community/travellers";
import { MoodPicker } from "./MoodPicker";
import { TravellerAvatar } from "./TravellerAvatar";

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
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Chargement…
      </p>
    );
  if (!me.data)
    return (
      <p className="text-sm text-muted-foreground">
        Le profil voyageur arrive bientôt : il sera disponible dès la prochaine mise à jour.
      </p>
    );
  const preview = { ...me.data, pseudo: pseudo || me.data.pseudo, avatar, color };
  return (
    <div className="bw-traveller-editor">
      <div className="bw-traveller-editor__preview">
        <TravellerAvatar card={preview} size={76} moodLabel static />
        <div>
          <strong>{preview.pseudo}</strong>
          <p>C’est ainsi que les autres voyageurs vous voient : ni nom, ni e-mail, ni dates.</p>
          <div className="bw-traveller-editor__links">
            <button type="button" onClick={() => setMoodOpen(true)}>
              <Smile size={14} aria-hidden />{" "}
              {me.data.mood ? "Changer d’humeur" : "Choisir une humeur"}
            </button>
            <button type="button" onClick={() => openTravellerProfile(me.data!.handle)}>
              <Eye size={14} aria-hidden /> Voir mon profil public
            </button>
          </div>
        </div>
      </div>

      <fieldset>
        <legend>Votre cabas</legend>
        <div className="bw-persona-grid" role="radiogroup" aria-label="Votre cabas">
          {personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              role="radio"
              aria-checked={avatar === persona.id}
              onClick={() => setAvatar(persona.id)}
              style={{ background: avatarColors[color] }}
            >
              <img src={personaImage(persona.id)} alt="" width={56} height={56} loading="lazy" />
              <span>{persona.name}</span>
              {avatar === persona.id ? <Check size={13} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Sa couleur</legend>
        <div className="bw-color-row" role="radiogroup" aria-label="Couleur du fond">
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
        Pseudo
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
              ? "Vous avez déjà utilisé votre unique changement de pseudo."
              : "Attention : vous ne pouvez le changer qu'une seule fois. Évitez votre nom complet.")}
        </small>
      </label>

      <label className="bw-traveller-editor__toggle">
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        <span>
          <strong>Apparaître parmi les voyageurs de ma traversée</strong>
          <small>Avec votre cabas, votre pseudo et votre humeur, sans aucune date.</small>
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
          Enregistrer
        </button>
      </div>
      <MoodPicker
        open={moodOpen}
        onOpenChange={setMoodOpen}
        moment={null}
        current={me.data.mood?.code ?? null}
      />
    </div>
  );
}
