// Le bouton retour du téléphone ferme d'abord la fenêtre ouverte (salon, choix…), pas la fiche derrière.
import { useEffect, useRef } from "react";

const overlays: (() => void)[] = [];
/** Retours lancés par l'appli elle-même : ils ne doivent rien fermer de plus. */
let ownBacks = 0;

/** À appeler en premier au retour du navigateur : vrai si une fenêtre a pris ce retour. */
export function handleOverlayBack() {
  if (ownBacks > 0) {
    ownBacks--;
    return true;
  }
  const close = overlays.pop();
  if (!close) return false;
  close();
  return true;
}

export function useBackClose(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const entry = () => latest.current();
    window.history.pushState(
      { ...(window.history.state as object | null), bwPanel: true, bwOverlay: true },
      "",
    );
    overlays.push(entry);
    return () => {
      // Fermée par sa croix : on retire aussi son entrée de l'historique.
      const index = overlays.indexOf(entry);
      if (index >= 0) {
        overlays.splice(index, 1);
        ownBacks++;
        window.history.back();
      }
    };
  }, [open]);
}
