import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, ListChecks, PartyPopper } from "lucide-react";
import {
  companionSteps,
  companionStepTitles,
  loadPlan,
  nextOpenStep,
  planWhenLabel,
} from "@/lib/ferry/companion";
import { tr } from "@/lib/i18n";

type State =
  | { kind: "new" }
  | { kind: "progress"; done: number; total: number; next: string | null }
  | { kind: "ready"; when: string };

/**
 * L'encart de l'accueil de la carte : il suit où en est la préparation au lieu de répéter le
 * même rappel (commencer, reprendre à la bonne étape, ou le voyage prêt).
 */
export function PrepareNudge() {
  const [state, setState] = useState<State>({ kind: "new" });
  useEffect(() => {
    const plan = loadPlan();
    if (!plan?.started) return;
    const steps = companionSteps(plan);
    const done = steps.filter((step) => plan.done.includes(step)).length;
    const next = nextOpenStep(plan);
    setState(
      done < steps.length
        ? {
            kind: "progress",
            done,
            total: steps.length,
            next: next ? companionStepTitles[next] : null,
          }
        : { kind: "ready", when: planWhenLabel(plan) },
    );
  }, []);

  const Icon =
    state.kind === "new" ? ListChecks : state.kind === "progress" ? CalendarCheck : PartyPopper;
  return (
    <a href="/preparer-mon-voyage" className="bw-search-papers" data-state={state.kind}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>
        {state.kind === "new" ? tr("ui.searchPanel.preparerPasAPas") : null}
        {state.kind === "progress" ? (
          <>
            {tr("ui.searchPanel.reprendrePreparation", { done: state.done, total: state.total })}
            {state.next ? (
              <small className="block font-semibold opacity-80">
                {tr("ui.searchPanel.reprendreEnsuite", { next: state.next.toLowerCase() })}
              </small>
            ) : null}
          </>
        ) : null}
        {state.kind === "ready" ? tr("ui.searchPanel.voyagePret", { when: state.when }) : null}
      </span>
      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}
