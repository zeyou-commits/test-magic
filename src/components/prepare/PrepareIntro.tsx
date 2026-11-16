import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
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
const outcomes = ["Papiers", "Dates", "Route", "Budget"];

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

          <div className="bw-prepintro__result bw-prepintro__in" style={step(5)}>
            <span>À la fin, vous avez</span>
            <ul>
              {outcomes.map((item) => (
                <li key={item}>
                  <Check size={13} aria-hidden /> {item}
                </li>
              ))}
            </ul>
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
