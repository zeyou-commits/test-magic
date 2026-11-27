import { useEffect, useState } from "react";

/**
 * Vrai une fois la page au repos après l'hydratation (ou au plus tard après `timeout` ms).
 * Sert à monter ce qui n'est pas utile au premier coup d'œil (défilé des salons, invitations,
 * carte) après le formulaire, sans changer le HTML du serveur : faux au rendu serveur et au
 * premier rendu du navigateur.
 */
export function useAfterIdle(timeout = 2000) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), { timeout });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), Math.min(timeout, 600));
    return () => window.clearTimeout(id);
  }, [timeout]);
  return ready;
}
