import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STEP_ICONS, type FriezeStep } from "./JourneyFrieze";
import { tr } from "@/lib/i18n";

/**
 * Navigation « story » (téléphone, et colonne étroite du simulateur) : les segments de progression,
 * puis l'étape affichée en grand entre la précédente et la suivante. Un glissement du doigt
 * passe d'une étape à l'autre.
 */
export function JourneyStoryNav({
  steps,
  index,
  onChange,
  tone = "dark",
}: {
  steps: FriezeStep[];
  index: number;
  onChange: (index: number) => void;
  tone?: "dark" | "light";
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const step = steps[index];
  const prev = steps[index - 1];
  const next = steps[index + 1];
  if (!step) return null;
  const Icon = STEP_ICONS[step.id];
  const go = (target: number) => onChange(Math.max(0, Math.min(steps.length - 1, target)));
  return (
    <div
      className="bw-story"
      data-tone={tone}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const dx = event.clientX - from.x;
        // Un geste horizontal franc seulement : le défilement vertical reste libre.
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - from.y) * 1.4)
          go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="bw-story__segments" aria-hidden>
        {steps.map((item, i) => (
          <span key={item.id} data-state={i < index ? "past" : i === index ? "now" : "later"} />
        ))}
      </div>
      <div className="bw-story__row">
        <button
          type="button"
          className="bw-story__side"
          onClick={() => go(index - 1)}
          disabled={!prev}
          aria-label={prev ? `Étape précédente : ${prev.label}` : tr("ui.journeyStoryNav.premiereEtape")}
        >
          {prev ? (
            <>
              <span>
                <ChevronLeft size={13} aria-hidden /> {prev.label}
              </span>
              <small>{prev.sub}</small>
            </>
          ) : null}
        </button>
        <div className="bw-story__now" key={step.id} aria-live="polite">
          <span className="bw-story__dot" data-state={step.late ? "late" : step.state}>
            <Icon size={20} aria-hidden />
          </span>
          <strong>{step.label}</strong>
          <small>
            {index + 1}/{steps.length} · {step.sub}
          </small>
        </div>
        <button
          type="button"
          className="bw-story__side"
          data-side="next"
          onClick={() => go(index + 1)}
          disabled={!next}
          aria-label={next ? `Étape suivante : ${next.label}` : tr("ui.journeyStoryNav.derniereEtape")}
        >
          {next ? (
            <>
              <span>
                {next.label} <ChevronRight size={13} aria-hidden />
              </span>
              <small>{next.sub}</small>
            </>
          ) : null}
        </button>
      </div>
    </div>
  );
}
