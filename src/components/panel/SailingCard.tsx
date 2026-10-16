import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Moon,
  Ship,
  Sparkles,
} from "lucide-react";
import {
  formatDuration,
  reliabilityLabel,
  reliabilityTone,
  capitalizeFirst,
  formatShortDay,
} from "@/lib/ferry/format";
import { relativeDay, type Sailing } from "@/lib/ferry/trips";
import { safeExternalUrl } from "./shared";
import { formatAge, formatDelay, type LiveShip } from "@/lib/ferry/tracking";
import { wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { ReportButton } from "./ReportButton";
import { ShareButtons } from "./ShareButtons";
import { CompanyBadge, companyColor } from "./CompanyBadge";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDayKey = (dayKey: string) =>
  capitalizeFirst(dayFormatter.format(new Date(`${dayKey}T00:00:00Z`)));

/** Carte de traversée compacte : un clic déplie le détail juste en dessous (accordéon). */
export function SailingCard({
  sailing,
  recommended,
  live,
  showDay,
  index,
  expanded,
  onToggle,
  onHover,
  onOpenVessel,
  onOpenRoute,
}: {
  sailing: Sailing;
  recommended?: boolean;
  live?: LiveShip | undefined;
  showDay?: boolean;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  /** Survol (ou focus clavier) : la ligne correspondante se met en évidence sur la carte. */
  onHover: (hovering: boolean) => void;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const href = safeExternalUrl(sailing.company?.website_url);
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const arrivalSuffix = sailing.arrDayOffset > 0 ? `+${sailing.arrDayOffset}` : "";
  const departure = sailing.departure;
  const panelId = `sailing-${departure.id}`;
  const brand = companyColor(sailing.company?.name);

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`sailing-card group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:shadow-lg ${expanded ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border hover:-translate-y-0.5"}`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: brand.solid }}
        aria-hidden
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="block w-full py-3 pb-2.5 pl-4 pr-3.5 text-left"
      >
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
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
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180 text-primary" : ""}`}
              aria-hidden
            />
          </span>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <div className="font-display text-2xl font-bold leading-none tabular-nums tracking-tight">
              {sailing.depTime}
            </div>
            <div className="mt-0.5 max-w-[92px] truncate text-xs font-semibold text-foreground">
              {sailing.from.name}
            </div>
          </div>

          <div className="relative flex flex-col items-center px-1" aria-hidden>
            <span className="mb-2.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
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
            <div className="font-display text-2xl font-bold leading-none tabular-nums tracking-tight">
              {sailing.arrTime ?? "—"}
              {arrivalSuffix ? (
                <sup className="ml-0.5 text-[11px] font-semibold text-cta">{arrivalSuffix}</sup>
              ) : null}
            </div>
            <div className="ml-auto mt-0.5 max-w-[92px] truncate text-xs font-semibold text-foreground">
              {sailing.to.name}
            </div>
          </div>
        </div>
      </button>

      {live ? <LiveStrip live={live} arrivalZone={sailing.toZone} /> : null}

      <div className="flex items-center justify-between gap-2 border-t border-dashed bg-secondary/40 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <CompanyBadge name={sailing.company?.name} logoUrl={sailing.company?.logo_url} />
          <div className="min-w-0 truncate text-xs font-semibold">
            {sailing.company?.name ?? "Compagnie"}
            {sailing.vessel?.name ? (
              <span className="font-normal text-muted-foreground"> · {sailing.vessel.name}</span>
            ) : null}
          </div>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-cta px-3 text-xs font-semibold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            Réserver <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only">sur le site de {sailing.company?.name} (nouvel onglet)</span>
          </a>
        ) : null}
      </div>

      {/* Détail : s'ouvre en glissant, sans quitter la liste. */}
      <div
        id={panelId}
        role="region"
        aria-label="Détail de la traversée"
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <SailingDetail sailing={sailing} onOpenVessel={onOpenVessel} onOpenRoute={onOpenRoute} />
        </div>
      </div>
    </article>
  );
}

