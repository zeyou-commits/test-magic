import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Megaphone, MessagesSquare } from "lucide-react";
import { CabasImg } from "@/components/CabasImg";
import { mergeTripSteps, tripStepsQuery, type TripStatus } from "@/lib/ferry/presence";
import { scrollWithin } from "./LivePulse";
import { tr } from "@/lib/i18n";

/** Fait défiler la fiche jusqu'à un bloc, une fois le panneau ouvert sur téléphone. */
export function revealBlock(selector: string, delay = 350) {
  if (window.matchMedia("(max-width: 767px)").matches)
    window.dispatchEvent(new Event("batogo:panel-full"));
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) scrollWithin(target);
  }, delay);
}

const ICONS = { salon: MessagesSquare, questions: CircleHelp, report: Megaphone };

export type HubTile = {
  id: keyof typeof ICONS | "where";
  label: string;
  count?: number | undefined;
  /** Tuile « Vous êtes où ? » : l'étape déclarée fixe l'icône, sinon les états défilent. */
  status?: TripStatus | null | undefined;
  onClick: () => void;
};

const STEP_MS = 1800;

/** Sur la route, au port, à bord… : le cabas de chaque état, à tour de rôle. */
function WhereIcon({ status }: { status?: TripStatus | null | undefined }) {
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (status || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), STEP_MS);
    return () => window.clearInterval(timer);
  }, [status]);
  const step = steps.find((item) => item.id === status) ?? steps[index % steps.length]!;
  return (
    <>
      <span className="bw-hub__icon" data-where>
        <CabasImg key={step.id} src={step.image} alt="" width={40} height={40} />
      </span>
      <strong>{tr("ui.actionHub.vousEtesOu")}</strong>
      <small key={`${step.id}-label`}>{step.short}</small>
    </>
  );
}

/** Les mêmes icônes partout : salon, questions, vous êtes où, signaler. */
export function ActionHub({ tiles, children }: { tiles: HubTile[]; children?: ReactNode }) {
  return (
    <nav className="bw-hub" data-tiles={tiles.length} aria-label={tr("ui.actionHub.echangerAvecLesVoyageurs")}>
      {tiles.map((tile) => {
        if (tile.id === "where")
          return (
            <button key={tile.id} type="button" data-tile={tile.id} onClick={tile.onClick}>
              <WhereIcon status={tile.status} />
            </button>
          );
        const Icon = ICONS[tile.id];
        return (
          <button key={tile.id} type="button" data-tile={tile.id} onClick={tile.onClick}>
            <span className="bw-hub__icon">
              <Icon size={30} aria-hidden />
              {tile.count ? (
                <b aria-label={`${tile.count} en cours`}>{tile.count > 99 ? "99+" : tile.count}</b>
              ) : null}
            </span>
            <strong>{tile.label}</strong>
          </button>
        );
      })}
      {children}
    </nav>
  );
}
