import { useEffect, useRef } from "react";
import { ArrowUp, ListChecks } from "lucide-react";
import { STEP_ICONS } from "@/components/journey/JourneyFrieze";
import { JOURNEY_STEPS, stepItems, stepLabel, type JourneyStepId } from "@/lib/ferry/journeySteps";
import { defaultProfile } from "@/lib/ferry/preparation";

/** Venu du lien « Ma route du bled » de l'accueil : l'aperçu se montre directement. */
export const ROUTE_PREVIEW_EVENT = "bledway:route-preview";

/**
 * Fait défiler le seul volet qui contient l'élément (jamais la page entière : sur téléphone, la
 * carte resterait hors de l'écran). L'écart laisse la place à l'en-tête collant du volet.
 */
export function scrollInPanel(element: HTMLElement | null | undefined, gap = 64) {
  let parent = element?.parentElement ?? null;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) break;
    parent = parent.parentElement;
  }
  if (!element || !parent) return;
  const top =
    parent.scrollTop +
    element.getBoundingClientRect().top -
    parent.getBoundingClientRect().top -
    gap;
  parent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** Ce que chaque étape apporte, en une ligne : la promesse, sans jargon. */
const PROMISE: Record<JourneyStepId, string> = {
  papers: "Billet, passeports, TPD : tout vérifier au calme, avant de partir.",
  vehicle: "Voiture vérifiée, hauteur chargée, valises et budget prêts.",
  road: "L'heure de départ de chez vous, calculée avec les pauses.",
  port: "Votre heure de présentation, les contrôles, l'embarquement.",
  sea: "Le navire suivi en direct sur la carte, et le salon des passagers.",
  arrival: "Débarquement et contrôles : les bons papiers à portée de main.",
  last: "Carburant, dinars et pauses jusqu'au bled.",
  home: "Bien arrivé·e : vos retours aident les prochains voyageurs.",
};

/**
 * « Ma route du bled, étape par étape » vue avant de commencer : le visiteur voit ce qu'il obtient
 * (les vraies étapes du voyage et la liste à cocher), puis remplit son départ et son arrivée.
 */
export function RoutePreview({ onStart }: { onStart: () => void }) {
  const steps = JOURNEY_STEPS.map((id) => ({
    id,
    label: stepLabel(id),
    checks: stepItems(id, defaultProfile, "outbound").length,
  }));
  const total = steps.reduce((sum, step) => sum + step.checks, 0);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const show = () => scrollInPanel(box.current);
    window.addEventListener(ROUTE_PREVIEW_EVENT, show);
    return () => window.removeEventListener(ROUTE_PREVIEW_EVENT, show);
  }, []);
  return (
    <section ref={box} className="bw-route-preview" aria-labelledby="bw-route-preview-title">
      <header className="bw-route-preview__head">
        <p className="bw-route-preview__eyebrow">Ce que vous obtenez</p>
        <h3 id="bw-route-preview-title">Ma route du bled, étape par étape</h3>
        <p>
          De chez vous jusqu'au bled, BledWay vous guide au bon moment, avec{" "}
          <strong>{total} points à cocher</strong> pour un voyage en voiture.
        </p>
      </header>
      <ol className="bw-route-preview__steps">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[step.id];
          return (
            <li key={step.id}>
              <span className="bw-route-preview__dot" aria-hidden>
                <Icon size={15} />
              </span>
              <div>
                <p className="bw-route-preview__label">
                  <span className="sr-only">Étape {index + 1} : </span>
                  {step.label}
                  {step.checks ? (
                    <small>
                      <ListChecks size={12} aria-hidden /> {step.checks} à cocher
                    </small>
                  ) : null}
                </p>
                <p className="bw-route-preview__text">{PROMISE[step.id]}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="bw-route-preview__foot">
        <p>
          Simulez votre voyage ici. Votre liste à cocher et le suivi en direct s'activent quand vous
          suivez votre traversée.
        </p>
        <button type="button" onClick={onStart}>
          <ArrowUp size={16} aria-hidden /> Commencer : d'où partez-vous ?
        </button>
      </footer>
    </section>
  );
}
