import type { ReactNode } from "react";
import { Check, ChevronDown, CircleAlert } from "lucide-react";
import type { JourneyStepId } from "@/lib/ferry/journeySteps";
import { STEP_ICONS, type FriezeStep } from "./JourneyFrieze";

/** « mer. 4 · 07:00 » : l'heure part à droite, comme un horaire, le reste reste sous le titre. */
function splitTime(sub: string) {
  const match = sub.match(/(?:^|\s·\s)(\d{1,2}:\d{2})$/);
  if (!match) return { time: null, rest: sub };
  return { time: match[1]!, rest: sub.slice(0, match.index).trim() };
}

/** Remonte l'étape en haut de son volet défilant, sans toucher au reste de la page. */
function scrollToTop(item: HTMLElement | null) {
  let box = item?.parentElement ?? null;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!item || !box) return;
  box.scrollBy({
    top: item.getBoundingClientRect().top - box.getBoundingClientRect().top,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

/**
 * Téléphone : les étapes l'une sous l'autre, reliées par une ligne (pleine pour la traversée,
 * en pointillés sur la route), l'heure à droite. L'étape ouverte se déplie sur place.
 */
export function JourneyTimeline({
  steps,
  openId,
  hereLabel,
  onToggle,
  renderOpen,
}: {
  steps: FriezeStep[];
  openId: JourneyStepId | null;
  hereLabel: string;
  onToggle: (index: number) => void;
  renderOpen: (id: JourneyStepId) => ReactNode;
}) {
  return (
    <ol className="bw-timeline">
      {steps.map((step, index) => {
        const Icon = step.late ? CircleAlert : step.state === "done" ? Check : STEP_ICONS[step.id];
        const open = openId === step.id;
        const { time, rest } = splitTime(step.sub);
        return (
          <li
            key={step.id}
            data-state={step.state}
            data-late={step.late || undefined}
            data-open={open || undefined}
            data-kind={step.id === "sea" ? "sea" : "land"}
          >
            <button
              type="button"
              className="bw-timeline__row"
              aria-expanded={open}
              onClick={(event) => {
                const item = event.currentTarget.parentElement;
                onToggle(index);
                // L'étape dépliée remonte en tête de la liste, sans faire défiler la page.
                if (!open) window.requestAnimationFrame(() => scrollToTop(item));
              }}
            >
              <span className="bw-timeline__dot" aria-hidden>
                <Icon size={step.state === "current" ? 17 : 15} />
              </span>
              <span className="bw-timeline__text">
                {step.state === "current" ? (
                  <b className="bw-timeline__here">{hereLabel}</b>
                ) : null}
                <strong>{step.label}</strong>
                {rest ? <small>{rest}</small> : null}
                {step.count ? (
                  <small className="bw-timeline__count">
                    {step.count} voyageur{step.count > 1 ? "s" : ""} BledWay ici
                  </small>
                ) : null}
              </span>
              {time ? <span className="bw-timeline__time">{time}</span> : null}
              <ChevronDown className="bw-timeline__chevron" size={16} aria-hidden />
            </button>
            {open ? <div className="bw-timeline__body">{renderOpen(step.id)}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}
