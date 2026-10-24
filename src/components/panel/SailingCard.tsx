import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
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
import { bookingSite, bookingUrl } from "@/lib/ferry/booking";
import { formatAge, formatDelay, type LiveShip } from "@/lib/ferry/tracking";
import { wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { ReportButton } from "./ReportButton";
import { FollowButton } from "./FollowButton";
import { ShareButtons } from "./ShareButtons";
import { CompanyBadge } from "./CompanyBadge";
import { estimateFerryFare, formatEuro, formatFareRange, useFareProfile } from "@/lib/ferry/pricing";

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
  const profile = useFareProfile();
  const href = bookingUrl(sailing, profile);
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const arrivalSuffix = sailing.arrDayOffset > 0 ? `+${sailing.arrDayOffset}` : "";
  const departure = sailing.departure;
  const panelId = `sailing-${departure.id}`;
  const fare = estimateFerryFare(sailing, profile);

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
        style={{ background: "#1e5b7a" }}
        aria-hidden
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="block w-full py-2.5 pb-2 pl-4 pr-3.5 text-left"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
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
            <div className="font-display text-xl font-bold leading-none tabular-nums tracking-tight">
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
            <div className="font-display text-xl font-bold leading-none tabular-nums tracking-tight">
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

      <div className="flex items-center justify-between gap-2 border-t border-dashed bg-secondary/40 px-3.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <CompanyBadge name={sailing.company?.name} logoUrl={sailing.company?.logo_url} />
          <div className="min-w-0 truncate text-xs font-semibold">
            {sailing.company?.name ?? "Compagnie"}
            {sailing.vessel?.name ? (
              <span className="font-normal text-muted-foreground"> · {sailing.vessel.name}</span>
            ) : null}
          </div>
        </div>
        <span
          className="ml-auto shrink-0 text-sm font-bold tabular-nums text-success"
          title={`Fourchette indicative : ${formatFareRange(fare)} · voyageurs et véhicule choisis`}
        >
          <span className="block text-[10px] font-normal text-muted-foreground">Budget estimé</span>
          {formatEuro(fare.amount)}
        </span>
        <a
          href={`/simulateurs/budget-voyage?ticket=${Math.round(fare.amount)}`}
          title="Budget porte-à-porte : route, péages et bateau"
          aria-label="Calculer le budget porte-à-porte avec ce billet"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-primary hover:bg-secondary"
        >
          <Calculator className="size-3.5" aria-hidden /> Budget
        </a>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-cta px-3 text-xs font-semibold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            Voir l’offre <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only">sur {bookingSite(sailing)} (nouvel onglet)</span>
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
          {expanded ? (
            <SailingDetail
              sailing={sailing}
              onOpenVessel={onOpenVessel}
              onOpenRoute={onOpenRoute}
            />
          ) : null}
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
  showBooking = false,
}: {
  sailing: Sailing;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
  /** Ajoute le bouton « Réserver » (cartes aller-retour, qui n'ont pas de pied). */
  showBooking?: boolean;
}) {
  const departure = sailing.departure;
  const profile = useFareProfile();
  const bookingHref = showBooking ? bookingUrl(sailing, profile) : null;
  return (
    <div className="space-y-2.5 border-t bg-card px-3.5 py-3 text-xs">
      <dl className={`grid gap-2 ${sailing.route.distance_km ? "grid-cols-3" : "grid-cols-2"}`}>
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
        <FollowButton kind="departure" targetId={departure.id} compact label={`${sailing.from.name} → ${sailing.to.name}`} demo={Boolean(departure.is_demo)} />
        <ShareButtons />
        {bookingHref ? (
          <a
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full bg-cta px-3 font-semibold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            Voir l’offre <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        ) : null}
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

const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const fullDayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Frise de dates défilable au doigt, à la molette horizontale ou par glissement de souris. */
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
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const element = railRef.current;
    if (!element) return;
    const update = () => {
      setCanScroll({
        left: element.scrollLeft > 2,
        right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [days.length]);
  // Le jour choisi depuis le calendrier reste visible dans la frise.
  useEffect(() => {
    if (!value) return;
    const rail = railRef.current;
    const index = days.findIndex((item) => item.day === value);
    const target = index < 0 ? null : rail?.children.item(index + 1);
    if (!(target instanceof HTMLElement) || !rail) return;
    const left = target.offsetLeft - rail.offsetLeft;
    if (left < rail.scrollLeft || left + target.offsetWidth > rail.scrollLeft + rail.clientWidth)
      rail.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
  }, [value, days]);

  if (days.length === 0) return null;
  const arrow =
    "grid size-7 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex w-full min-w-0 items-center gap-1" aria-label="Jours avec départ">
      <button
        type="button"
        className={arrow}
        disabled={!canScroll.left}
        onClick={() => { const rail = railRef.current; rail?.scrollBy({ left: -rail.clientWidth * 0.8, behavior: "smooth" }); }}
        aria-label="Dates précédentes"
        title="Dates précédentes"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <div
        ref={railRef}
        className="bw-day-rail flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain scroll-smooth"
        role="listbox"
        aria-label="Choisir un jour de départ"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          dragRef.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || event.buttons !== 1) return;
          if (Math.abs(event.clientX - drag.x) > 5) drag.moved = true;
          if (drag.moved) event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
        }}
        onPointerUp={() => { window.setTimeout(() => { dragRef.current = null; }, 0); }}
        onPointerCancel={() => { dragRef.current = null; }}
        onClickCapture={(event) => {
          if (dragRef.current?.moved) { event.preventDefault(); event.stopPropagation(); dragRef.current = null; }
        }}
      >
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onClick={() => onChange(null)}
          className={`flex h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border px-1 text-[11px] font-semibold transition ${value === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
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
              aria-label={`${fullDayFmt.format(date)}, ${count} départ${count > 1 ? "s" : ""}`}
              onClick={() => onChange(active ? null : day)}
              title={`${count} départ${count > 1 ? "s" : ""}`}
              className={`flex h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border px-0.5 leading-none transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
            >
              <span className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                <span className={`text-[9px] font-semibold uppercase ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {weekdayFmt.format(date).replace(".", "")}
                </span>
                {count > 1 ? <span className={`grid min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] font-bold ${active ? "bg-cta text-cta-foreground" : "bg-primary text-primary-foreground"}`}>{count}</span> : null}
              </span>
              <span className="font-display text-sm font-bold">{date.getUTCDate()}</span>
              <span
                className={`text-[9px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {monthFmt.format(date).replace(".", "")}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={arrow}
        disabled={!canScroll.right}
        onClick={() => { const rail = railRef.current; rail?.scrollBy({ left: rail.clientWidth * 0.8, behavior: "smooth" }); }}
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
