import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RecapPreview, type PreviewRow } from "./RecapPreview";
import { Scene, type SceneKey } from "./IntroScenes";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  PencilLine,
  Route as RouteIcon,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  text: string;
  chips: { label: string; icon?: LucideIcon }[];
  /** La scène animée de la diapo ; sans scène, la diapo montre le récap d'exemple. */
  scene?: SceneKey;
};

const slides: Slide[] = [
  {
    key: "bonjour",
    eyebrow: "Préparer mon voyage",
    title: "On fait connaissance ?",
    text: "Quelques questions, une à la fois, et BledWay prépare tout votre voyage au bled.",
    scene: "bonjour",
    chips: [
      { label: "5 min", icon: Clock3 },
      { label: "Modifiable", icon: PencilLine },
      { label: "Reste sur cet appareil", icon: Smartphone },
    ],
  },
  {
    key: "depart",
    eyebrow: "Chapitre 1 sur 3",
    title: "Vous et votre départ",
    text: "Quand vous partez, qui part, et avec quelle voiture.",
    scene: "depart",
    chips: [{ label: "Dates" }, { label: "Voyageurs" }, { label: "Véhicule" }],
  },
  {
    key: "papiers",
    eyebrow: "Chapitre 2 sur 3",
    title: "Vos papiers et votre voiture",
    text: "La liste de chacun, avec les dates à tenir pour être prêt à temps.",
    scene: "papiers",
    chips: [{ label: "Passeports" }, { label: "Visas" }, { label: "Voiture" }],
  },
  {
    key: "route",
    eyebrow: "Chapitre 3 sur 3",
    title: "Votre route et votre budget",
    text: "Les ports les plus adaptés, ce que coûte le voyage, puis le billet.",
    scene: "route",
    chips: [{ label: "Ports" }, { label: "Budget" }, { label: "Billet" }],
  },
  {
    key: "recap",
    eyebrow: "À la fin",
    title: "Votre récap, prêt à partager",
    text: "Tout le voyage sur une page : à envoyer à la famille ou à imprimer.",
    chips: [],
  },
];

// Un voyage d'exemple, annoncé comme tel : c'est la forme du récap, pas des chiffres promis.
const exampleRows: PreviewRow[] = [
  { icon: CalendarDays, label: "Départ", value: "12 juillet · 2 adultes, 1 enfant", chapter: 0 },
  { icon: FileText, label: "Papiers", value: "3 visas avant le 31 mai", chapter: 1 },
  { icon: RouteIcon, label: "Route", value: "Marseille → Alger", chapter: 2 },
  { icon: Wallet, label: "Budget", value: "estimé pour juillet", chapter: 2 },
];

/** Le temps d'une diapo quand elles défilent seules. */
const SLIDE_MS = 5200;

/**
 * Juste après « Commencer » : ce qui attend le voyageur, en diapos qui défilent de côté, comme
 * des stories. Elles avancent seules ; un geste les arrête et on les parcourt à son rythme.
 * « Passer » et la dernière diapo lancent le guide.
 */
export function PrepareIntro({ onBack, onGo }: { onBack: () => void; onGo: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const last = slides.length - 1;

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const go = (target: number, manual = true) => {
    const el = track.current;
    const next = Math.max(0, Math.min(last, target));
    if (manual) setAuto(false);
    setIndex(next);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  // Le doigt fait glisser la piste : la diapo visible devient la diapo courante.
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const seen = Math.round(el.scrollLeft / el.clientWidth);
    if (seen !== index) setIndex(seen);
  };
  const delay = (i: number) => ({ "--d": `${i * 70}ms` }) as CSSProperties;

  return createPortal(
    <div
      className="bw-prepintro bw-onb"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bw-prepintro-title"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
        else if (e.key === "Escape") onBack();
      }}
    >
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
          {/* Où l'on en est : un trait par diapo, qui se remplit pendant la lecture. */}
          <div className="bw-onb__bars" role="tablist" aria-label="Les diapos">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1} sur ${slides.length} : ${slide.title}`}
                data-state={i < index ? "done" : i === index ? "on" : undefined}
                data-auto={(auto && i === index) || undefined}
                onClick={() => go(i)}
              >
                <i
                  key={`${index}-${auto}`}
                  style={{ animationDuration: `${SLIDE_MS}ms` }}
                  onAnimationEnd={() => {
                    if (auto && i === index && index < last) go(index + 1, false);
                  }}
                />
              </button>
            ))}
          </div>
          {index < last ? (
            <button type="button" onClick={onGo} className="bw-onb__skip">
              Passer
            </button>
          ) : (
            <span className="bw-onb__skip" aria-hidden />
          )}
        </div>

        <div
          ref={track}
          className="bw-onb__track"
          onScroll={onScroll}
          onPointerDown={() => setAuto(false)}
          onTouchStart={() => setAuto(false)}
        >
          {slides.map((slide, i) => {
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <section
                key={slide.key}
                className="bw-onb__slide"
                data-on={i === index || undefined}
                aria-hidden={i !== index}
                aria-roledescription="diapo"
              >
                {slide.scene ? (
                  <Scene name={slide.scene} />
                ) : (
                  <div className="bw-onb__recap">
                    <RecapPreview
                      example
                      share
                      title="Le voyage de la famille"
                      subtitle="Pour Anne, Marc et Sami"
                      rows={exampleRows}
                      filled={i === index ? 3 : 0}
                      fresh={i === index ? "all" : null}
                    />
                  </div>
                )}
                <div className="bw-onb__txt">
                  <small style={delay(0)}>{slide.eyebrow}</small>
                  <Heading id={i === 0 ? "bw-prepintro-title" : undefined} style={delay(1)}>
                    {slide.title}
                  </Heading>
                  <p style={delay(2)}>{slide.text}</p>
                  {slide.chips.length ? (
                    <ul>
                      {slide.chips.map((chip, c) => {
                        const ChipIcon = chip.icon;
                        return (
                          <li key={chip.label} style={delay(3 + c)}>
                            {ChipIcon ? <ChipIcon size={13} aria-hidden /> : null}
                            {chip.label}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <div className="bw-prepintro__foot">
          {index < last ? (
            <button type="button" onClick={() => go(index + 1)} className="bw-prepintro__go">
              Suivant <ArrowRight size={19} aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={onGo} className="bw-prepintro__go bw-onb__start">
              C'est parti <ArrowRight size={19} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