/** Détail d'une traversée (durée, arrivée, navire, fiabilité, actions), affiché en accordéon. */
export function SailingDetail({
  sailing,
  onOpenVessel,
  onOpenRoute,
}: {
  sailing: Sailing;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const departure = sailing.departure;
  return (
    <div className="space-y-2.5 border-t bg-card px-3.5 py-3 text-xs">
      <dl
        className={`grid gap-2 ${sailing.route.distance_km ? "grid-cols-3" : "grid-cols-2"}`}
      >
        <Fact label="Durée" value={formatDuration(sailing.durationMin)} />
        <Fact
          label="Arrivée"
          value={
            departure.arrival_at
              ? `${formatShortDay(departure.arrival_at, sailing.toZone)} · ${sailing.arrTime ?? ""}`
              : "—"
          }
          hint={zoneLabel(sailing.toZone)}
        />
        {sailing.route.distance_km ? (
          <Fact label="Distance" value={`${sailing.route.distance_km} km`} />
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {sailing.vessel ? (
          <button
            type="button"
            onClick={() => onOpenVessel(sailing.vessel!.id)}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <Ship className="size-3.5" aria-hidden /> {sailing.vessel.name}
            <span className="font-normal text-muted-foreground">(fiche + photo)</span>
          </button>
        ) : null}
        <span className={`font-semibold ${reliabilityTone[departure.reliability]}`}>
          {reliabilityLabel[departure.reliability]}
        </span>
        {departure.last_verified_at ? (
          <span className="text-muted-foreground">
            vérifié le {new Date(departure.last_verified_at).toLocaleDateString("fr-FR")}
          </span>
        ) : null}
      </div>

      {departure.notes ? (
        <p className="leading-relaxed text-muted-foreground">{departure.notes}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onOpenRoute(sailing.route.id)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 font-semibold hover:bg-secondary"
        >
          Fiche de la ligne <ChevronRight className="size-3.5" aria-hidden />
        </button>
        <ReportButton targetType="departure" targetId={departure.id} label="Signaler" />
        <ShareButtons />
      </div>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-2.5 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-semibold leading-tight text-foreground">{value}</dd>
      {hint ? <dd className="text-[10px] text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

const STRIP_PAGE = 7;
const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** Frise compacte des jours avec départ, paginée : « Dates précédentes » / « Dates suivantes ». */
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
  const [start, setStart] = useState(0);
  // La fenêtre suit le jour choisi (ex. depuis le calendrier).
  useEffect(() => {
    if (!value) return;
    const index = days.findIndex((item) => item.day === value);
    if (index < 0) return;
    setStart((current) =>
      index >= current && index < current + STRIP_PAGE ? current : Math.max(0, index - 1),
    );
  }, [value, days]);

  if (days.length === 0) return null;
  const maxStart = Math.max(0, days.length - STRIP_PAGE);
  const from = Math.min(start, maxStart);
  const visible = days.slice(from, from + STRIP_PAGE);
  const hasPrev = from > 0;
  const hasNext = from < maxStart;
  const arrow =
    "grid size-8 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex items-center gap-1" role="listbox" aria-label="Jours avec départ">
      <button
        type="button"
        className={arrow}
        disabled={!hasPrev}
        onClick={() => setStart(Math.max(0, from - STRIP_PAGE))}
        aria-label="Dates précédentes"
        title="Dates précédentes"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onClick={() => onChange(null)}
          className={`flex h-11 min-w-[40px] flex-1 shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 text-[11px] font-semibold transition ${value === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
        >
          {allLabel}
        </button>
        {visible.map(({ day, count }) => {
          const date = new Date(`${day}T00:00:00Z`);
          const active = value === day;
          return (
            <button
              key={day}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(active ? null : day)}
              title={`${count} départ${count > 1 ? "s" : ""}`}
              className={`relative flex h-11 min-w-[40px] flex-1 shrink-0 flex-col items-center justify-center rounded-xl border px-1 leading-none transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
            >
              <span
                className={`text-[9px] font-semibold uppercase ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {weekdayFmt.format(date).replace(".", "")}
              </span>
              <span className="font-display text-sm font-bold">{date.getUTCDate()}</span>
              <span
                className={`text-[9px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {monthFmt.format(date).replace(".", "")}
              </span>
              {count > 1 ? (
                <span
                  className={`absolute -right-0.5 -top-1 grid size-3.5 place-items-center rounded-full text-[9px] font-bold ${active ? "bg-cta text-cta-foreground" : "bg-primary text-primary-foreground"}`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={arrow}
        disabled={!hasNext}
        onClick={() => setStart(Math.min(maxStart, from + STRIP_PAGE))}
        aria-label="Dates suivantes"
        title="Dates suivantes"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
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
