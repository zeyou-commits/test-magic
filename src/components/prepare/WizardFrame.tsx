import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, FileText, type LucideIcon } from "lucide-react";
import { tr } from "@/lib/i18n";

/**
 * Le guide plein écran de « Préparer mon voyage » : le fil des étapes reste en haut, les boutons
 * restent en bas, et chaque question glisse de gauche à droite (au doigt aussi).
 */

export type WizardScreen = { index: number; total: number; label?: string | undefined };

type Ctx = {
  dock: HTMLElement | null;
  back: (() => void) | null;
  /** Le nom court de l'étape d'avant : le bouton dit où il mène (« ← Départ »). */
  backLabel: string | null;
  report: (screen: WizardScreen) => void;
};
const WizardCtx = createContext<Ctx | null>(null);

/** Vrai dans le guide plein écran : les écrans y cachent leur propre en-tête de progression. */
export const useInWizard = () => useContext(WizardCtx) !== null;

/** Une étape annonce sa question en cours : « question 2 sur 4 · Qui part ». */
export function useWizardScreen(index: number, total: number, label?: string, active = true) {
  const ctx = useContext(WizardCtx);
  const report = ctx?.report;
  useEffect(() => {
    if (active) report?.({ index, total, label });
  }, [report, index, total, label, active]);
}

/** Les boutons de l'écran : dans la barre du bas du guide, toujours visibles (sinon à leur place). */
export function WizardNav({
  next,
  back,
  skip,
}: {
  next?: { label: string; onClick: () => void; disabled?: boolean; icon?: LucideIcon };
  /** `undefined` : retour à l'étape d'avant ; `null` : pas de retour. */
  back?: (() => void) | null | undefined;
  /** Passer l'étape : un lien discret, jamais le bouton principal. */
  skip?: { label: string; onClick: () => void } | undefined;
}) {
  const ctx = useContext(WizardCtx);
  const onBack = back === undefined ? (ctx?.back ?? null) : back;
  // Dans l'étape : « Précédent » ; à son début : le nom de l'étape d'avant.
  const backText = back === undefined && ctx?.backLabel ? ctx.backLabel : "Précédent";
  const Icon = next?.icon;
  const bar = (
    <div>
    {skip ? (
      <div className="-mt-1 mb-1.5 flex justify-end">
        <button type="button" onClick={skip.onClick} className="bw-wiz-skip">
          {skip.label}
        </button>
      </div>
    ) : null}
    <div className="flex items-center justify-between gap-3">
      {onBack ? (
        <button
          type="button"
          data-wiz-back
          onClick={onBack}
          aria-label={
            back === undefined && ctx?.backLabel
              ? `Revenir à l'étape ${ctx.backLabel}`
              : tr("ui.wizardFrame.questionPrecedente")
          }
          className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold hover:bg-secondary sm:px-3"
        >
          <ArrowLeft size={16} aria-hidden /> {backText}
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          type="button"
          data-wiz-next
          onClick={next.onClick}
          disabled={next.disabled}
          className="inline-flex min-h-12 min-w-0 max-w-[68%] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold leading-tight text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 sm:max-w-none sm:px-5"
        >
          {Icon ? <Icon size={16} aria-hidden /> : null}
          <span className="text-balance text-center">{next.label}</span>
          {Icon ? null : <ArrowRight size={16} className="shrink-0" aria-hidden />}
        </button>
      ) : null}
    </div>
    </div>
  );
  if (!ctx) return <div className="mt-8">{bar}</div>;
  return ctx.dock ? createPortal(bar, ctx.dock) : null;
}

export type WizardStepInfo = {
  key: string;
  short: string;
  title: string;
  icon: LucideIcon;
  done: boolean;
  /** Étape faite qui a un récap à revoir : petit badge « document » sur son rond. */
  recap?: boolean;
};

/** Un ascendant qui défile de côté : le geste lui appartient, pas au guide. */
function scrollsSideways(from: Element | null, stop: Element) {
  for (let el = from; el && el !== stop; el = el.parentElement) {
    if (el.matches("input, textarea, select, [data-no-swipe]")) return true;
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 2) return true;
  }
  return false;
}

