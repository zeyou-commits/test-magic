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
import { tr } from "@/lib/i18n";

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
    get eyebrow() { return tr("ui.prepareIntro.preparerMonVoyage"); },
    get title() { return tr("ui.prepareIntro.onFaitConnaissance"); },
    get text() { return tr("ui.prepareIntro.quelquesQuestionsUneALa"); },
    scene: "bonjour",
    chips: [
      { get label() { return tr("ui.prepareIntro.t5Min"); }, icon: Clock3 },
      { get label() { return tr("ui.prepareIntro.modifiable"); }, icon: PencilLine },
      { get label() { return tr("ui.prepareIntro.resteSurCetAppareil"); }, icon: Smartphone },
    ],
  },
  {
    key: "depart",
    get eyebrow() { return tr("ui.prepareIntro.chapitre1Sur3"); },
    get title() { return tr("ui.prepareIntro.vousEtVotreDepart"); },
    get text() { return tr("ui.prepareIntro.quandVousPartezQuiPart"); },
    scene: "depart",
    chips: [{ get label() { return tr("ui.prepareIntro.dates"); } }, { get label() { return tr("ui.prepareIntro.voyageurs"); } }, { get label() { return tr("ui.prepareIntro.vehicule"); } }],
  },
  {
    key: "papiers",
    get eyebrow() { return tr("ui.prepareIntro.chapitre2Sur3"); },
    get title() { return tr("ui.prepareIntro.vosPapiersEtVotreVoiture"); },
    get text() { return tr("ui.prepareIntro.laListeDeChacunAvec"); },
    scene: "papiers",
    chips: [{ get label() { return tr("ui.prepareIntro.passeports"); } }, { get label() { return tr("ui.prepareIntro.visas"); } }, { get label() { return tr("ui.prepareIntro.voiture"); } }],
  },
  {
    key: "route",
    get eyebrow() { return tr("ui.prepareIntro.chapitre3Sur3"); },
    get title() { return tr("ui.prepareIntro.votreRouteEtVotreBudget"); },
    get text() { return tr("ui.prepareIntro.lesPortsLesPlusAdaptes"); },
    scene: "route",
    chips: [{ get label() { return tr("ui.prepareIntro.ports"); } }, { get label() { return tr("ui.prepareIntro.budget"); } }, { get label() { return tr("ui.prepareIntro.billet"); } }],
  },
  {
    key: "recap",
    get eyebrow() { return tr("ui.prepareIntro.aLaFin"); },
    get title() { return tr("ui.prepareIntro.votreRecapPretAPartager"); },
    get text() { return tr("ui.prepareIntro.toutLeVoyageSurUne"); },
    chips: [],
  },
];

// Un voyage d'exemple, annoncé comme tel : c'est la forme du récap, pas des chiffres promis.
const exampleRows: PreviewRow[] = [
  { icon: CalendarDays, get label() { return tr("ui.prepareIntro.depart"); }, value: "12 juillet · 2 adultes, 1 enfant", chapter: 0 },
  { icon: FileText, get label() { return tr("ui.prepareIntro.papiers"); }, value: "3 visas avant le 31 mai", chapter: 1 },
  { icon: RouteIcon, get label() { return tr("ui.prepareIntro.route"); }, value: "Marseille → Alger", chapter: 2 },
  { icon: Wallet, get label() { return tr("ui.prepareIntro.budget"); }, value: "estimé pour juillet", chapter: 2 },
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
            aria-label={tr("ui.prepareIntro.revenirALAccueil")}
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
          {/* Où l'on en est : un trait par diapo, qui se remplit pendant la lecture. */}
          <div className="bw-onb__bars" role="tablist" aria-label={tr("ui.prepareIntro.lesDiapos")}>
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
              {tr("ui.prepareIntro.passer")}
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
                      title={tr("ui.prepareIntro.leVoyageDeLaFamille")}
                      subtitle={tr("ui.prepareIntro.pourAnneMarcEtSami")}
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
              {tr("ui.prepareIntro.suivant")}<ArrowRight size={19} aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={onGo} className="bw-prepintro__go bw-onb__start">
              {tr("ui.prepareIntro.cEstParti")}<ArrowRight size={19} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
