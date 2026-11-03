import { useState } from "react";
import { Star } from "lucide-react";
import { reviewNumber } from "@/lib/ferry/reviewCriteria";

const WORDS = ["", "Décevant", "Bof", "Correct", "Bien", "Excellent"];

/**
 * Étoiles de note cliquables, partout (navire, port, compagnie) : elles montrent la moyenne,
 * s'animent au survol pour inviter à noter, et un clic sur l'étoile n ouvre le formulaire
 * pré-rempli à n. Remplace les boutons « Noter ce navire / Noter ».
 */
export function RateStars({
  average,
  count,
  subject,
  onRate,
  onOpen,
  size = 18,
}: {
  average: number | null | undefined;
  count: number;
  /** « ce navire », « ce port », « cette compagnie ». */
  subject: string;
  onRate: (score: number) => void;
  /** Ouvre la liste des avis (lien « 12 avis »). */
  onOpen?: () => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || (count ? (average ?? 0) : 0);
  return (
    <div className="bw-rate" data-empty={count ? undefined : ""} onMouseLeave={() => setHover(0)}>
      <span className="bw-rate__stars" role="group" aria-label={`Noter ${subject}`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = hover
            ? n <= hover
              ? 100
              : 0
            : Math.max(0, Math.min(1, shown - n + 1)) * 100;
          return (
            <button
              key={n}
              type="button"
              className="bw-rate__star"
              style={{ "--i": n, "--s": `${size}px` } as React.CSSProperties}
              aria-label={`Donner ${n} étoile${n > 1 ? "s" : ""} à ${subject}`}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={(event) => {
                event.stopPropagation();
                onRate(n);
              }}
            >
              <Star size={size} aria-hidden />
              <span className="bw-rate__fill" style={{ width: `${fill}%` }} aria-hidden>
                <Star size={size} />
              </span>
            </button>
          );
        })}
      </span>
      <span className="bw-rate__text" aria-live="polite">
        {hover ? (
          <>
            <strong>{WORDS[hover]}</strong> · cliquez pour noter
          </>
        ) : count && average != null ? (
          <>
            <strong>{reviewNumber(average)}</strong>{" "}
            {onOpen ? (
              <button type="button" className="bw-rate__count" onClick={onOpen}>
                · {count} avis
              </button>
            ) : (
              <span> · {count} avis</span>
            )}
          </>
        ) : (
          <span>Soyez le premier à noter</span>
        )}
      </span>
    </div>
  );
}
