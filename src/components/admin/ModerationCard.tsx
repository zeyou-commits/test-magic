import type { ReactNode } from "react";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "À vérifier", tone: "todo" },
  approved: { label: "Approuvé", tone: "ok" },
  published: { label: "Publié", tone: "ok" },
  hidden: { label: "Masqué", tone: "mute" },
  rejected: { label: "Refusé", tone: "bad" },
  validated: { label: "Validé par l'équipe", tone: "ok" },
  active: { label: "En cours", tone: "warn" },
};

/** L'état d'une contribution, toujours au même endroit et dans la même couleur. */
export function StatusPill({ status, label }: { status: string; label?: string | undefined }) {
  const info = STATUS[status] ?? { label: status, tone: "mute" };
  return (
    <em className="bo-status" data-tone={info.tone}>
      {label ?? info.label}
    </em>
  );
}

/** Un bloc de modération : titre, compteur, explication, filtre à droite. */
export function ModerationSection({
  title,
  count,
  hint,
  toolbar,
  children,
}: {
  title: string;
  /** Nombre d'éléments à traiter ; 0 affiche « à jour ». */
  count?: number | undefined;
  hint?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bo-mod">
      <header className="bo-mod__head">
        <div>
          <h2>
            {title}
            {count === undefined ? null : (
              <b data-empty={count === 0 || undefined}>{count === 0 ? "à jour" : count}</b>
            )}
          </h2>
          {hint ? <p>{hint}</p> : null}
        </div>
        {toolbar ? <div className="bo-mod__tools">{toolbar}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Le filtre d'état d'un bloc : des pastilles, pas une liste déroulante. */
export function StatusFilter<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="bo-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Une contribution à relire : de quoi il s'agit, son état, qui l'a écrite, son contenu, puis
 * les décisions. Sur téléphone, les boutons passent sous le texte, en pleine largeur.
 */
export function ModerationCard({
  title,
  status,
  statusLabel,
  meta,
  author,
  children,
  actions,
}: {
  title: ReactNode;
  status?: string | undefined;
  statusLabel?: string | undefined;
  /** Nature et date, en une ligne. */
  meta?: ReactNode;
  author?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="bo-modcard" data-status={status}>
      <div className="bo-modcard__body">
        <p className="bo-modcard__title">
          <strong>{title}</strong>
          {status ? <StatusPill status={status} label={statusLabel} /> : null}
        </p>
        {meta ? <p className="bo-modcard__meta">{meta}</p> : null}
        {author}
        {children ? <div className="bo-modcard__content">{children}</div> : null}
      </div>
      {actions ? <div className="bo-modcard__actions">{actions}</div> : null}
    </li>
  );
}

export const moderationEmpty = (text: string) => <p className="bo-mod__empty">{text}</p>;
