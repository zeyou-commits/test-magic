import { useEffect, useState } from "react";
import { COMPANION_KEY, loadPlan, PLAN_CHANGE_EVENT, planUnfinished } from "./companion";

/**
 * Le repère « ! » de « Préparer » : vrai tant que la préparation n'est pas terminée. Faux au
 * rendu serveur, puis lu dans le navigateur (et suivi quand le plan change, même dans un autre
 * onglet).
 */
export function usePrepareUnfinished() {
  return usePrepareStatus() === "todo";
}

/** « todo » : à terminer ; « done » : tout est prêt ; null au rendu serveur. */
export function usePrepareStatus() {
  const [status, setStatus] = useState<"todo" | "done" | null>(null);
  useEffect(() => {
    const read = () => setStatus(planUnfinished(loadPlan()) ? "todo" : "done");
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
  return status;
}
