import type { ReactNode } from "react";

/**
 * La 504 dessinée dans la page, jamais dans une fenêtre qui s'ouvre toute seule.
 * - "start" : page vide, on démarre ;
 * - "stuck" : le visiteur est bloqué, on dit pourquoi et on propose une suite ;
 * - "win" : une étape est réussie.
 */
export function Bw504Note({
  tone = "start",
  title,
  children,
  actions,
  className = "",
}: {
  tone?: "start" | "stuck" | "win";
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bw-504note bw-504note--${tone} ${className}`} role={tone === "stuck" ? "status" : undefined}>
      <img src="/cabas/persos/voiture_504.webp" alt="" width={56} height={56} className="bw-504note__car" />
      <div className="min-w-0">
        <p className="bw-504note__title">{title}</p>
        {children ? <div className="bw-504note__body">{children}</div> : null}
        {actions ? <div className="bw-504note__acts">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Bouton jaune principal ou bouton secondaire translucide de la 504. */
export function Bw504Button({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={primary ? "bw-504note__b1" : "bw-504note__b2"}>
      {children}
    </button>
  );
}
