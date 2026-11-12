import { useState } from "react";
import { filmTimes, stageAt, type JourneyFilm } from "@/lib/ferry/journeyFilm";
import {
  JOURNEY_STEPS,
  durationLabel,
  stepGuide,
  stepLabel,
  type JourneyStepId,
} from "@/lib/ferry/journeySteps";
import { tripDirection } from "@/lib/ferry/preparation";
import { portTimeZone } from "@/lib/ferry/time";
import type { Port } from "@/lib/ferry/types";
import { JourneyStoryNav } from "./JourneyStoryNav";
import type { FriezeStep } from "./JourneyFrieze";
import { tr } from "@/lib/i18n";

/** Les étapes du film du simulateur, dans l'ordre de la frise. */
const FILM_STEPS: Partial<
  Record<JourneyStepId, "road" | "port" | "sea" | "disembark" | "last" | "done">
> = {
  road: "road",
  port: "port",
  sea: "sea",
  arrival: "disembark",
  last: "last",
  home: "done",
};

/**
 * La route du bled dans le simulateur : les 8 étapes, synchronisées avec le film du trajet.
 * Simulation seulement : rien n'est enregistré, les durées sont estimées.
 */
export function SimulationJourney({
  film,
  minute,
  onSeek,
  from,
  to,
  vehicle,
  followHref,
}: {
  film: JourneyFilm;
  minute: number;
  onSeek: (minute: number) => void;
  from: Port;
  to: Port;
  vehicle: boolean;
  /** Choisir une vraie traversée sur cette ligne, pour en faire « Mon voyage ». */
  followHref: string;
}) {
  const [prep, setPrep] = useState<JourneyStepId | null>(null);
  const times = filmTimes(film);
  const starts: Record<string, number> = {
    road: 0,
    port: times.port,
    sea: times.sea,
    disembark: times.disembark,
    last: times.last,
    done: times.total,
  };
  const stage = stageAt(film, minute);
  const filmIndex = JOURNEY_STEPS.findIndex((step) => FILM_STEPS[step] === stage);
  const index = prep ? JOURNEY_STEPS.indexOf(prep) : filmIndex;
  const direction = tripDirection(from);
  const subOf: Record<JourneyStepId, string> = {
    papers: "avant de partir",
    vehicle: "la semaine d'avant",
    road: `≈ ${durationLabel(film.roadMin)}`,
    port: `≈ ${durationLabel(film.boardMin)}`,
    sea: `≈ ${durationLabel(film.ferryMin)}`,
    arrival: `≈ ${durationLabel(film.disembarkMin)}`,
    last: `≈ ${durationLabel(film.lastMin)}`,
    home: "arrivée",
  };
  const steps: FriezeStep[] = JOURNEY_STEPS.map((step, i) => ({
    id: step,
    label: stepLabel(step, direction, "simulation"),
    sub: subOf[step],
    state: i < index ? "done" : i === index ? "current" : "todo",
  }));
  const shown = JOURNEY_STEPS[index] ?? "road";
  const guide = stepGuide({
    step: shown,
    direction,
    audience: "simulation",
    from: from.name,
    to: to.name,
    timeZone: portTimeZone(from),
    arrivalTimeZone: portTimeZone(to),
    vehicle,
    roadMin: film.roadMin,
    lastMin: film.lastMin,
  });
  return (
    <section className="bw-sim-journey" aria-label={tr("ui.simulationJourney.votreRouteDuBledEn")}>
      <div className="bw-sim-journey__head">
        <strong>{tr("ui.simulationJourney.votreRouteDuBled")}</strong>
        <span>{tr("ui.simulationJourney.simulationRienNEstEnregistre")}</span>
      </div>
      <JourneyStoryNav
        steps={steps}
        index={index}
        tone="light"
        onChange={(next) => {
          const step = JOURNEY_STEPS[next]!;
          const filmStep = FILM_STEPS[step];
          if (filmStep) {
            setPrep(null);
            onSeek(starts[filmStep] ?? 0);
          } else setPrep(step);
        }}
      />
      <p className="bw-sim-journey__lead">{guide.lead}</p>
      <a className="bw-sim-journey__follow" href={followHref}>
        {tr("ui.simulationJourney.cEstVotreVoyageChoisir")}
      </a>
    </section>
  );
}
