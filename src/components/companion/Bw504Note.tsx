import type { ReactNode } from "react";
import { tr } from "@/lib/i18n";

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

/**
 * « Bon à savoir » : une règle ou un conseil donné en passant, porté par la petite 504, pour qu'il
 * ne se perde pas dans un simple texte gris. Une règle de droit vient ici, avec sa source
 * (`source`), jamais dans la bulle de la 504.
 */
export function BwKnow({
  children,
  source,
  className = "",
}: {
  children: ReactNode;
  source?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`bw-know ${className}`}>
      <img src="/cabas/persos/voiture_504.webp" alt="" width={34} height={34} className="bw-know__car" />
      <div className="min-w-0">
        <p>
          <b>{tr("ui.bw504Note.bonASavoir")}</b>
          {children}
        </p>
        {source ? <div className="bw-know__src">{source}</div> : null}
      </div>
    </aside>
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
