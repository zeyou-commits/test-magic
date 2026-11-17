import { useEffect, useState } from "react";
import { COMPANION_KEY, loadPlan, PLAN_CHANGE_EVENT, planUnfinished } from "./companion";

/**
 * Le repère « ! » de « Préparer » : vrai quand une préparation commencée n'est pas terminée. Faux
 * au rendu serveur, puis lu dans le navigateur (et suivi quand le plan change, même dans un autre
 * onglet).
 */
export function usePrepareUnfinished() {
  return usePrepareStatus() === "todo";
}

/**
 * « todo » : commencée, à terminer ; « done » : tout est prêt ; null : pas encore commencée (aucun
 * repère : un « ! » ferait croire à un problème à quelqu'un qui n'a rien lancé) ou rendu serveur.
 */
export function usePrepareStatus() {
  const [status, setStatus] = useState<"todo" | "done" | null>(null);
  useEffect(() => {
    const read = () => {
      const plan = loadPlan();
      setStatus(!plan?.started ? null : planUnfinished(plan) ? "todo" : "done");
    };
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
