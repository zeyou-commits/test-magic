import {
  avatarColors,
  openTravellerProfile,
  personaImage,
  type TravellerCard,
} from "@/lib/community/travellers";

/**
 * L'avatar d'un voyageur : son cabas sur sa couleur, et la petite bulle de son humeur du moment.
 * Un toucher ouvre son profil public (sauf `static`).
 */
export function TravellerAvatar({
  card,
  size = 40,
  mood = true,
  moodLabel = false,
  static: isStatic = false,
}: {
  card: Pick<TravellerCard, "handle" | "pseudo" | "avatar" | "color" | "mood">;
  size?: number;
  /** Bulle d'humeur (image seule). */
  mood?: boolean;
  /** Bulle d'humeur avec son texte (grands avatars). */
  moodLabel?: boolean;
  static?: boolean;
}) {
  const body = (
    <>
      <span
        className="bw-tavatar__disc"
        style={{ background: avatarColors[card.color] ?? "#eef3ef" }}
      >
        <img src={personaImage(card.avatar)} alt="" width={size} height={size} loading="lazy" />
      </span>
      {mood && card.mood ? (
        <span
          className="bw-tavatar__mood"
          data-label={moodLabel || undefined}
          title={card.mood.label}
        >
          <img src={card.mood.image} alt="" width={18} height={18} loading="lazy" />
          {moodLabel ? (
            <span>
              {card.mood.emoji ? `${card.mood.emoji} ` : ""}
              {card.mood.label}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  const style = { "--tavatar": `${size}px` } as React.CSSProperties;
  if (isStatic)
    return (
      <span className="bw-tavatar" style={style} aria-hidden>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      className="bw-tavatar"
      style={style}
      aria-label={`Profil de ${card.pseudo}${card.mood ? ` · ${card.mood.label}` : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        openTravellerProfile(card.handle);
      }}
    >
      {body}
    </button>
  );
}
