import { useCallback, useEffect, useRef, useState } from "react";
import type { Selection } from "@/lib/ferry/types";

const HISTORY_KEY = "bwCompanion";
export function useCompanionPanel(
  selection: Selection | null,
  enabled: boolean,
  onSelect: (selection: Selection | null) => void,
  onWidth?: (width: number) => void,
) {
  const [wide, setWide] = useState(false);
  const [secondary, setSecondary] = useState<Selection | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const key = selection ? `${selection.type}:${selection.id}` : "";
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(
      () => opener.current?.isConnected && opener.current.focus({ preventScroll: true }),
    );
  }, []);
  useEffect(() => {
    setSecondary(null);
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[HISTORY_KEY]) {
      const next = { ...state };
      delete next[HISTORY_KEY];
      window.history.replaceState(next, "", window.location.href);
    }
  }, [key]);
  useEffect(() => {
    const back = () => {
      setSecondary(null);
      restoreFocus();
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [restoreFocus]);
  const shown = Boolean(wide && enabled && secondary);
  useEffect(() => {
    onWidth?.(shown ? 392 : 0);
    return () => onWidth?.(0);
  }, [shown, onWidth]);
  const close = useCallback(() => {
    setSecondary(null);
    restoreFocus();
    if (window.history.state?.[HISTORY_KEY]) window.history.back();
  }, [restoreFocus]);
  const open = (next: Selection | null) => {
    // Une fiche du même type que le volet principal le remplace (ligne en sens inverse…).
    if (wide && enabled && next && next.type !== selection?.type) {
      if (!secondary)
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const state = { ...window.history.state, [HISTORY_KEY]: true };
      if (secondary) window.history.replaceState(state, "", window.location.href);
      else window.history.pushState(state, "", window.location.href);
      setSecondary(next);
    } else {
      setSecondary(null);
      onSelect(next);
    }
  };
  return { secondary: shown ? secondary : null, open, close };
}
