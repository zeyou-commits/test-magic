// Visite guidée de l'accueil (Driver.js, licence MIT), chargée seulement quand elle s'ouvre.
// S'ouvre seule une fois sur l'accueil ; se relance depuis le menu (« Revoir la visite guidée »).
// Se ferme à tout moment : « Quitter », toucher en dehors de la zone éclairée, ou Échap.
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { tr } from "@/lib/i18n";
import {
  resolveSteps,
  shouldAutoStart,
  START_TOUR_EVENT,
  TOUR_STORAGE_PREFIX,
  WELCOME_TOUR,
  WELCOME_TOUR_ID,
  type TourTarget,
} from "@/lib/tour/steps";

const SEEN_KEY = TOUR_STORAGE_PREFIX + WELCOME_TOUR_ID;
/** Laisse la carte et l'en-tête se poser avant d'éclairer quoi que ce soit. */
const AUTO_START_DELAY_MS = 2500;

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "done";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "done");
  } catch {
    /* navigation privée : la visite pourra revenir, sans gravité */
  }
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0;
}

const candidates = (target: TourTarget) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));

export function startProductTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

export function ProductTour() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (running.current) return;
      const resolved = resolveSteps(WELCOME_TOUR, candidates, isVisible);
      if (!resolved.length) return;
      running.current = true;
      const { driver } = await import("driver.js");
      if (cancelled) {
        running.current = false;
        return;
      }
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const total = resolved.length;
      const root = document.documentElement;
      root.setAttribute("data-tour-active", "true");

      const tour = driver({
        animate: !reduceMotion,
        smoothScroll: !reduceMotion,
        allowClose: true,
        overlayClickBehavior: "close",
        allowKeyboardControl: true,
        overlayColor: "#0b1f2e",
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 14,
        popoverOffset: 12,
        popoverClass: "bw-tour",
        showButtons: ["next", "previous", "close"],
        disableActiveInteraction: true,
        steps: resolved.map(({ step, element }, index) => ({
          element,
          popover: {
            title: tr(step.title),
            description: tr(step.body),
            showProgress: total > 1,
            progressText: tr("tour.progress", { current: index + 1, total }),
            // Driver.js donne la priorité au texte de l'étape : la dernière dit « C'est parti ».
            nextBtnText: index === total - 1 ? tr("tour.done") : tr("tour.next"),
            prevBtnText: tr("tour.previous"),
            closeBtnLabel: tr("tour.skip"),
          },
        })),
        // Un vrai bouton « Quitter » en toutes lettres, à gauche, en plus de la croix.
        onPopoverRender: (popover) => {
          if (popover.footer.querySelector(".bw-tour__skip")) return;
          const skip = document.createElement("button");
          skip.type = "button";
          skip.className = "bw-tour__skip";
          skip.textContent = tr("tour.skip");
          skip.addEventListener("click", () => tour.destroy());
          popover.footer.prepend(skip);
          // Driver.js pose le focus sur la croix ; on le met sur le bouton principal, sans anneau au toucher.
          window.setTimeout(() => popover.nextButton.focus({ preventScroll: true, focusVisible: false } as FocusOptions), 0);
        },
        onDestroyed: () => {
          markSeen();
          root.removeAttribute("data-tour-active");
          running.current = false;
        },
      });
      tour.drive();
    };

    const onStart = () => void run();
    window.addEventListener(START_TOUR_EVENT, onStart);

    let timer: number | undefined;
    if (!readSeen() && pathname === "/") {
      timer = window.setTimeout(() => {
        const count = resolveSteps(WELCOME_TOUR, candidates, isVisible).length;
        if (shouldAutoStart({ seen: readSeen(), pathname: window.location.pathname, stepCount: count })) void run();
      }, AUTO_START_DELAY_MS);
    }

    return () => {
      cancelled = true;
      window.removeEventListener(START_TOUR_EVENT, onStart);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
