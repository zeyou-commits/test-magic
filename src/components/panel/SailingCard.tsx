import { ArrowUpRight, Moon, Ship, Sparkles } from "lucide-react";
import {
  formatDuration,
  reliabilityLabel,
  reliabilityTone,
  capitalizeFirst,
} from "@/lib/ferry/format";
import { relativeDay, type Sailing } from "@/lib/ferry/trips";
import { safeExternalUrl } from "./shared";
import { formatAge, formatDelay, type LiveShip } from "@/lib/ferry/tracking";
import { wallTimeInZone } from "@/lib/ferry/time";

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDayKey = (dayKey: string) =>
  capitalizeFirst(dayFormatter.format(new Date(`${dayKey}T00:00:00Z`)));

/** Carte de traversée : frise départ → arrivée, durée, compagnie, réservation. */
export function SailingCard({
  sailing,
  recommended,
  selected,
  live,
  showDay,
  index,
  onSelect,
}: {
  sailing: Sailing;
  recommended?: boolean;
  selected?: boolean;
  live?: LiveShip | undefined;
  showDay?: boolean;
  index: number;
  onSelect: () => void;
}) {
  const href = safeExternalUrl(sailing.company?.website_url);
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const arrivalSuffix = sailing.arrDayOffset > 0 ? `+${sailing.arrDayOffset}` : "";

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={`sailing-card group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-primary ring-2 ring-primary/25" : "border-border"}`}
    >
      <button type="button" onClick={onSelect} className="block w-full px-4 pb-3 pt-3.5 text-left">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {showDay ? `${formatDayKey(sailing.dayKey)} · ` : ""}
            <span className="font-medium text-muted-foreground">
              {relativeDay(sailing.dayKey, sailing.fromZone)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {recommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
                <Sparkles className="size-3" aria-hidden /> Recommandé
              </span>
            ) : null}
            {overnight ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary"
                title="Départ en soirée ou de nuit"
              >
                <Moon className="size-3" aria-hidden /> Nuit
              </span>
            ) : null}
          </span>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <div className="font-display text-[26px] font-bold leading-none tabular-nums tracking-tight">
              {sailing.depTime}
            </div>
            <div className="mt-1 max-w-[88px] truncate text-xs font-semibold text-foreground">
              {sailing.from.name}
            </div>
          </div>

          <div className="relative flex flex-col items-center px-1" aria-hidden>
            <span className="mb-3 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {formatDuration(sailing.durationMin)}
            </span>
            <div className="relative h-0.5 w-full rounded-full bg-border">
              <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-primary to-cta opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute -left-0.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
              <span className="absolute -right-0.5 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-primary bg-card" />
              <span className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border transition-transform duration-500 group-hover:translate-x-3">
                <Ship className="size-3.5" />
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="font-display text-[26px] font-bold leading-none tabular-nums tracking-tight">
              {sailing.arrTime ?? "—"}
              {arrivalSuffix ? (
                <sup className="ml-0.5 text-[11px] font-semibold text-cta">{arrivalSuffix}</sup>
              ) : null}
            </div>
            <div className="mt-1 ml-auto max-w-[88px] truncate text-xs font-semibold text-foreground">
              {sailing.to.name}
            </div>
          </div>
        </div>
      </button>

      {live ? <LiveStrip live={live} arrivalZone={sailing.toZone} /> : null}

      <div className="flex items-center justify-between gap-2 border-t border-dashed bg-secondary/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
            aria-hidden
          >
            {initials(sailing.company?.name ?? "?")}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-semibold">
              {sailing.company?.name ?? "Compagnie"}
            </div>
            <div
              className={`truncate text-[11px] ${reliabilityTone[sailing.departure.reliability]}`}
            >
              {sailing.vessel?.name ? `${sailing.vessel.name} · ` : ""}
              {reliabilityLabel[sailing.departure.reliability]}
            </div>
          </div>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-cta px-3.5 text-xs font-semibold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            Réserver <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only">sur le site de {sailing.company?.name} (nouvel onglet)</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

/** Frise horizontale des jours avec départ. */
export function DayStrip({
  days,
  value,
  onChange,
  allLabel = "Tous",
}: {
  days: { day: string; count: number }[];
  value: string | null;
  onChange: (day: string | null) => void;
  allLabel?: string;
}) {
  if (days.length === 0) return null;
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="listbox"
      aria-label="Jours avec départ"
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onClick={() => onChange(null)}
          className={`flex h-[58px] min-w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 text-xs font-semibold transition ${value === null ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-card hover:bg-secondary"}`}
        >
          {allLabel}
        </button>
        {days.map(({ day, count }) => {
          const date = new Date(`${day}T00:00:00Z`);
          const active = value === day;
          return (
            <button
              key={day}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(active ? null : day)}
              className={`relative flex h-[58px] min-w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 transition ${active ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-card hover:-translate-y-0.5 hover:bg-secondary"}`}
            >
              <span
                className={`text-[10px] font-semibold uppercase ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" })
                  .format(date)
                  .replace(".", "")}
              </span>
              <span className="font-display text-lg font-bold leading-none">
                {date.getUTCDate()}
              </span>
              <span
                className={`text-[10px] font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
                  .format(date)
                  .replace(".", "")}
              </span>
              {count > 1 ? (
                <span
                  className={`absolute -right-1 -top-1 grid size-4 place-items-center rounded-full text-[10px] font-bold ${active ? "bg-cta text-cta-foreground" : "bg-primary text-primary-foreground"}`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Bandeau « en direct » d'une carte de traversée. */
export function LiveStrip({ live, arrivalZone }: { live: LiveShip; arrivalZone: string }) {
  const delay = formatDelay(live.delayMinutes);
  const atSea = live.phase === "sea";
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${atSea ? "bg-success/10" : "bg-secondary/60"}`}
    >
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          <span
            className={`absolute inline-flex size-full rounded-full ${atSea ? "animate-ping bg-success/60" : ""}`}
          />
          <span
            className={`relative inline-flex size-2.5 rounded-full ${atSea ? "bg-success" : "bg-muted-foreground"}`}
          />
        </span>
        <span className="truncate">
          {atSea ? "En mer" : "Au port"}
          {live.position.speedKnots ? ` · ${Math.round(live.position.speedKnots)} nœuds` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right text-muted-foreground">
        {atSea && live.etaIso ? (
          <>
            Arrivée vers{" "}
            <strong className="text-foreground">{wallTimeInZone(live.etaIso, arrivalZone)}</strong>
            {live.delayMinutes !== null && delay.tone === "late" ? (
              <span className="ml-1 font-semibold text-destructive">
                ({delay.label.replace("Retard estimé : ", "+")})
              </span>
            ) : null}
          </>
        ) : (
          formatAge(live.ageMinutes)
        )}
      </span>
    </div>
  );
}
