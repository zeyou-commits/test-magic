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
}: {
  next?: { label: string; onClick: () => void; disabled?: boolean; icon?: LucideIcon };
  /** `undefined` : retour à l'étape d'avant ; `null` : pas de retour. */
  back?: (() => void) | null | undefined;
}) {
  const ctx = useContext(WizardCtx);
  const onBack = back === undefined ? (ctx?.back ?? null) : back;
  // Dans l'étape : « Précédent » ; à son début : le nom de l'étape d'avant.
  const backText = back === undefined && ctx?.backLabel ? ctx.backLabel : "Précédent";
  const Icon = next?.icon;
  const bar = (
    <div className="flex items-center justify-between gap-3">
      {onBack ? (
        <button
          type="button"
          data-wiz-back
          onClick={onBack}
          aria-label={
            back === undefined && ctx?.backLabel
              ? `Revenir à l'étape ${ctx.backLabel}`
              : "Question précédente"
          }
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-secondary"
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
          className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50"
        >
          {Icon ? <Icon size={16} aria-hidden /> : null}
          <span className="truncate">{next.label}</span>
          {Icon ? null : <ArrowRight size={16} className="shrink-0" aria-hidden />}
        </button>
      ) : null}
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
  children,
}: {
  steps: WizardStepInfo[];
  current: number;
  chapter: string;
  onOpen: (index: number) => void;
  onClose: () => void;
  /** Ignorer l'étape : on passe à la suivante sans la marquer faite. */
  onSkip?: () => void;
  children: ReactNode;
}) {
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
        <header className="shrink-0 border-b bg-card/95 shadow-sm backdrop-blur">
          <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            {/* Sortir du guide : toujours en haut à gauche, jamais confondu avec « Précédent ». */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="-ml-2 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <ArrowLeft size={16} aria-hidden /> Préparer mon voyage
              </button>
              <p className="min-w-0 truncate text-right text-[11px] font-bold uppercase leading-tight tracking-wider text-primary">
                {chapter}
              </p>
            </div>
            {/* Le fil : où l'on en est, toujours sous les yeux (inutile avec une seule étape). */}
            {steps.length > 1 ? (
              <nav aria-label="Les étapes du voyage" className="mt-2">
                <ol
                  className="relative grid"
                  style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}
                >
                  <span
                    className="absolute left-[8%] right-[8%] top-4 h-0.5 bg-border"
                    aria-hidden
                  />
                  <span
                    className="absolute left-[8%] top-4 h-0.5 bg-primary transition-[width] duration-500"
                    style={{ width: `${(current / Math.max(1, steps.length - 1)) * 84}%` }}
                    aria-hidden
                  />
                  {steps.map((item, index) => {
                    const here = index === current;
                    const Icon = item.done && !here ? Check : item.icon;
                    return (
                      <li key={item.key} className="relative flex justify-center">
                        <button
                          type="button"
                          onClick={() => onOpen(index)}
                          aria-current={here ? "step" : undefined}
                          aria-label={`${item.title}${item.done ? " · fait" : ""}${item.recap && item.done ? " · récap disponible" : ""}`}
                          className="flex flex-col items-center gap-1"
                        >
                          <span
                            className={`relative grid size-8 place-items-center rounded-full border-2 transition-all ${
                              here
                                ? "scale-110 border-primary bg-primary text-primary-foreground ring-4 ring-primary/20"
                                : item.done
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            <Icon size={15} strokeWidth={item.done && !here ? 3 : 2} aria-hidden />
                            {item.recap && item.done && !here ? (
                              <span className="bw-recap-badge" aria-hidden>
                                <FileText size={9} strokeWidth={2.5} />
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`text-[10px] leading-none md:text-xs ${here ? "font-bold text-foreground" : "text-muted-foreground"}`}
                          >
                            {item.short}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            ) : null}
            <div
              className={`${steps.length > 1 ? "mt-3" : "mt-2"} flex items-end justify-between gap-3`}
            >
              <h2
                id="wiz-title"
                className="min-w-0 font-display text-lg font-bold leading-tight md:text-xl"
              >
                {step.title}
              </h2>
              <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
                {shown && shown.total > 1 ? (
                  <span>
                    {shown.index + 1} / {shown.total}
                  </span>
                ) : null}
                {onSkip ? (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="inline-flex min-h-8 items-center gap-0.5 rounded-full border px-2.5 hover:bg-secondary"
                  >
                    Passer l'étape <ArrowRight size={12} aria-hidden />
                  </button>
                ) : null}
              </span>
            </div>
            {shown && shown.total > 1 ? (
              <div className="mt-2 flex gap-1" aria-hidden>
                {Array.from({ length: shown.total }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= shown.index ? "bg-primary" : "bg-border"}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </header>
        <div
          ref={main}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div ref={content} className="mx-auto w-full max-w-2xl px-4 pb-8 pt-1">
            {children}
          </div>
        </div>
        <footer className="shrink-0 border-t bg-card/95 backdrop-blur">
          <div
            ref={setDock}
            className="mx-auto w-full max-w-2xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          />
        </footer>
      </div>
    </WizardCtx.Provider>
  );
}
