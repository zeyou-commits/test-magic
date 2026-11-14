import type { ReactNode } from "react";
import { Pencil } from "lucide-react";

/**
 * Mon avatar, comme sur les réseaux sociaux : on le touche pour le changer. Un petit crayon en
 * bas à droite dit que c'est modifiable, avant même d'y toucher.
 */
export function EditableAvatar({
  children,
  onEdit,
  label = "Changer mon avatar",
}: {
  children: ReactNode;
  onEdit: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="bw-avatar-edit"
      onClick={onEdit}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="bw-avatar-edit__pen" aria-hidden>
        <Pencil />
      </span>
    </button>
  );
}

/** Ouvre le choix de l'avatar du profil voyageur (onglet « Mon profil ») et y amène l'écran. */
export function focusAvatarPicker() {
  window.requestAnimationFrame(() =>
    window.setTimeout(() => {
      const target = document.getElementById("mon-avatar");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.querySelector<HTMLElement>("button, [tabindex]")?.focus({ preventScroll: true });
    }, 60),
  );
}
