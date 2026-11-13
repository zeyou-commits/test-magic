/**
 * Fermeture d'un menu de l'en-tête : le focus revient sur son bouton SANS faire défiler la page.
 * Par défaut, le navigateur fait défiler jusqu'au bouton rendu le focus ; or dans l'en-tête collant
 * il se croit en haut du document, et la page remontait d'un coup (≈ 450 px) à la touche Échap.
 */
export function refocusTriggerWithoutScroll(event: Event) {
  event.preventDefault();
  const content = event.target instanceof HTMLElement ? event.target : null;
  const triggerId = content?.getAttribute("aria-labelledby");
  const trigger = triggerId ? document.getElementById(triggerId) : null;
  trigger?.focus({ preventScroll: true });
}
