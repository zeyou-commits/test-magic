import { useState, type ReactNode } from "react";
import { Check, ExternalLink, MessagesSquare, X } from "lucide-react";
import type { PrepItem } from "@/lib/ferry/preparation";
import type { StepLink, StepState } from "@/lib/ferry/journeySteps";
import { tr } from "@/lib/i18n";

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
  top,
  clampLead = false,
  itemAction,
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
  /** Juste sous le titre : « J'y suis » de « Mon voyage ». */
  top?: ReactNode;
  /** Texte replié sur 2 lignes, « Lire la suite » pour le déplier. */
  clampLead?: boolean;
  /** Une action propre à une case (« Ajouter mon billet »…). */
  itemAction?: (id: string) => ReactNode;
}) {
  const [leadOpen, setLeadOpen] = useState(false);
  const longLead = clampLead && lead.length > 110;
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
            aria-label={tr("ui.journeyStepPanel.fermerLeVolet")}
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </header>
      {top}
      {lead ? (
        <p className="bw-step-panel__lead">
          <span data-clamped={longLead && !leadOpen ? "" : undefined}>{lead}</span>
        </p>
      ) : null}
      {longLead ? (
        <button
          type="button"
          className="bw-step-panel__more-lead"
          aria-expanded={leadOpen}
          onClick={() => setLeadOpen((open) => !open)}
        >
          {leadOpen ? tr("ui.journeyStepPanel.reduire") : tr("ui.journeyStepPanel.lireLaSuite")}
        </button>
      ) : null}
      {before}
      {items.length ? (
        <ul className="bw-step-panel__items" aria-label={tr("ui.journeyStepPanel.aFaire")}>
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
                {itemAction?.(item.id)}
                {item.href && !checked ? (
                  <a
                    href={item.href}
                    {...(/^https?:/.test(item.href)
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.linkLabel ?? tr("ui.journeyStepPanel.enSavoirPlus")}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {finished ? <p className="bw-step-panel__done">{tr("ui.journeyStepPanel.toutEstPretPourCette")}</p> : null}
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
