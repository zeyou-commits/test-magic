// Visite guidée de l'accueil : la 504 chargée sert de compagnon, sans griser l'écran.
// L'appli reste visible et utilisable ; l'élément montré pulse en vert ; on avance avec le bouton
// ou en touchant l'élément ; la croix range la 504 en pastille à tout moment.
// S'ouvre seule une fois sur l'accueil ; se relance depuis la pastille ou le menu (« Revoir la visite guidée »).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { tr } from "@/lib/i18n";
import {
  layoutCompanion,
  resolveSteps,
  shouldAutoStart,
  START_TOUR_EVENT,
  TOUR_STORAGE_PREFIX,
  WELCOME_TOUR,
  WELCOME_TOUR_ID,
  type CompanionLayout,
  type TourStep,
  type TourTarget,
} from "@/lib/tour/steps";

const SEEN_KEY = TOUR_STORAGE_PREFIX + WELCOME_TOUR_ID;
const MINI_KEY = TOUR_STORAGE_PREFIX + "pastille";
const CAR_SRC = "/cabas/persos/voiture_504.webp";
/** Laisse la carte se dessiner avant que la 504 arrive. */
const AUTO_START_DELAY_MS = 2500;
const MAP_WAIT_MS = 15000;
const TOAST_MS = 5000;
const CAR_W = 66;
const CAR_H = 66;

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* navigation privée : sans gravité */
  }
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0;
}

const candidates = (target: TourTarget) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));

export function startProductTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

/** Le cabas à carreaux rouge et blanc, le vrai. */
const CABAS_SRC = "/cabas/cabas-carreaux.webp";
function CabasIcon() {
  return <img src={CABAS_SRC} alt="" width={20} height={20} className="bw-504__icon" />;
}
const ICONS: Record<TourStep["icon"], React.ReactNode> = {
  cabas: <CabasIcon />,
  ticket: <span aria-hidden>🎟️</span>,
  anchor: <span aria-hidden>⚓</span>,
};

type Resolved = { step: TourStep; element: HTMLElement }[];
type Phase = { kind: "off" } | { kind: "run"; steps: Resolved; index: number } | { kind: "park"; toast: boolean };

