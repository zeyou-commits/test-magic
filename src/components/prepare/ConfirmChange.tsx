import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bw504Note } from "@/components/companion/Bw504Note";

/**
 * Avant de modifier une étape déjà validée, quand la modification change la suite (voyageurs,
 * passeports, date) : la 504 dit ce qui va bouger, on confirme ou on garde tout tel quel.
 */
export function ConfirmChange({
  title,
  children,
  confirmLabel = "Oui, modifier",
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onCancel]);
  return createPortal(
    <div className="bw-recap-sheet">
      <button
        type="button"
        className="bw-recap-sheet__scrim"
        aria-label="Annuler"
        tabIndex={-1}
        onClick={onCancel}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bw-recap-sheet__panel bw-confirm"
      >
        <span className="bw-recap-sheet__handle" aria-hidden />
        <Bw504Note title={title}>{children}</Bw504Note>
        <div className="bw-confirm__acts">
          <button type="button" className="bw-confirm__no" onClick={onCancel}>
            Garder tel quel
          </button>
          <button type="button" className="bw-recap-sheet__cta" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
