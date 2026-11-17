import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Clock3, type LucideIcon } from "lucide-react";
import { RecapPreview, type PreviewRow } from "./RecapPreview";

/**
 * Entre deux chapitres : le fil du parcours revient, en court. Le chapitre fini se coche, le récap
 * gagne ses lignes, et on annonce la suite. Un bouton pour continuer ; la flèche ramène à la vue
 * d'ensemble.
 */
export function ChapterBreak({
  finished,
  chapters,
  rows,
  title,
  subtitle,
  minutes,
  onBack,
  onGo,
}: {
  /** L'index du chapitre qui vient de se terminer. */
  finished: number;
  chapters: { title: string; hint: string; headline: string; icon: LucideIcon }[];
  rows: PreviewRow[];
  title: string;
  subtitle: string;
  /** Durée annoncée du chapitre suivant. */
  minutes: number;
  onBack: () => void;
  onGo: () => void;
}) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Enter" && onGo();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", onKey);
    };
  }, [onGo]);
  const step = (i: number) => ({ "--i": i }) as CSSProperties;
  const next = chapters[finished + 1];
  return createPortal(
    <div
      className="bw-prepintro bw-chapbreak"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bw-chapbreak-title"
    >
      <div className="bw-prepintro__frame">
        <div className="bw-prepintro__top">
          <button
            type="button"
            onClick={onBack}
            className="bw-prepintro__back"
            aria-label="Revenir à Préparer mon voyage"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
          <span className="bw-prepintro__eyebrow">
            Chapitre {finished + 1} sur {chapters.length} terminé
          </span>
          <span className="size-10" aria-hidden />
        </div>

        <div className="bw-prepintro__body">
          <h1 id="bw-chapbreak-title" className="bw-prepintro__in" style={step(0)}>
            {next ? next.headline : "Tout est prêt"}
          </h1>
          <p className="bw-prepintro__lead bw-prepintro__in" style={step(1)}>
            {next ? next.hint : "Votre récap est complet : il ne reste qu'à le partager."}
          </p>

          {/* Le chapitre qui vient, en grand ; ceux faits et ceux d'après, sur une ligne. */}
          <ol className="bw-prepintro__steps">
            {chapters.map((chapter, index) => {
              const Icon = chapter.icon;
              const state = index <= finished ? "done" : index === finished + 1 ? "next" : "later";
              return (
                <li
                  key={chapter.title}
                  data-state={state}
                  className={`bw-prepintro__in${index === finished ? " is-fresh" : ""}`}
                  style={step(2 + index)}
                >
                  <span className="bw-prepintro__dot">
                    {state === "done" ? (
                      <Check size={18} strokeWidth={3} aria-hidden />
                    ) : (
                      <Icon size={18} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <small>
                      Chapitre {index + 1}
                      {state === "done" ? " · fait" : state === "next" ? " · à suivre" : ""}
                    </small>
                    <b>{chapter.title}</b>
                    {state === "next" ? <span>{chapter.hint}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            className="bw-prepintro__result bw-prepintro__preview bw-prepintro__in"
            style={step(5)}
          >
            <span>Votre récap se remplit</span>
            <RecapPreview
              title={title}
              subtitle={subtitle}
              rows={rows}
              filled={finished + 1}
              fresh={finished}
              share={!next}
            />
          </div>
        </div>

        <div className="bw-prepintro__foot bw-prepintro__in" style={step(6)}>
          {next ? (
            <p className="bw-prepintro__meta">
              <span>
                <Clock3 size={14} aria-hidden /> {minutes} min
              </span>
            </p>
          ) : null}
          <button type="button" onClick={onGo} className="bw-prepintro__go" autoFocus>
            {next ? "Continuer" : "Voir ma préparation"} <ArrowRight size={19} aria-hidden />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
