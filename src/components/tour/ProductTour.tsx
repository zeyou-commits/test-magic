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
const MAP_WAIT_MS = 15000;

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
      const offset = resolved[0]?.element === null ? 1 : 0;
      const steps = total - offset;
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
        steps: resolved.map(({ step, element }, index) => {
          const welcome = element === null;
          const last = index === total - 1;
          // L'accueil ne compte pas dans « 1 sur 5 » : on numérote les étapes qui montrent quelque chose.
          const shown = welcome ? 0 : index + 1 - offset;
          return {
            ...(element ? { element } : {}),
            popover: {
              title: tr(step.title),
              description: tr(step.body),
              ...(welcome ? { popoverClass: "bw-tour bw-tour--welcome" } : {}),
              // Accueil : pas de « Précédent » (rien avant) ; ailleurs les trois boutons.
              showButtons: welcome || index === 0 ? ["next", "close"] : ["next", "previous", "close"],
              showProgress: !welcome && steps > 1,
              progressText: tr("tour.progress", { current: shown, total: steps }),
              // Driver.js donne la priorité au texte de l'étape.
              nextBtnText: welcome ? tr("tour.start") : last ? tr("tour.done") : tr("tour.next"),
              prevBtnText: tr("tour.previous"),
              closeBtnLabel: tr("tour.skip"),
              // La fin mène à une action : la visite se ferme et la recherche de traversée s'ouvre.
              ...(last && element
                ? {
                    onNextClick: () => {
                      tour.destroy();
                      element.click();
                    },
                  }
                : {}),
            },
          };
        }),
        // Un vrai bouton en toutes lettres, à gauche, en plus de la croix (« Plus tard » à l'accueil).
        // La dernière bulle n'en a pas : son bouton principal est long, la croix suffit.
        onPopoverRender: (popover, { state }) => {
          const index = state.activeIndex ?? 0;
          popover.footer.querySelector(".bw-tour__skip")?.remove();
          // « 2 sur 5 » sous le texte : le pied de bulle garde ses boutons sur une seule ligne.
          popover.wrapper.querySelector(".bw-tour__progress")?.remove();
          if (resolved[index]?.element !== null && steps > 1) {
            const progress = document.createElement("p");
            progress.className = "bw-tour__progress";
            progress.textContent = popover.progress.textContent;
            popover.description.after(progress);
          }
          if (index !== total - 1) {
            const skip = document.createElement("button");
            skip.type = "button";
            skip.className = "bw-tour__skip";
            skip.textContent = resolved[index]?.element === null ? tr("tour.later") : tr("tour.skip");
            skip.addEventListener("click", () => tour.destroy());
            popover.footer.prepend(skip);
          }
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
      const started = Date.now();
      let mapSeenAt: number | null = null;
      const tryStart = () => {
        if (cancelled) return;
        // On attend la carte (15 s au plus) : le visiteur voit d'abord BledWay, puis la bulle d'accueil.
        // Une seconde et demie de plus après la carte : le fond a le temps de se dessiner.
        const canvasAt = document.querySelector(".maplibregl-canvas") ? (mapSeenAt ??= Date.now()) : null;
        const mapReady = canvasAt !== null && Date.now() - canvasAt >= 1500;
        if (!mapReady && Date.now() - started < MAP_WAIT_MS) {
          timer = window.setTimeout(tryStart, 500);
          return;
        }
        const count = resolveSteps(WELCOME_TOUR, candidates, isVisible).length;
        if (shouldAutoStart({ seen: readSeen(), pathname: window.location.pathname, stepCount: count })) void run();
      };
      timer = window.setTimeout(tryStart, AUTO_START_DELAY_MS);
    }

    return () => {
      cancelled = true;
      window.removeEventListener(START_TOUR_EVENT, onStart);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
