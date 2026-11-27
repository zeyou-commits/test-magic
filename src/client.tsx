import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

/**
 * Entrée du navigateur : la même que celle de TanStack Start, mais l'hydratation attend que la
 * première image du HTML serveur soit affichée. Sans cela, quand les scripts sont déjà là, le
 * navigateur exécute toute l'hydratation avant de peindre : sur un téléphone lent, la page reste
 * blanche plusieurs secondes alors que son HTML est prêt.
 */
function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

if (document.visibilityState === "visible" && typeof requestAnimationFrame === "function") {
  // requestAnimationFrame passe juste avant l'affichage ; le setTimeout, juste après.
  requestAnimationFrame(() => setTimeout(hydrate, 0));
} else {
  // Onglet en arrière-plan : pas d'image à attendre (requestAnimationFrame y est suspendu).
  hydrate();
}
