import type { ComponentType } from "react";
import { Anchor, Car, Flag, Home, Ship, ShieldCheck } from "lucide-react";

/**
 * Les morceaux de la fiche d'un trajet porte à porte : barre à l'échelle (route, ports, mer, nuits),
 * fil de route rangé par jour, coût route + ferry. Purement visuels : le calcul reste dans le simulateur.
 */

const NIGHT_FROM = 22;
const NIGHT_TO = 6;

// L'heure locale (0-23) ; formatToParts, car le français écrit « 04 h ».
const hourIn = (ms: number, zone: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(ms)
      .find((part) => part.type === "hour")?.value ?? 0,
  );

export const timeLabel = (ms: number, zone: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(ms);

export const shortDay = (ms: number, zone: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(ms);

const longDay = (ms: number, zone: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).format(ms);

export const durationText = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** Les tranches de nuit (22 h – 6 h) entre deux instants, en minutes depuis le début. */
export function nightSpans(start: number, end: number, zone: string) {
  const spans: { from: number; to: number }[] = [];
  const step = 10 * 60_000;
  let open: number | null = null;
  for (let at = start; at <= end; at += step) {
    const hour = hourIn(at, zone);
    const night = hour >= NIGHT_FROM || hour < NIGHT_TO;
    const minute = (at - start) / 60_000;
    if (night && open === null) open = minute;
    if (!night && open !== null) {
      spans.push({ from: open, to: minute });
      open = null;
    }
  }
  if (open !== null) spans.push({ from: open, to: (end - start) / 60_000 });
  return spans;
}

/** Vrai si la tranche [start, end] passe plus de `min` minutes de nuit. */
export const crossesNight = (start: number, end: number, zone: string, min = 20) =>
  nightSpans(start, end, zone).some((span) => span.to - span.from > min);

export type TripSegment = { kind: "road" | "wait" | "sea"; minutes: number };

const SEGMENT_CLASS: Record<TripSegment["kind"], string> = {
  road: "bw-tripbar__road",
  wait: "bw-tripbar__wait",
  sea: "bw-tripbar__sea",
};

export function TripBar({
  segments,
  start,
  zone,
  showNights,
}: {
  segments: TripSegment[];
  start: number;
  zone: string;
  /** Les nuits ne s'affichent que pour un départ daté. */
  showNights: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0) || 1;
  const nights = showNights ? nightSpans(start, start + total * 60_000, zone) : [];
  const sum = (kind: TripSegment["kind"]) =>
    segments.filter((segment) => segment.kind === kind).reduce((s, segment) => s + segment.minutes, 0);
  return (
    <div className="grid gap-1.5">
      <div className="bw-tripbar" role="img" aria-label={`Route ${durationText(sum("road"))}, ports ${durationText(sum("wait"))}, mer ${durationText(sum("sea"))}`}>
        {segments.map((segment, index) => (
          <span
            key={index}
            className={SEGMENT_CLASS[segment.kind]}
            style={{ width: `${(segment.minutes / total) * 100}%` }}
          />
        ))}
        {nights.map((night, index) => (
          <i
            key={`n${index}`}
            className="bw-tripbar__night"
            style={{ left: `${(night.from / total) * 100}%`, width: `${((night.to - night.from) / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="bw-tripbar__legend">
        <span><i className="bw-tripbar__road" />Route {durationText(sum("road"))}</span>
        <span><i className="bw-tripbar__wait" />Ports {durationText(sum("wait"))}</span>
        <span><i className="bw-tripbar__sea" />Mer {durationText(sum("sea"))}</span>
        {nights.length ? <span><i className="bw-tripbar__night-key" />Nuit</span> : null}
      </div>
    </div>
  );
}

export type TripStepKind = "home" | "port" | "sea" | "land" | "road" | "done";

const STEP_ICON: Record<TripStepKind, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  home: Home,
  port: Anchor,
  sea: Ship,
  land: ShieldCheck,
  road: Car,
  done: Flag,
};

export type TripStep = {
  kind: TripStepKind;
  /** Instant de l'étape ; null quand la date n'est pas publiée (on affiche alors l'écart depuis le départ). */
  at: number;
  zone: string;
  title: string;
  text: string;
  note?: string;
};

/** Le fil de route : rangé par jour, heures à gauche, la mer en bleu. */
export function DayTimeline({ steps, dated, start }: { steps: TripStep[]; dated: boolean; start: number }) {
  const groups: { day: string; steps: TripStep[] }[] = [];
  for (const step of steps) {
    const day = dated ? longDay(step.at, step.zone) : "";
    const last = groups.at(-1);
    if (last && last.day === day) last.steps.push(step);
    else groups.push({ day, steps: [step] });
  }
  return (
    <div className="grid gap-1">
      {groups.map((group, g) => (
        <div key={g}>
          {group.day ? <p className="bw-daytl__day">{group.day}</p> : null}
          <ol className="bw-daytl">
            {group.steps.map((step) => {
              const Icon = STEP_ICON[step.kind];
              return (
                <li key={step.kind} className="bw-daytl__step" data-kind={step.kind}>
                  <span className="bw-daytl__time">
                    {dated ? timeLabel(step.at, step.zone) : step.kind === "home" ? "Départ" : `+${durationText((step.at - start) / 60_000)}`}
                  </span>
                  <span className="bw-daytl__dot">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="bw-daytl__body">
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                    {step.note ? <em>{step.note}</em> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function CostBar({ road, ferry, range }: { road: number; ferry: number; range: string }) {
  const total = road + ferry || 1;
  const euro = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  return (
    <div className="grid gap-2">
      <div className="bw-costbar" aria-hidden>
        <span className="bw-tripbar__road" style={{ width: `${(road / total) * 100}%` }} />
        <span className="bw-tripbar__sea" style={{ width: `${(ferry / total) * 100}%` }} />
      </div>
      <p className="bw-costbar__row">
        <span><i className="bw-tripbar__road" />{"Route\u00a0: carburant et péages"}</span>
        <b>≈ {euro.format(road)} €</b>
      </p>
      <p className="bw-costbar__row">
        <span>
          <i className="bw-tripbar__sea" />Ferry avec la voiture <small>({range})</small>
        </span>
        <b>≈ {euro.format(ferry)} €</b>
      </p>
    </div>
  );
}
