import type { ReactNode } from "react";
import { Check, ExternalLink, MessagesSquare, X } from "lucide-react";
import type { PrepItem } from "@/lib/ferry/preparation";
import type { StepLink, StepState } from "@/lib/ferry/journeySteps";

/**
 * Le volet d'une étape : ce qu'il faut savoir, les actions à cocher (le parcours de préparation
 * existant), les liens utiles et la question au salon. Posé par-dessus la carte.
 */
export function JourneyStepPanel({
  title,
  state,
  index,
  count,
  lead,
  links,
  items = [],
  done = [],
  onToggle,
  pinned = false,
  onClose,
  onAsk,
  askLabel = "Une question sur cette étape ?",
  before,
  after,
  onNavigate,
}: {
  title: string;
  state: StepState;
  index: number;
  count: number;
  lead: string;
  links: StepLink[];
  items?: PrepItem[];
  done?: string[];
  onToggle?: (id: string) => void;
  pinned?: boolean;
  onClose?: () => void;
  onAsk?: () => void;
  askLabel?: string;
  /** Sous le texte : « Où en êtes-vous ? », trajet sur mesure… */
  before?: ReactNode;
  /** Sous les actions : note de la traversée, infos du port… */
  after?: ReactNode;
  /** Lien interne pris en charge sur place (fiche d'un port) : true évite le rechargement. */
  onNavigate?: (href: string) => boolean;
}) {
  const badge =
    state === "current"
      ? "Maintenant"
      : state === "done"
        ? "Passée"
        : `Étape ${index + 1}/${count}`;
  const finished = items.length > 0 && items.every((item) => done.includes(item.id));
  return (
    <article className="bw-step-panel" data-state={state} aria-label={`Étape : ${title}`}>
      <header>
        <span className="bw-step-panel__badge" data-state={state}>
          {badge}
        </span>
        <h2>{title}</h2>
        {pinned && onClose ? (
          <button
            type="button"
            className="bw-step-panel__close"
            onClick={onClose}
            aria-label="Fermer le volet"
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </header>
      <p className="bw-step-panel__lead">{lead}</p>
      {before}
      {items.length ? (
        <ul className="bw-step-panel__items" aria-label="À faire">
          {items.map((item) => {
            const checked = done.includes(item.id);
            return (
              <li key={item.id} data-done={checked || undefined}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={!onToggle}
                  onClick={() => onToggle?.(item.id)}
                >
                  <span className="bw-step-panel__box" aria-hidden>
                    {checked ? <Check size={13} /> : null}
                  </span>
                  <span>{item.label}</span>
                </button>
                {item.tip && !checked ? <small>{item.tip}</small> : null}
                {item.href && !checked ? (
                  <a
                    href={item.href}
                    {...(/^https?:/.test(item.href)
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.linkLabel ?? "En savoir plus"}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {finished ? <p className="bw-step-panel__done">Tout est prêt pour cette étape.</p> : null}
      {after}
      {links.length || onAsk ? (
        <div className="bw-step-panel__actions">
          {links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              className="bw-step-panel__link"
              onClick={(event) => {
                if (!link.external && onNavigate?.(link.href)) event.preventDefault();
              }}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {link.label}
              {link.external ? <ExternalLink size={12} aria-hidden /> : null}
            </a>
          ))}
          {onAsk ? (
            <button type="button" className="bw-step-panel__ask" onClick={onAsk}>
              <MessagesSquare size={15} aria-hidden /> {askLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
