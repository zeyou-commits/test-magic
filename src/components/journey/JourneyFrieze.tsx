import { useRef } from "react";
import {
  Anchor,
  Car,
  Check,
  CircleAlert,
  FileText,
  Flag,
  Fuel,
  MapPinHouse,
  Route as RouteIcon,
  Ship,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CrossingScene } from "@/lib/ferry/crossingProgress";
import type { JourneyStepId, StepState } from "@/lib/ferry/journeySteps";
import { MiniFerry } from "@/components/panel/MiniFerry";

export const STEP_ICONS: Record<JourneyStepId, LucideIcon> = {
  papers: FileText,
  vehicle: Car,
  road: RouteIcon,
  port: Anchor,
  sea: Ship,
  arrival: Flag,
  last: Fuel,
  // Le bled à l'aller, la destination au retour : une épingle plutôt qu'une maison.
  home: MapPinHouse,
};

export type FriezeStep = {
  id: JourneyStepId;
  label: string;
  sub: string;
  state: StepState;
  /** Étape passée dont des actions restent à faire : un « ! » plutôt qu'une coche. */
  late?: boolean;
  /** Voyageurs BledWay qui ont déclaré être à cette étape (« J'y suis »). */
  count?: number;
  /** Étape « En mer » : le petit bateau, de 0 (à quai) à 1 (arrivé), et ce qu'il fait. */
  ferry?: { ratio: number; scene: CrossingScene | null };
};

/**
 * La frise d'ordinateur : repère fixe en haut de « Mon voyage » et du simulateur.
 * Survol = aperçu de l'étape ; clic = l'étape reste ouverte ; second clic = elle se libère.
 */
export function JourneyFrieze({
  steps,
  shownId,
  pinnedId,
  onHover,
  onPin,
  hereLabel = "Vous êtes ici",
}: {
  steps: FriezeStep[];
  shownId: JourneyStepId | null;
  pinnedId: JourneyStepId | null;
  onHover: (id: JourneyStepId | null) => void;
  onPin: (id: JourneyStepId) => void;
  hereLabel?: string;
}) {
  // Un léger délai à la sortie : on peut glisser de la frise au volet sans qu'il se ferme.
  const leave = useRef<number | undefined>(undefined);
  return (
    <ol
      className="bw-frieze"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        window.clearTimeout(leave.current);
        leave.current = window.setTimeout(() => onHover(null), 160);
      }}
      onPointerEnter={() => window.clearTimeout(leave.current)}
    >
      {steps.map((step, index) => {
        const Icon = step.late ? CircleAlert : step.state === "done" ? Check : STEP_ICONS[step.id];
        return (
          <li
            key={step.id}
            data-state={step.state}
            data-late={step.late || undefined}
            data-shown={shownId === step.id || undefined}
          >
            {index < steps.length - 1 ? (
              <span
                className="bw-frieze__bar"
                data-state={step.state}
                data-ferry={step.ferry ? "" : undefined}
                style={
                  step.ferry
                    ? ({ "--ferry": step.ferry.ratio } as React.CSSProperties)
                    : undefined
                }
                aria-hidden
              >
                {/* Le petit bateau navigue sur le trait de la traversée, vers l'étape suivante. */}
                {step.ferry ? (
                  <span className="bw-frieze__ferry">
                    <MiniFerry size={34} scene={step.ferry.scene} />
                  </span>
                ) : null}
              </span>
            ) : null}
            <button
              type="button"
              aria-pressed={pinnedId === step.id}
              aria-label={`${step.label} · ${step.sub}${step.state === "current" ? ` · ${hereLabel}` : ""}`}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") onHover(step.id);
              }}
              onFocus={() => onHover(step.id)}
              onClick={() => onPin(step.id)}
            >
              {step.state === "current" ? <b className="bw-frieze__here">{hereLabel}</b> : null}
              <span className="bw-frieze__dot">
                <Icon size={step.state === "current" ? 22 : 19} aria-hidden />
                {step.count ? (
                  <em
                    className="bw-frieze__count"
                    title={`${step.count} voyageur${step.count > 1 ? "s" : ""} BledWay à cette étape`}
                  >
                    <Users size={10} aria-hidden />
                    {step.count}
                  </em>
                ) : null}
              </span>
              <strong>{step.label}</strong>
              <small>{step.sub}</small>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
