import type { ReactNode } from "react";
import { CircleHelp, MapPin, Megaphone, MessagesSquare } from "lucide-react";
import { scrollWithin } from "./LivePulse";

/** Fait défiler la fiche jusqu'à un bloc, une fois le panneau ouvert sur téléphone. */
export function revealBlock(selector: string, delay = 350) {
  if (window.matchMedia("(max-width: 767px)").matches)
    window.dispatchEvent(new Event("batogo:panel-full"));
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) scrollWithin(target);
  }, delay);
}

const ICONS = {
  salon: MessagesSquare,
  questions: CircleHelp,
  where: MapPin,
  report: Megaphone,
};

export type HubTile = {
  id: keyof typeof ICONS;
  label: string;
  hint?: string | undefined;
  count?: number | undefined;
  onClick: () => void;
};

/** Les mêmes grandes icônes partout : salon, questions, vous êtes où, signaler. */
export function ActionHub({ tiles, children }: { tiles: HubTile[]; children?: ReactNode }) {
  return (
    <nav className="bw-hub" data-tiles={tiles.length} aria-label="Échanger avec les voyageurs">
      {tiles.map((tile) => {
        const Icon = ICONS[tile.id];
        return (
          <button key={tile.id} type="button" data-tile={tile.id} onClick={tile.onClick}>
            <span className="bw-hub__icon">
              <Icon size={24} aria-hidden />
              {tile.count ? (
                <b aria-label={`${tile.count} en cours`}>{tile.count > 99 ? "99+" : tile.count}</b>
              ) : null}
            </span>
            <strong>{tile.label}</strong>
            {tile.hint ? <small>{tile.hint}</small> : null}
          </button>
        );
      })}
      {children}
    </nav>
  );
}
