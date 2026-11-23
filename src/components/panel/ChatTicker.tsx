import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { enterRoom } from "@/lib/ferry/chat";
import {
  emptyTicker,
  enqueueTicker,
  GENERAL_ROOM,
  GENERAL_TITLE,
  OPEN_GENERAL_ROOM_EVENT,
  openGeneralRoom,
  readOverlayOn,
  saveOverlayOn,
  stepTicker,
  takeGeneralFocus,
  TICKER_MAX,
  TICKER_STEP_MS,
  tickerQuery,
  type TickerLine,
} from "@/lib/ferry/generalRoom";
import type { Selection } from "@/lib/ferry/types";
import { ChatText } from "./ChatText";
import { LiveRoom } from "./LiveRoom";
import { AuthorAvatar } from "./StaffChat";

/** Le salon général, ouvert depuis la liste des salons, le fil de la carte ou un lien partagé. */
export function GeneralRoomHost() {
  // Monté à la première ouverture seulement : pas de fil ni de canal tant qu'on n'y va pas.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => {
      setMounted(true);
      setOpen(true);
    };
    if (takeGeneralFocus()) show();
    window.addEventListener(OPEN_GENERAL_ROOM_EVENT, show);
    return () => window.removeEventListener(OPEN_GENERAL_ROOM_EVENT, show);
  }, []);
  if (!mounted) return null;
  return (
    <LiveRoom
      solo
      open={open}
      onOpenChange={setOpen}
      kind="general"
      room={GENERAL_ROOM}
      title={GENERAL_TITLE}
    />
  );
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function OverlaySwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Chat sur la carte"
      className="bw-ticker__switch"
      onClick={onToggle}
    >
      <span className="bw-ticker__track" aria-hidden>
        <span />
      </span>
      {on ? "Activé" : "Chat désactivé"}
    </button>
  );
}

/**
 * Téléphone : le fil flotte juste au-dessus du bord du volet (comme « Signaler ») et se cache
 * quand le volet monte haut.
 */
function useAboveSheet(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const isMobile = useIsMobile();
  useEffect(() => {
    const el = ref.current;
    if (!isMobile || !el || !active) return;
    const panel = document.querySelector<HTMLElement>(".bw-map-panel");
    const stage = document.querySelector<HTMLElement>(".bw-map-stage");
    const place = () => {
      const full = stage?.dataset["panelFull"] === "true";
      const top = panel ? panel.getBoundingClientRect().top : window.innerHeight - 56;
      el.toggleAttribute("data-hidden", full || top < window.innerHeight * 0.45);
      el.style.setProperty("--ticker-bottom", `${Math.round(window.innerHeight - top + 12)}px`);
    };
    place();
    const resize = new ResizeObserver(place);
    if (panel) resize.observe(panel);
    const attributes = new MutationObserver(place);
    if (stage) attributes.observe(stage, { attributes: true, attributeFilter: ["data-panel-full"] });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      resize.disconnect();
      attributes.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [isMobile, ref, active]);
}

/**
 * Comme dans les jeux en ligne : les derniers messages des salons défilent sur la carte en direct.
 * Un message toutes les 3 s, chacun reste 6 s, 3 au plus. Vrais messages seulement, jamais
 * d'exemple. L'interrupteur coupe ou rétablit le fil, et le choix reste sur l'appareil.
 */
export function ChatTicker({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const lines = useQuery(tickerQuery).data;
  const reduce = useReducedMotion();
  // Lu après le premier rendu : le serveur ne connaît pas le choix de l'appareil.
  const [on, setOn] = useState(true);
  useEffect(() => setOn(readOverlayOn()), []);
  const [state, setState] = useState(emptyTicker);
  const first = useRef(true);
  const box = useRef<HTMLElement>(null);
  useAboveSheet(box, Boolean(lines));
  useEffect(() => {
    if (!lines) return;
    setState((current) => enqueueTicker(current, lines, first.current));
    first.current = false;
  }, [lines]);
  useEffect(() => {
    if (!on) return;
    const max = reduce ? 1 : TICKER_MAX;
    const tick = () => setState((current) => stepTicker(current, Date.now(), max));
    tick();
    const timer = window.setInterval(tick, TICKER_STEP_MS);
    return () => window.clearInterval(timer);
  }, [on, reduce]);
  // Module pas encore activé en base : rien sur la carte.
  if (lines === null || lines === undefined) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    saveOverlayOn(next);
    // Rétabli : on repart des derniers messages, pas de tout ce qui s'est dit entre-temps.
    setState((current) => ({ ...current, queue: next ? current.queue.slice(-TICKER_MAX) : [], shown: [] }));
  };
  const openLine = (line: TickerLine) => {
    if (line.kind === "general") {
      openGeneralRoom();
      return;
    }
    onSelect({ type: "departure", id: line.room });
    enterRoom("crossing", line.room);
  };
  if (!on)
    return (
      <section ref={box} className="bw-ticker" data-off aria-label="Messages des salons">
        <div className="bw-ticker__head">
          <OverlaySwitch on={false} onToggle={toggle} />
        </div>
      </section>
    );
  return (
    <section ref={box} className="bw-ticker" aria-label="Messages des salons">
      <ol className="bw-ticker__lines" data-reduce={reduce || undefined}>
        {state.shown.map(({ line }) => (
          <li key={line.id}>
            <button
              type="button"
              className="bw-ticker__line"
              onClick={() => openLine(line)}
              aria-label={`${line.author.pseudo}, ${line.label} : ouvrir le salon`}
            >
              <AuthorAvatar author={line.author} size={28} />
              <span className="bw-ticker__text">
                <b>{line.author.pseudo}</b> <small>{line.label}</small>
                <span>
                  <ChatText body={line.body} size={18} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {/* En bas et fixes : les pastilles ne bougent pas quand les messages s'effacent. */}
      <div className="bw-ticker__head">
        <button type="button" className="bw-ticker__general" onClick={openGeneralRoom}>
          <i aria-hidden />
          {GENERAL_TITLE}
          <ChevronRight size={13} aria-hidden />
        </button>
        <OverlaySwitch on onToggle={toggle} />
      </div>
    </section>
  );
}
