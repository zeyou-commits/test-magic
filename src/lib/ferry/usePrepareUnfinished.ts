import { useEffect, useState } from "react";
import { COMPANION_KEY, loadPlan, PLAN_CHANGE_EVENT, planUnfinished } from "./companion";

/**
 * Le repère « ! » de « Préparer » : vrai tant que la préparation n'est pas terminée. Faux au
 * rendu serveur, puis lu dans le navigateur (et suivi quand le plan change, même dans un autre
 * onglet).
 */
export function usePrepareUnfinished() {
  const [unfinished, setUnfinished] = useState(false);
  useEffect(() => {
    const read = () => setUnfinished(planUnfinished(loadPlan()));
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === COMPANION_KEY) read();
    };
    window.addEventListener(PLAN_CHANGE_EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAN_CHANGE_EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return unfinished;
}