export function ProductTour() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [phase, setPhase] = useState<Phase>({ kind: "off" });
  const [layout, setLayout] = useState<CompanionLayout | null>(null);
  const [ring, setRing] = useState<DOMRect | null>(null);
  const [miniHidden, setMiniHidden] = useState(true);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => setMiniHidden(readKey(MINI_KEY) === "off" || readKey(SEEN_KEY) !== "done"), []);

  const park = useCallback((toast: boolean) => {
    writeKey(SEEN_KEY, "done");
    setMiniHidden(readKey(MINI_KEY) === "off");
    setPhase({ kind: "park", toast });
    setLayout(null);
    setRing(null);
  }, []);

  const start = useCallback(() => {
    const steps = resolveSteps(WELCOME_TOUR, candidates, isVisible);
    if (!steps.length) return;
    setLayout(null);
    setPhase({ kind: "run", steps, index: 0 });
  }, []);

  const next = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind !== "run") return;
    if (current.index >= current.steps.length - 1) park(true);
    else setPhase({ ...current, index: current.index + 1 });
  }, [park]);

  // Démarrage : relance depuis le menu, ou une fois tout seul sur l'accueil quand la carte est dessinée.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const onStart = () => start();
    window.addEventListener(START_TOUR_EVENT, onStart);
    if (readKey(SEEN_KEY) !== "done" && pathname === "/") {
      const started = Date.now();
      let mapSeenAt: number | null = null;
      const tryStart = () => {
        if (cancelled) return;
        const canvasAt = document.querySelector(".maplibregl-canvas") ? (mapSeenAt ??= Date.now()) : null;
        const mapReady = canvasAt !== null && Date.now() - canvasAt >= 1500;
        if (!mapReady && Date.now() - started < MAP_WAIT_MS) {
          timer = window.setTimeout(tryStart, 500);
          return;
        }
        const count = resolveSteps(WELCOME_TOUR, candidates, isVisible).length;
        if (phaseRef.current.kind === "off" && shouldAutoStart({ seen: readKey(SEEN_KEY) === "done", pathname: window.location.pathname, stepCount: count })) start();
      };
      timer = window.setTimeout(tryStart, AUTO_START_DELAY_MS);
    }
    return () => {
      cancelled = true;
      window.removeEventListener(START_TOUR_EVENT, onStart);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname, start]);

  // Changer de page pendant la visite (par exemple en touchant « Préparer ») : la 504 se range.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname && phaseRef.current.kind === "run") park(false);
    lastPath.current = pathname;
  }, [pathname, park]);

  // Le toast de fin disparaît tout seul.
  useEffect(() => {
    if (phase.kind !== "park" || !phase.toast) return;
    const id = window.setTimeout(() => setPhase({ kind: "park", toast: false }), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Pendant la visite : les fenêtres flottantes et les bulles « Exemple » se taisent ; Échap range la 504.
  const running = phase.kind === "run";
  useEffect(() => {
    if (!running) return;
    const root = document.documentElement;
    root.setAttribute("data-tour-active", "true");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") park(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.removeAttribute("data-tour-active");
      window.removeEventListener("keydown", onKey);
    };
  }, [running, park]);

  // Toucher l'élément montré fait avancer (l'appli fait aussi son travail : ouvrir, naviguer).
  const element = phase.kind === "run" ? phase.steps[phase.index]?.element : undefined;
  useEffect(() => {
    if (!element) return;
    const onClick = () => window.setTimeout(next, 0);
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [element, next]);

  // Placement de la 504 et de sa bulle ; suit la cible si l'écran bouge.
  useLayoutEffect(() => {
    if (!element) return;
    const place = () => {
      const rect = element.getBoundingClientRect();
      const bubble = bubbleRef.current;
      setRing(rect);
      setLayout(
        layoutCompanion(
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
          {
            car: CAR_W,
            carHeight: CAR_H,
            bubbleWidth: bubble?.offsetWidth ?? 240,
            bubbleHeight: bubble?.offsetHeight ?? 120,
            margin: 12,
          },
        ),
      );
    };
    place();
    const id = window.setInterval(place, 400);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", place);
    };
  }, [element]);

  useEffect(() => {
    if (running) nextRef.current?.focus({ preventScroll: true });
  }, [running, phase]);

  if (typeof document === "undefined") return null;

  if (phase.kind === "run") {
    const current = phase.steps[phase.index];
    if (!current) return null;
    return createPortal(
      <div className="bw-504" data-ready={layout ? "true" : "false"}>
        {ring ? (
          <div
            className="bw-504__ring"
            style={{ left: ring.left - 5, top: ring.top - 5, width: ring.width + 10, height: ring.height + 10 }}
            aria-hidden
          />
        ) : null}
        <img
          src={CAR_SRC}
          alt=""
          className="bw-504__car"
          data-facing={layout?.car.facingRight ? "right" : "left"}
          style={layout ? { left: layout.car.left, top: layout.car.top } : { left: window.innerWidth + 40, top: window.innerHeight - 150 }}
        />
        <div
          ref={bubbleRef}
          key={phase.index}
          role="dialog"
          aria-label={tr(current.step.title)}
          className="bw-504__bubble"
          data-tail={layout?.bubble.tailSide ?? "bottom"}
          style={
            layout
              ? ({ left: layout.bubble.left, top: layout.bubble.top, "--tail-x": `${layout.bubble.tailX}px` } as React.CSSProperties)
              : { left: -9999, top: 0 }
          }
        >
          <button type="button" className="bw-504__close" onClick={() => park(false)} aria-label={tr("tour.skip")}>
            <X size={15} aria-hidden />
          </button>
          <p className="bw-504__title">
            {ICONS[current.step.icon]}
            <span>{tr(current.step.title)}</span>
          </p>
          <p className="bw-504__body">{tr(current.step.body)}</p>
          <div className="bw-504__foot">
            <span className="bw-504__dots" aria-label={tr("tour.progress", { current: phase.index + 1, total: phase.steps.length })}>
              {phase.steps.map((_, i) => (
                <i key={i} data-on={i === phase.index ? "true" : "false"} />
              ))}
            </span>
            <button ref={nextRef} type="button" className="bw-504__next" onClick={next}>
              {tr(current.step.action)}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Rangée : une petite pastille sur l'accueil, pour la rappeler ; un mot de fin au premier rangement.
  if (pathname !== "/" || miniHidden) return null;
  return createPortal(
    <div className="bw-504-park">
      {phase.kind === "park" && phase.toast ? (
        <div className="bw-504__toast" role="status">
          <b>{tr("tour.bye.title")}</b>
          {tr("tour.bye.body")}
        </div>
      ) : null}
      <button type="button" className="bw-504__mini" onClick={start} aria-label={tr("tour.replay")}>
        <img src={CAR_SRC} alt="" />
      </button>
      <button
        type="button"
        className="bw-504__mini-off"
        onClick={() => {
          writeKey(MINI_KEY, "off");
          setMiniHidden(true);
        }}
        aria-label={tr("tour.hide")}
      >
        <X size={11} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}
