import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RecapPreview, type PreviewRow } from "./RecapPreview";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Wallet,
  FileText,
  PencilLine,
  Route as RouteIcon,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";

const chapters: { title: string; hint: string; icon: LucideIcon }[] = [
  { title: "Vous et votre départ", hint: "Quand, qui part, quelle voiture", icon: Users },
  {
    title: "Vos papiers et votre voiture",
    hint: "La liste de chacun, avec les dates",
    icon: FileText,
  },
  {
    title: "Votre route et votre budget",
    hint: "Les bons ports, le coût, le billet",
    icon: RouteIcon,
  },
];
// Un voyage d'exemple, annoncé comme tel : c'est la forme du récap, pas des chiffres promis.
const exampleRows: PreviewRow[] = [
  { icon: CalendarDays, label: "Départ", value: "12 juillet · 2 adultes, 1 enfant", chapter: 0 },
  { icon: FileText, label: "Papiers", value: "3 visas avant le 31 mai", chapter: 1 },
  { icon: RouteIcon, label: "Route", value: "Marseille → Alger", chapter: 2 },
  { icon: Wallet, label: "Budget", value: "estimé pour juillet", chapter: 2 },
];

/**
 * Juste après « Commencer » : pourquoi BledWay pose des questions et ce qui attend le voyageur.
 * Un écran plein, comme le guide qui suit : rien ne défile, le bouton est toujours sous le pouce.
 */
export function PrepareIntro({ onBack, onGo }: { onBack: () => void; onGo: () => void }) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
  const step = (i: number) => ({ "--i": i }) as CSSProperties;
  // Rattaché à <body> : un parent animé (transform) ne doit pas l'enfermer dans la page.
  return createPortal(
    <div
      className="bw-prepintro"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bw-prepintro-title"
    >
      {/* Téléphone : plein écran en colonne. PC : une carte centrée en deux colonnes. */}
      <div className="bw-prepintro__frame">
        <div className="bw-prepintro__top">
          <button
            type="button"
            onClick={onBack}
            className="bw-prepintro__back"
            aria-label="Revenir à l'accueil"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
          <span className="bw-prepintro__eyebrow">Avant de commencer</span>
          <span className="size-10" aria-hidden />
        </div>

        <div className="bw-prepintro__body">
          <h1 id="bw-prepintro-title" className="bw-prepintro__in" style={step(0)}>
            On fait connaissance&nbsp;?
          </h1>
          <p className="bw-prepintro__lead bw-prepintro__in" style={step(1)}>
            Pour vous aider vraiment, BledWay a besoin d'en savoir un peu plus sur vous et votre
            voyage. Une question à la fois.
          </p>

          <ol className="bw-prepintro__steps">
            {chapters.map((chapter, index) => {
              const Icon = chapter.icon;
              return (
                <li key={chapter.title} className="bw-prepintro__in" style={step(2 + index)}>
                  <span className="bw-prepintro__dot">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <small>Chapitre {index + 1}</small>
                    <b>{chapter.title}</b>
                    <span>{chapter.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="bw-prepintro__result bw-prepintro__preview bw-prepintro__in" style={step(5)}>
            <span>À la fin, votre récap à partager</span>
            <RecapPreview
              example
              share
              title="Le voyage de la famille"
              subtitle="Pour Anne, Marc et Sami"
              rows={exampleRows}
              filled={3}
              fresh="all"
            />
          </div>
        </div>

        <div className="bw-prepintro__foot bw-prepintro__in" style={step(6)}>
          <p className="bw-prepintro__meta">
            <span>
              <Clock3 size={14} aria-hidden /> 5 min
            </span>
            <span>
              <PencilLine size={14} aria-hidden /> Modifiable
            </span>
            <span>
              <Smartphone size={14} aria-hidden /> Reste sur cet appareil
            </span>
          </p>
          <button type="button" onClick={onGo} className="bw-prepintro__go">
            C'est parti <ArrowRight size={19} aria-hidden />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