export function WizardFrame({
  steps,
  current,
  chapter,
  onOpen,
  onClose,
  onSkip,
  aside,
  children,
}: {
  steps: WizardStepInfo[];
  current: number;
  chapter: string;
  onOpen: (index: number) => void;
  onClose: () => void;
  /** Ignorer l'étape : on passe à la suivante sans la marquer faite. */
  onSkip?: () => void;
  /** Sur grand écran (≥ 1024 px) : une colonne à droite des questions (le récap qui se remplit). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  // Avec une colonne de côté, en-tête, questions et boutons s'alignent sur la même grille.
  const wrap = aside ? "bw-wiz-wrap bw-wiz-wrap--aside" : "bw-wiz-wrap";
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const [screen, setScreen] = useState<(WizardScreen & { step: string }) | null>(null);
  const step = steps[current]!;
  const report = useCallback((s: WizardScreen) => setScreen({ ...s, step: step.key }), [step.key]);
  const shown = screen?.step === step.key ? screen : null;
  const back = current > 0 ? () => onOpen(current - 1) : null;
  const backLabel = current > 0 ? steps[current - 1]!.short : null;

  // La page derrière ne défile plus : seul l'écran de la question bouge.
  useEffect(() => {
    // Le glisser de côté sert au guide, pas au « page précédente » du navigateur.
    const root = document.documentElement;
    const before = [document.body.style.overflow, root.style.overscrollBehaviorX];
    document.body.style.overflow = "hidden";
    root.style.overscrollBehaviorX = "none";
    return () => {
      document.body.style.overflow = before[0]!;
      root.style.overscrollBehaviorX = before[1]!;
    };
  }, []);

  // Clavier ouvert sur Android : Chrome ne réduit plus la page, la barre du bas passerait
  // dessous. Le guide prend alors la hauteur vraiment visible : les boutons restent au-dessus.
  const [visible, setVisible] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setVisible(
        vv.height < window.innerHeight - 60 ? { height: vv.height, top: vv.offsetTop } : null,
      );
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Chaque nouvel écran arrive de côté, dans le sens de la marche, et repart du haut.
  const main = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const order = current * 100 + (shown?.index ?? 0);
  const last = useRef(order);
  useEffect(() => {
    if (order === last.current) return;
    const forward = order > last.current;
    last.current = order;
    main.current?.scrollTo({ top: 0 });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    content.current?.animate(
      [
        { transform: `translateX(${forward ? 48 : -48}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [order]);

  // Glisser vers la gauche : écran suivant ; vers la droite : retour.
  const touch = useRef<{ x: number; y: number; skip: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]!;
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      skip: scrollsSideways(e.target as Element, e.currentTarget),
    };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || start.skip || !dock) return;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const target = dock.querySelector<HTMLButtonElement>(
      dx < 0 ? "[data-wiz-next]:not(:disabled)" : "[data-wiz-back]",
    );
    target?.click();
  };

  return (
    <WizardCtx.Provider value={{ dock, back, backLabel, report }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiz-title"
        className="fixed inset-0 z-[80] flex flex-col bg-background"
        style={
          visible
            ? { height: `${visible.height}px`, top: `${visible.top}px`, bottom: "auto" }
            : { height: "100dvh" }
        }
      >
        {/* En-tête compact : une ligne (sortir · fil des étapes · passer), le titre, puis un filet
            de progression. Le chapitre reste dit aux lecteurs d'écran. */}
        <header className="shrink-0 border-b bg-card/95 shadow-sm backdrop-blur">
          <div className={`${wrap} px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-4`}>
            <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                aria-label={tr("ui.wizardFrame.quitterLeGuidePreparerMon")}
                title={tr("ui.wizardFrame.preparerMonVoyage")}
                className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-secondary"
              >
                <ArrowLeft size={18} aria-hidden />
              </button>
              {steps.length > 1 ? (
                <nav aria-label={tr("ui.wizardFrame.lesEtapesDuVoyage")} className="min-w-0 flex-1">
                  <ol className="bw-wizsteps">
                    {steps.map((item, index) => {
                      const here = index === current;
                      const Icon = item.done && !here ? Check : item.icon;
                      return (
                        <li
                          key={item.key}
                          data-state={here ? "here" : item.done ? "done" : "todo"}
                          data-reached={index <= current || undefined}
                        >
                          <button
                            type="button"
                            onClick={() => onOpen(index)}
                            aria-current={here ? "step" : undefined}
                            aria-label={`${item.title}${item.done ? " · fait" : ""}${item.recap && item.done ? " · récap disponible" : ""}`}
                            title={item.short}
                          >
                            <span className="bw-wizsteps__dot">
                              <Icon size={13} strokeWidth={item.done && !here ? 3 : 2} aria-hidden />
                              {item.recap && item.done && !here ? (
                                <span className="bw-recap-badge" aria-hidden>
                                  <FileText size={8} strokeWidth={2.5} />
                                </span>
                              ) : null}
                            </span>
                            {here ? <span className="bw-wizsteps__label">{item.short}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              ) : (
                <span className="flex-1" />
              )}
              {onSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-full border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                >
                  {tr("ui.wizardFrame.passer")}<ArrowRight size={12} aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 pl-1">
              <h2
                id="wiz-title"
                className="min-w-0 truncate font-display text-base font-bold leading-tight md:text-lg"
              >
                {step.title}
                <span className="sr-only"> · {chapter}</span>
              </h2>
              {shown && shown.total > 1 ? (
                <span className="sr-only">
                  {tr("ui.wizardFrame.ecran")}{shown.index + 1}{tr("ui.wizardFrame.sur")}{shown.total}
                </span>
              ) : null}
            </div>
            </div>
          </div>
          {shown && shown.total > 1 ? (
            <div className="h-[3px] bg-border" aria-hidden>
              <span
                className="block h-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(((shown.index + 1) / shown.total) * 100)}%` }}
              />
            </div>
          ) : null}
        </header>
        <div
          ref={main}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div className={`${wrap} px-4 pb-8 pt-1`}>
            <div ref={content} className="min-w-0">
              {children}
            </div>
            {aside ? <aside className="bw-wiz-aside">{aside}</aside> : null}
          </div>
        </div>
        <footer className="shrink-0 border-t bg-card/95 backdrop-blur">
          <div className={`${wrap} px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
            <div ref={setDock} className="min-w-0" />
          </div>
        </footer>
      </div>
    </WizardCtx.Provider>
  );
}
