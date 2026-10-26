import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Selection } from "@/lib/ferry/types";
import { FlashFeed, useFlashCards } from "./FlashFeed";

const COLLAPSED_KEY = "bw-flash-collapsed";
/** Demande d'ouverture d'une fiche sur la page carte depuis le fil (en-tête mobile). */
export const FLASH_SELECT_EVENT = "bledway:flash-select";

/**
 * Ordinateur : fil Flash info flottant à droite de la carte, repliable (choix mémorisé).
 * N'apparaît que s'il y a au moins une info ; le volet de gauche reste dédié à la recherche.
 */
export function FlashMapPanel({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { cards, urgent } = useFlashCards();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* stockage facultatif */
    }
  }, []);
  if (!cards.length) return null;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* stockage facultatif */
    }
  };
  return (
    <aside className="bw-flash-panel" data-collapsed={collapsed} aria-label="Flash info">
      <button
        type="button"
        className="bw-flash-panel__head"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="bw-flash-panel-body"
      >
        <Zap size={16} aria-hidden />
        <strong>Flash info</strong>
        <span className="bw-flash-count" data-urgent={urgent}>
          {cards.length}
        </span>
        <ChevronDown size={16} aria-hidden className="bw-flash-panel__chevron" />
      </button>
      {!collapsed ? (
        <div id="bw-flash-panel-body" className="bw-flash-panel__body">
          <FlashFeed hideTitle limit={20} onSelect={onSelect} />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Mobile : bouton de l'en-tête avec pastille ; le fil s'ouvre en plein écran.
 * Présent sur toutes les pages : un clic sur une info ouvre la carte sur l'élément concerné.
 */
export function FlashHeaderButton() {
  const router = useRouter();
  const { cards, urgent } = useFlashCards();
  const [open, setOpen] = useState(false);
  if (!cards.length) return null;
  const select = (selection: Selection) => {
    setOpen(false);
    // Sur la carte : la page ouvre directement la fiche ; ailleurs, on rejoint la carte sur l'élément.
    if (window.location.pathname === "/")
      window.dispatchEvent(new CustomEvent(FLASH_SELECT_EVENT, { detail: selection }));
    else router.history.push(`/?select=${selection.type}&id=${encodeURIComponent(selection.id)}`);
  };
  return (
    <>
      <button
        type="button"
        className="bw-icon-button bw-flash-bell md:hidden"
        aria-label={`Flash info : ${cards.length} information${cards.length > 1 ? "s" : ""}`}
        onClick={() => setOpen(true)}
      >
        <Zap size={21} aria-hidden />
        <span className="bw-flash-count" data-urgent={urgent}>
          {cards.length}
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="bw-flash-sheet w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Zap size={18} aria-hidden /> Flash info
            </SheetTitle>
            <SheetDescription>
              Perturbations et actualités Europe ↔ Algérie, et ce que signalent les voyageurs.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <FlashFeed hideTitle limit={30} onSelect={select} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
