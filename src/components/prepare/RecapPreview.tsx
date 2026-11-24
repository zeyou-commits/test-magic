import type { CSSProperties } from "react";
import { Check, FileText, Share2, type LucideIcon } from "lucide-react";
import { tr } from "@/lib/i18n";

export type PreviewRow = {
  icon: LucideIcon;
  label: string;
  /** null : pas encore rempli (une barre grise à la place). */
  value: string | null;
  /** Le chapitre (0, 1, 2) qui remplit cette ligne. */
  chapter: number;
  /** Dans le récap de fin : la ligne ouvre son étape. */
  onClick?: () => void;
};

/**
 * Le récap en miniature, tel qu'on le retrouve à la fin : bandeau vert, anneau de progression,
 * frise verticale. Les lignes des chapitres faits sont remplies ; celles du chapitre qui vient de se
 * terminer arrivent en animation ; les suivantes restent en gris. Sans animation si l'appareil le demande.
 */
export function RecapPreview({
  title,
  subtitle,
  rows,
  filled,
  fresh,
  example = false,
  share = false,
}: {
  title: string;
  subtitle: string;
  rows: PreviewRow[];
  /** Nombre de chapitres faits (0 à 3). */
  filled: number;
  /** Le chapitre dont les lignes s'animent (souvent filled - 1), « all » : tout se remplit. */
  fresh: number | "all" | null;
  example?: boolean;
  /** Le badge « PDF · lien à partager » se pose à la fin. */
  share?: boolean;
}) {
  // Une ligne n'est « faite » que si son chapitre est passé ET qu'elle contient quelque chose :
  // une route sans ports, un budget sans prix restent « à compléter », jamais cochés.
  const isFilled = (row: PreviewRow) => row.chapter < filled && row.value !== null;
  const done = rows.filter(isFilled).length;
  const isFresh = (row: PreviewRow) =>
    fresh === "all" ? row.chapter < filled : row.chapter === fresh;
  const before =
    fresh === "all" ? 0 : rows.filter((row) => row.chapter < (fresh ?? filled)).length;
  const ratio = (n: number) => (rows.length ? n / rows.length : 0);
  let order = 0;
  const lastDelay = rows.filter(isFresh).length;
  return (
    <figure
      className="bw-rprev"
      aria-label={`${example ? "Exemple de récap" : "Votre récap"} : ${done} sur ${rows.length} rubriques remplies`}
      style={
        {
          "--from": 1 - ratio(before),
          "--to": 1 - ratio(done),
          "--end": `${0.35 + lastDelay * 0.45}s`,
        } as CSSProperties
      }
    >
      <div className="bw-rprev__head">
        <span className="min-w-0">
          <small>
            <FileText size={11} aria-hidden /> {example ? tr("ui.recapPreview.exempleDeRecap") : tr("ui.recapPreview.votreRecap")}
          </small>
          <b>{title}</b>
          <span>{subtitle}</span>
        </span>
        <svg viewBox="0 0 36 36" className="bw-rprev__ring" aria-hidden>
          <circle cx="18" cy="18" r="15" pathLength="1" />
          <circle cx="18" cy="18" r="15" pathLength="1" className="bw-rprev__arc" />
        </svg>
      </div>
      <ol className="bw-rprev__rows">
        {rows.map((row) => {
          const isDone = isFilled(row);
          const missing = row.chapter < filled && row.value === null;
          const fresh = isFresh(row);
          const style = fresh ? ({ "--d": `${0.35 + order++ * 0.45}s` } as CSSProperties) : undefined;
          const Icon = row.icon;
          return (
            <li
              key={row.label}
              data-state={isDone ? "done" : missing ? "missing" : "todo"}
              className={fresh ? "is-fresh" : undefined}
              style={style}
            >
              <span className="bw-rprev__dot" aria-hidden>
                {isDone ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <Icon size={14} aria-hidden className="bw-rprev__icon" />
              <span className="bw-rprev__label">{row.label}</span>
              {isDone && row.value ? (
                <span className="bw-rprev__value">{row.value}</span>
              ) : missing ? (
                <span className="bw-rprev__missing">{tr("ui.recapPreview.aCompleter")}</span>
              ) : (
                <span className="bw-rprev__bar" aria-hidden />
              )}
              {row.onClick ? (
                <button
                  type="button"
                  className="bw-rprev__hit"
                  onClick={row.onClick}
                  aria-label={`Ouvrir : ${row.label}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {share ? (
        <span className="bw-rprev__share" aria-hidden>
          <Share2 size={12} />{tr("ui.recapPreview.pdfLienAPartager")}
        </span>
      ) : null}
    </figure>
  );
}
