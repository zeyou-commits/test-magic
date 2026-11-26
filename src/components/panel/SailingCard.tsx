import { markBookingLeave } from "@/lib/companion/bookingReturn";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { track } from "@/lib/usage";
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
import { formatDuration, capitalizeFirst, formatShortDay } from "@/lib/ferry/format";
import { relativeDay, type Sailing } from "@/lib/ferry/trips";
import { AGGREGATOR, bookingSite, bookingUrl, partnerBookingUrl } from "@/lib/ferry/booking";
import {
  formatAge,
  formatDelay,
  TRUSTED_SIGNAL_MINUTES,
  type LiveShip,
} from "@/lib/ferry/tracking";
import { wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { ReportButton } from "./ReportButton";
import { FollowButton } from "./FollowButton";
import { FLASH_SELECT_EVENT } from "./FlashCenter";
import { SeaChip } from "./SeaForecast";
import { ShareButtons } from "./ShareButtons";
import { CompanyBadge } from "./CompanyBadge";
import { LiveFare, useLiveFare } from "./LiveFare";
import {
  estimateFerryFare,
  formatEuro,
  formatFareRange,
  useFareProfile,
} from "@/lib/ferry/pricing";
import { RECOMMENDED_RULE } from "@/lib/ferry/trips";
import { tr, lazyDateFormat, intlLocale, placeName } from "@/lib/i18n";

const dayFormatter = lazyDateFormat({
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
  // Prix réel déjà obtenu en dépliant la carte : il remplace l'estimation sur le bouton.
  const liveFare = useLiveFare(sailing, profile, false).query.data;
  const liveTotal =
    liveFare?.status === "ok" && liveFare.sameSailing && !(liveFare.cabinCompulsory && !liveFare.included)
      ? Math.ceil(liveFare.total)
      : null;
  // Navire en alerte : un prix laisserait croire que ce départ se réserve normalement.
  const alert = useVesselAlert(sailing.vessel?.id);

  const estimated = Boolean(departure.schedule_id && departure.reliability !== "verified");
  const company = sailing.company?.name ?? tr("ui.sailingCard.compagnie");

  // Fermée, la carte ne garde que ce qui sert à comparer : jour, heures, ports, compagnie, prix.
  // Mer, navire, suivi, partage et fiches sont dans le détail, au clic.
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`sailing-card group relative overflow-hidden rounded-2xl border bg-card transition-[box-shadow,border-color] duration-200 hover:shadow-md motion-reduce:transition-none ${expanded ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border hover:border-primary/40"}`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="min-w-0 flex-1 rounded-s-2xl py-2 ps-3 pe-1 text-start focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]"
        >
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
            <span className="truncate font-semibold text-foreground">
              {showDay ? `${formatDayKey(sailing.dayKey)} · ` : ""}
              <span className="font-medium text-muted-foreground">
                {relativeDay(sailing.dayKey, sailing.fromZone)}
              </span>
            </span>
            {overnight ? (
              <Moon
                className="size-3 shrink-0 text-primary"
                role="img"
                aria-label={tr("ui.sailingCard.departEnSoireeOuDe")}
              />
            ) : null}
            {estimated ? (
              <span
                className="shrink-0 rounded-full bg-warning/15 px-1.5 text-[10px] font-semibold text-warning-foreground"
                title={tr("ui.sailingCard.calendrierTheoriqueLaRotationHabituelle")}
              >
                {tr("ui.sailingCard.estime")}
              </span>
            ) : null}
            {recommended ? (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-success/15 px-1.5 text-[10px] font-semibold text-success"
                title={RECOMMENDED_RULE}
              >
                <Sparkles className="size-2.5" aria-hidden />
                {tr("ui.sailingCard.recommande")}
              </span>
            ) : null}
            <ChevronDown
              className={`ms-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${expanded ? "rotate-180 text-primary" : ""}`}
              aria-hidden
            />
          </div>

          <div className="mt-1.5 grid grid-cols-[2.25rem_auto_minmax(2rem,1fr)_auto] items-center gap-2.5">
            <span
              className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-border"
              title={company}
            >
              <CompanyBadge name={sailing.company?.name} logoUrl={sailing.company?.logo_url} size={17} />
              <span className="sr-only">{company}</span>
            </span>
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-none tabular-nums tracking-tight">
                {sailing.depTime}
              </div>
              <div className="mt-0.5 max-w-[88px] truncate text-[11px] font-medium text-muted-foreground">
                {placeName(sailing.from.name)}
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-center" aria-hidden>
              <span className="mb-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {formatDuration(sailing.durationMin)}
              </span>
              <span className="relative h-0.5 w-full rounded-full bg-border">
                <span className="absolute inset-y-0 start-0 w-full origin-left scale-x-0 rounded-full bg-primary transition-transform duration-500 group-hover:scale-x-100 motion-reduce:transition-none" />
                <span className="absolute -start-0.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
                <span className="absolute -end-0.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full border border-primary bg-card" />
              </span>
            </div>
            <div className="min-w-0 text-end">
              <div className="font-display text-lg font-bold leading-none tabular-nums tracking-tight">
                {sailing.arrTime ?? "—"}
                {arrivalSuffix ? (
                  <sup className="ms-0.5 text-[10px] font-semibold text-cta">{arrivalSuffix}</sup>
                ) : null}
              </div>
              <div className="ms-auto mt-0.5 max-w-[88px] truncate text-[11px] font-medium text-muted-foreground">
                {placeName(sailing.to.name)}
              </div>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center py-2 ps-1 pe-2.5">
          {alert ? (
            <span className="max-w-[88px] text-end text-[11px] font-semibold leading-tight text-destructive">
              {tr("ui.sailingCard.departAConfirmerAupresDe")}
            </span>
          ) : href ? (
            <a
              // Prix réel : on reste dans le même onglet, vers la réservation du partenaire.
              href={liveTotal != null ? partnerBookingUrl(sailing, profile) : href}
              {...(liveTotal != null ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              onClick={() => {
                track("booking_click", liveTotal != null ? "direct-ferries" : sailing.company?.name);
                markBookingLeave(liveTotal != null ? AGGREGATOR.name : bookingSite(sailing));
              }}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-cta px-3 text-sm font-bold text-cta-foreground shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              title={tr("ui.sailingCard.voirLOffreSurBudget", { bookingSite: bookingSite(sailing), formatEuro: formatEuro(fare.amount), formatFareRange: formatFareRange(fare) })}
            >
              <span className="tabular-nums">
                {liveTotal != null ? `${liveTotal.toLocaleString(intlLocale())} €` : formatEuro(fare.amount)}
              </span>
              {liveTotal != null ? (
                <span className="sr-only">{tr("ui.sailingCard.reserverCeDepart")}</span>
              ) : (
                <>
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only">
                    {tr("ui.sailingCard.sur")}
                    {bookingSite(sailing)}
                    {tr("ui.sailingCard.nouvelOnglet")}
                  </span>
                </>
              )}
            </a>
          ) : null}
        </div>
      </div>

      {live ? <LiveStrip live={live} arrivalZone={sailing.toZone} /> : null}

      {/* Détail : s'ouvre en glissant, sans quitter la liste. */}
      <div
        id={panelId}
        role="region"
        aria-label={tr("ui.sailingCard.detailDeLaTraversee")}
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

/** Détail d'une traversée (durée, arrivée, navire, actions), affiché en accordéon. */
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
  // Prix réel affiché : « Réserver » devient l'action principale, la fiche passe au second plan.
  const liveFare = useLiveFare(sailing, profile, false).query.data;
  const livePrice = liveFare?.status === "ok";
  const budgetTicket = Math.round(
    liveFare?.status === "ok" && liveFare.sameSailing ? liveFare.total : estimateFerryFare(sailing, profile).amount,
  );
  return (
    <div className="space-y-2.5 border-t bg-card px-3.5 py-3 text-xs">
      <dl className={`grid gap-2 ${sailing.route.distance_km ? "grid-cols-3" : "grid-cols-2"}`}>
        <Fact label={tr("ui.sailingCard.duree")} value={formatDuration(sailing.durationMin)} />
        <Fact
          label={tr("ui.sailingCard.arrivee")}
          value={
            departure.arrival_at
              ? `${formatShortDay(departure.arrival_at, sailing.toZone)} · ${sailing.arrTime ?? ""}`
              : "—"
          }
          hint={zoneLabel(sailing.toZone)}
        />
        {sailing.route.distance_km ? (
          <Fact label={tr("ui.sailingCard.distance")} value={`${sailing.route.distance_km} km`} />
        ) : null}
      </dl>

      {/* Prix réel du partenaire pour ce départ et ce profil (rien s'il n'est pas branché). */}
      <LiveFare sailing={sailing} profile={profile} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-foreground">
          {sailing.company?.name ?? tr("ui.sailingCard.compagnie")}
        </span>
        <SeaChip
          departureId={departure.id}
          from={sailing.from}
          to={sailing.to}
          departureAt={departure.departure_at}
          arrivalAt={departure.arrival_at}
        />
        {sailing.vessel ? (
          <button
            type="button"
            onClick={() => onOpenVessel(sailing.vessel!.id)}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <Ship className="size-3.5" aria-hidden /> {sailing.vessel.name}
            <VesselAlertTag vesselId={sailing.vessel.id} />
            <span className="font-normal text-muted-foreground">
              {tr("ui.sailingCard.fichePhoto")}
            </span>
          </button>
        ) : null}
      </div>

      {departure.notes ? (
        <p className="leading-relaxed text-muted-foreground">{departure.notes}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {/* La fiche complète : salon, voyageurs à bord, suivi en mer, préparatifs. */}
        <a
          href={`/?select=departure&id=${departure.id}`}
          onClick={(event) => {
            // Sur la carte : la fiche s'ouvre à la place de la liste, sans recharger la page.
            if (window.location.pathname !== "/") return;
            event.preventDefault();
            window.dispatchEvent(
              new CustomEvent(FLASH_SELECT_EVENT, {
                detail: { type: "departure", id: departure.id },
              }),
            );
          }}
          className={
            livePrice
              ? "inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 font-semibold hover:bg-secondary"
              : "inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 font-semibold text-primary-foreground hover:brightness-110"
          }
        >
          {tr("ui.sailingCard.voirLaTraversee")}
          <ChevronRight className="size-3.5" aria-hidden />
        </a>
        <button
          type="button"
          onClick={() => onOpenRoute(sailing.route.id)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 font-semibold hover:bg-secondary"
        >
          {tr("ui.sailingCard.ficheDeLaLigne")}
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
        {/* Budget porte à porte : dans le détail, la ligne de la carte reste logo, prix, favori. */}
        <a
          href={`/simulateurs/budget-voyage?ticket=${budgetTicket}`}
          title={tr("ui.sailingCard.budgetPorteAPorteRoute")}
          aria-label={tr("ui.sailingCard.calculerLeBudgetPorteA")}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 font-semibold hover:bg-secondary"
        >
          <Calculator className="size-3.5" aria-hidden />
          {tr("ui.sailingCard.budget")}
        </a>
        <ReportButton
          targetType="departure"
          targetId={departure.id}
          shown={{
            Départ: `${formatShortDay(departure.departure_at, sailing.fromZone)} ${sailing.depTime}`,
            Arrivée: sailing.arrTime
              ? `${sailing.arrTime}${sailing.arrDayOffset > 0 ? ` (+${sailing.arrDayOffset} j)` : ""}`
              : null,
            Navire: sailing.vessel?.name ?? null,
            Compagnie: sailing.company?.name ?? null,
          }}
        />
        <FollowButton
          kind="departure"
          targetId={departure.id}
          compact
          label={`${sailing.from.name} → ${sailing.to.name}`}
          demo={Boolean(departure.is_demo)}
        />
        <ShareButtons
          title={`${sailing.from.name} → ${sailing.to.name}`}
          text={tr("ui.sailingCard.departHeuresLocalesVerifiezAupres", { name: sailing.from.name, name2: sailing.to.name, formatShortDay: formatShortDay(departure.departure_at, sailing.fromZone), depTime: sailing.depTime, v: sailing.arrTime ? `, arrivée ${sailing.arrTime}${sailing.arrDayOffset > 0 ? ` (+${sailing.arrDayOffset} j)` : ""}` : "", v2: sailing.company ? ` · ${sailing.company.name}` : "" })}
        />
        {bookingHref ? (
          <a
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markBookingLeave(bookingSite(sailing))}
            className="ms-auto inline-flex h-8 items-center gap-1 rounded-full bg-cta px-3 font-semibold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            {tr("ui.sailingCard.voirLOffre")}
            <ArrowUpRight className="size-3.5" aria-hidden />
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

const weekdayFmt = lazyDateFormat({ weekday: "short", timeZone: "UTC" });
const monthFmt = lazyDateFormat({ month: "short", timeZone: "UTC" });
const fullDayFmt = lazyDateFormat({
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Frise de dates défilable au doigt, à la molette horizontale ou par glissement de souris. */
export function DayStrip({
  days,
  value,
  onChange,
  allLabel = tr("ui.sailingCard.tous"),
  range = null,
}: {
  days: { day: string; count: number }[];
  value: string | null;
  onChange: (day: string | null) => void;
  allLabel?: string;
  /** Les jours couverts par la recherche (date ± souplesse) : surlignés, et la frise s'y place. */
  range?: { from: string; to: string } | null;
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
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [days.length]);
  // Le jour choisi depuis le calendrier reste visible dans la frise.
  useEffect(() => {
    // Une plage cherchée (date ± souplesse) : la frise montre son premier jour, pas seulement la date.
    const anchor = range
      ? (days.find((item) => item.day >= range.from)?.day ?? null)
      : days.some((item) => item.day === value)
        ? value
        : null;
    if (!anchor) return;
    const rail = railRef.current;
    const index = days.findIndex((item) => item.day === anchor);
    const target = index < 0 ? null : rail?.children.item(index + 1);
    if (!(target instanceof HTMLElement) || !rail) return;
    const left = target.offsetLeft - rail.offsetLeft;
    if (
      range ||
      left < rail.scrollLeft ||
      left + target.offsetWidth > rail.scrollLeft + rail.clientWidth
    )
      rail.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
    // Les bornes, pas l'objet : un nouvel objet à chaque rendu ramènerait la frise sans cesse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, days, range?.from, range?.to]);

  if (days.length === 0) return null;
  const arrow =
    "grid size-7 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30";

  return (
    <div
      className="flex w-full min-w-0 items-center gap-1"
      aria-label={tr("ui.sailingCard.joursAvecDepart")}
    >
      <button
        type="button"
        className={arrow}
        disabled={!canScroll.left}
        onClick={() => {
          const rail = railRef.current;
          rail?.scrollBy({ left: -rail.clientWidth * 0.8, behavior: "smooth" });
        }}
        aria-label={tr("ui.sailingCard.datesPrecedentes")}
        title={tr("ui.sailingCard.datesPrecedentes")}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <div
        ref={railRef}
        className="bw-day-rail flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain scroll-smooth"
        role="listbox"
        aria-label={tr("ui.sailingCard.choisirUnJourDeDepart")}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          dragRef.current = {
            x: event.clientX,
            left: event.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || event.buttons !== 1) return;
          if (Math.abs(event.clientX - drag.x) > 5) drag.moved = true;
          if (drag.moved) event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
        }}
        onPointerUp={() => {
          window.setTimeout(() => {
            dragRef.current = null;
          }, 0);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onClickCapture={(event) => {
          if (dragRef.current?.moved) {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = null;
          }
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
          const inRange = !active && range !== null && day >= range.from && day <= range.to;
          return (
            <button
              key={day}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={tr("ui.sailingCard.depart", { v: fullDayFmt.format(date), count, v2: count > 1 ? "s" : "" })}
              onClick={() => onChange(active ? null : day)}
              title={tr("ui.sailingCard.depart2", { count, v: count > 1 ? "s" : "" })}
              className={`relative flex h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border px-0.5 leading-none transition ${active ? "border-primary bg-primary text-primary-foreground" : inRange ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-secondary"}`}
            >
              {/* Plusieurs départs ce jour-là : un compteur en coin, qui ne pousse pas le jour. */}
              {count > 1 ? (
                <span
                  className={`absolute end-0.5 top-0.5 grid min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] font-bold leading-[14px] ${active ? "bg-cta text-cta-foreground" : "bg-primary text-primary-foreground"}`}
                  aria-hidden
                >
                  {count}
                </span>
              ) : null}
              <span
                className={`whitespace-nowrap text-[9px] font-semibold uppercase ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {weekdayFmt.format(date).replace(".", "")}
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
        onClick={() => {
          const rail = railRef.current;
          rail?.scrollBy({ left: rail.clientWidth * 0.8, behavior: "smooth" });
        }}
        aria-label={tr("ui.sailingCard.datesSuivantes")}
        title={tr("ui.sailingCard.datesSuivantes")}
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
  const fresh = live.ageMinutes <= TRUSTED_SIGNAL_MINUTES;
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${atSea ? "bg-success/10" : "bg-secondary/60"}`}
    >
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          <span
            className={`absolute inline-flex size-full rounded-full ${atSea && fresh ? "animate-ping bg-success/60" : ""}`}
          />
          <span
            className={`relative inline-flex size-2.5 rounded-full ${atSea && fresh ? "bg-success" : "bg-muted-foreground"}`}
          />
        </span>
        <span className="truncate">
          {atSea
            ? fresh
              ? tr("ui.sailingCard.enMer")
              : tr("ui.sailingCard.enMerEstime")
            : tr("ui.sailingCard.auPort")}
          {fresh && live.position.speedKnots
            ? tr("ui.sailingCard.nUds", { v: Math.round(live.position.speedKnots) })
            : ""}
        </span>
      </span>
      <span className="shrink-0 text-end text-muted-foreground">
        {atSea && live.etaIso ? (
          <>
            {tr("ui.sailingCard.arriveeVers")}{" "}
            <strong className="text-foreground">{wallTimeInZone(live.etaIso, arrivalZone)}</strong>
            {live.delayMinutes !== null && delay.tone === "late" ? (
              <span className="ms-1 font-semibold text-destructive">
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
