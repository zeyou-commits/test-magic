import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fr } from "react-day-picker/locale";
import { Backpack, CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  SCHOOL_ZONES,
  addDaysKey,
  diffDays,
  holidayPeriods,
  type HolidayPeriod,
  type SchoolZone,
} from "@/lib/ferry/schoolCalendar";
import { capitalizeFirst } from "@/lib/ferry/format";
import { SalesAlertForm } from "./SalesAlertForm";
import { useIsMobile } from "@/hooks/use-mobile";

const ZONE_STORAGE_KEY = "batogo:school-zone";

export type CalendarField = "out" | "ret";

interface TripCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: CalendarField;
  onFieldChange: (field: CalendarField) => void;
  roundTrip: boolean;
  date: string | null;
  returnDate: string | null;
  flexDays: number;
  /** Jours (AAAA-MM-JJ) avec au moins un départ, et leur nombre : aller, puis retour. */
  outDays: Map<string, number>;
  backDays: Map<string, number>;
  /** « Marseille → Alger » quand un trajet précis est choisi. */
  pairLabel: string | null;
  today: string;
  onChange: (patch: {
    date?: string | null;
    returnDate?: string | null;
    flexDays?: number;
    roundTrip?: boolean;
  }) => void;
  /** Ouvert depuis le bouton « Vacances » : le bloc des zones est déplié. */
  holidaysOn: boolean;
  onHolidaysChange: (on: boolean) => void;
  /** Les deux champs de date, qui servent d'ancre au calendrier. */
  anchor?: ReactNode;
  /** Affiché directement dans le panneau, sans fenêtre superposée. */
  inline?: boolean;
}

const keyToDate = (key: string) => {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dateToKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const short = (key: string) =>
  keyToDate(key).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const long = (key: string) =>
  capitalizeFirst(
    keyToDate(key).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
  );

/** Jour avec départ le plus proche d'une cible, dans une fenêtre donnée (à égalité : le plus tôt). */
function nearest(
  days: Map<string, number>,
  target: string,
  before: number,
  after: number,
  min: string,
) {
  for (let step = 0; step <= Math.max(before, after); step += 1) {
    const candidates = [
      step <= before ? addDaysKey(target, -step) : null,
      step <= after && step > 0 ? addDaysKey(target, step) : null,
    ];
    for (const candidate of candidates) {
      if (candidate && candidate >= min && days.has(candidate)) return candidate;
    }
  }
  return null;
}

export function TripCalendar({
  open,
  onOpenChange,
  field,
  onFieldChange,
  roundTrip,
  date,
  returnDate,
  flexDays,
  outDays,
  backDays,
  pairLabel,
  today,
  onChange,
  holidaysOn,
  onHolidaysChange,
  anchor,
  inline = false,
}: TripCalendarProps) {
  const [zones, setZones] = useState<SchoolZone[]>([]);
  const [month, setMonth] = useState<Date>(() => keyToDate(date ?? today));
  const [note, setNote] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Aucune zone de vacances n'est cochée par défaut à l'arrivée sur le calendrier.
  const toggleZone = (item: SchoolZone) => {
    const next = zones.includes(item)
      ? zones.filter((z) => z !== item)
      : ([...zones, item].sort() as SchoolZone[]);
    setZones(next);
    setNote(null);
    if (next.length > 0 && !holidaysOn) onHolidaysChange(true);
    if (next.length === 0 && holidaysOn) onHolidaysChange(false);
    try {
      window.localStorage.setItem(ZONE_STORAGE_KEY, next.join(","));
    } catch {
      // Sans conséquence.
    }
  };

  // Retour : si aucun trajet de retour précis n'est connu, on propose les jours où le réseau a des départs.
  const activeDays = field === "ret" && backDays.size > 0 ? backDays : outDays;
  const shownZones = holidaysOn ? zones : [];
  const periodsByZone = useMemo(
    () =>
      Object.fromEntries(
        (["A", "B", "C"] as SchoolZone[]).map((z) => [
          z,
          holidaysOn && zones.includes(z) ? holidayPeriods(z, today) : [],
        ]),
      ) as Record<SchoolZone, HolidayPeriod[]>,
    [zones, holidaysOn, today],
  );
  const periods = useMemo(
    () =>
      shownZones
        .flatMap((z) => periodsByZone[z])
        .sort((a, b) => a.start.localeCompare(b.start)),
    [shownZones, periodsByZone],
  );
  const inZone = (z: SchoolZone, key: string) =>
    periodsByZone[z].some((period) => key >= period.start && key <= period.lastDay);

  // On se place sur le bon mois à l'ouverture et au changement de champ.
  useEffect(() => {
    if (!open) return;
    const target = field === "ret" ? (returnDate ?? date) : date;
    const first = [...activeDays.keys()].sort()[0];
    setMonth(keyToDate(target ?? first ?? today));
    setNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  const lastAvailable = [...activeDays.keys()].sort().at(-1);
  const endMonth = keyToDate(lastAvailable ?? addDaysKey(today, 365));

  const pick = (key: string) => {
    setNote(null);
    if (field === "out") {
      onChange({ date: key, returnDate: returnDate && returnDate < key ? null : returnDate });
      if (roundTrip) onFieldChange("ret");
      else onOpenChange(false);
    } else {
      onChange({ returnDate: key });
      onOpenChange(false);
    }
  };

  // Aucun départ connu pendant la période (ni juste avant) : les ventes ne sont probablement pas ouvertes.
  const isUnscheduled = (period: HolidayPeriod) => {
    const from = addDaysKey(period.start, -3);
    return ![...outDays.keys()].some((key) => key >= from && key <= period.lastDay);
  };

  // Prochaines vacances sans aucun départ programmé : on le dit, et on propose une alerte.
  const nextEmpty = periods[0] && isUnscheduled(periods[0]) ? periods[0] : null;

  const hasRange = Boolean(date && returnDate && roundTrip);
  const stay = date && returnDate ? diffDays(date, returnDate) : null;
  const activeValue = field === "out" ? date : returnDate;
  const unavailableActive = activeValue ? !activeDays.has(activeValue) : false;
  const suggestion =
    activeValue && unavailableActive ? nearest(activeDays, activeValue, 7, 7, today) : null;

  // Une même période (ex. Toussaint) commune à plusieurs zones n'apparaît qu'une fois.
  const dedupedPeriods = useMemo(() => {
    const seen = new Set<string>();
    return periods.filter((period) => (seen.has(period.id) ? false : (seen.add(period.id), true))).slice(0, 6);
  }, [periods]);

  /** Un geste : aller au plus près du début des vacances, retour au plus près de la reprise (souplesse incluse). */
  const pickPeriod = (period: HolidayPeriod) => {
    const tolerance = Math.max(flexDays, 1);
    const out = nearest(outDays, period.start, tolerance, tolerance + 2, today);
    if (!out) {
      setNote(`Aucun départ connu autour du début des vacances de ${period.name} (± ${tolerance} j).`);
      setMonth(keyToDate(period.start));
      return;
    }
    if (!roundTrip) {
      onChange({ date: out, returnDate: null });
      setMonth(keyToDate(out));
      setNote(`Aller le ${long(out)} pour les vacances de ${period.name}.`);
      return;
    }
    const backPool = backDays.size > 0 ? backDays : outDays;
    const back = nearest(backPool, period.lastDay, tolerance + 2, tolerance, addDaysKey(out, 1));
    onChange({ date: out, returnDate: back });
    setMonth(keyToDate(out));
    setNote(
      back
        ? `${period.name} : aller le ${long(out)}, retour le ${long(back)} (${diffDays(out, back)} jours).`
        : `${period.name} : aller le ${long(out)}. Aucun retour connu autour de la reprise, choisissez-le dans le calendrier.`,
    );
  };

  const zoneTone: Record<SchoolZone, string> = {
    A: "batogo-zone-a",
    B: "batogo-zone-b",
    C: "batogo-zone-c",
  };

  const headerBlock = (
        <div className="flex flex-col gap-3 border-b border-border/60 px-5 pb-2.5 pr-14 pt-3 md:flex-row md:pr-5 md:pb-3 md:pt-4 md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              {field === "out" ? "Date d'aller" : "Date de retour"}
              {pairLabel ? <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {pairLabel}</span> : null}
            </p>
            <p className="mt-1 truncate text-lg font-semibold tracking-tight">
              {date ? long(date) : "Quand partez-vous ?"}
              {roundTrip ? (
                <span className="text-muted-foreground">
                  {" "}→ {returnDate ? long(returnDate) : "retour"}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Zones de vacances scolaires">
            <Backpack className="mr-1 size-3.5 text-muted-foreground" aria-hidden />
            {(["A", "B", "C"] as SchoolZone[]).map((item) => {
              const on = holidaysOn && zones.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={on}
                  title={`Vacances zone ${item} · ${SCHOOL_ZONES[item].cities}`}
                  onClick={() => (holidaysOn || !zones.includes(item) ? toggleZone(item) : onHolidaysChange(true))}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition ${on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <span className={`size-1.5 rounded-full ${zoneTone[item]}-dot`} aria-hidden />
                  {item}
                </button>
              );
            })}
          </div>
        </div>
  );
  const bodyBlock = (
    <>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Souplesse</span>
          <div className="flex flex-1 rounded-full bg-muted/60 p-0.5 md:flex-none" role="radiogroup" aria-label="Souplesse sur la date d'aller">
            {[0, 1, 2, 3].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={flexDays === value}
                onClick={() => onChange({ flexDays: value })}
                className={`h-7 flex-1 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold transition ${flexDays === value ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {value === 0 ? "Exacte" : `± ${value} j`}
              </button>
            ))}
          </div>
        </div>

        {holidaysOn && zones.length ? (
          <div className="space-y-1.5">
            <p className="truncate text-[10px] text-muted-foreground">
              {zones.map((z, i) => (
                <span key={z}>
                  {i > 0 ? " · " : ""}
                  <strong className="font-semibold text-foreground">Zone {z}</strong> {SCHOOL_ZONES[z].cities}
                </span>
              ))}
            </p>
            {periods.length ? (
              <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Partir pendant les vacances">
                {dedupedPeriods.map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => pickPeriod(period)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[11px] transition hover:border-primary hover:bg-primary/5 active:scale-95"
                  >
                    <span className="font-semibold">{period.name}</span>
                    <span className="tabular-nums text-muted-foreground">· {short(period.start)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground max-md:hidden">Touchez A, B ou C pour partir pendant les vacances en un geste.</p>
        )}

        {nextEmpty ? (
          <SalesAlertForm
            periodLabel={`${nextEmpty.name} · ${short(nextEmpty.start)} → ${short(nextEmpty.lastDay)}`}
            periodStart={nextEmpty.start}
            periodEnd={nextEmpty.lastDay}
            fromLabel={pairLabel?.split(" → ")[0] ?? null}
            toLabel={pairLabel?.split(" → ")[1] ?? null}
          />
        ) : null}

        <Calendar
          mode="single"
          locale={fr}
          weekStartsOn={1}
          numberOfMonths={isMobile || inline ? 1 : 2}
          showOutsideDays={false}
          month={month}
          onMonthChange={setMonth}
          startMonth={keyToDate(today)}
          endMonth={endMonth}
          selected={activeValue ? keyToDate(activeValue) : undefined}
          onSelect={(day) => {
            if (day) pick(dateToKey(day));
          }}
          hidden={(day) => dateToKey(day) < today}
          disabled={(day) => {
            const key = dateToKey(day);
            if (key < today) return true;
            if (field === "ret" && date && key < date) return true;
            return !activeDays.has(key);
          }}
          modifiers={{
            avail: (day) => activeDays.has(dateToKey(day)),
            zoneA: (day) => inZone("A", dateToKey(day)),
            zoneB: (day) => inZone("B", dateToKey(day)),
            zoneC: (day) => inZone("C", dateToKey(day)),
            out: (day) => dateToKey(day) === date,
            ret: (day) => roundTrip && dateToKey(day) === returnDate,
            between: (day) => {
              const key = dateToKey(day);
              return hasRange && key > date! && key < returnDate!;
            },
            flex: (day) => {
              if (field !== "out" || !date || flexDays === 0) return false;
              return Math.abs(diffDays(date, dateToKey(day))) <= flexDays;
            },
          }}
          modifiersClassNames={{
            avail: "batogo-day-avail",
            zoneA: "batogo-zone-a",
            zoneB: "batogo-zone-b",
            zoneC: "batogo-zone-c",
            out: "batogo-day-out",
            ret: "batogo-day-ret",
            between: "batogo-day-between",
            flex: "batogo-day-flex",
          }}
          className="batogo-calendar w-full !p-0 [--cell-size:min(2.6rem,calc((100vw_-_3rem_-_1.5rem)/7))] md:[--cell-size:2.6rem]"
          classNames={{ months: "relative flex flex-col gap-4 md:flex-row md:gap-8", root: "w-full" }}
        />

        {note ? <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">{note}</p> : null}
        {suggestion ? (
          <button
            type="button"
            onClick={() => pick(suggestion)}
            className="w-full rounded-xl bg-warning/15 px-3 py-2 text-left text-xs text-warning-foreground"
          >
            Pas de départ le {long(activeValue!)}. Le plus proche : <strong>{long(suggestion)}</strong>{" "}
            (cliquez pour le choisir).
          </button>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> départ possible
          </span>
          {shownZones.map((z) => (
            <span key={z} className="inline-flex items-center gap-1">
              <span className={`h-1 w-3 rounded-full ${zoneTone[z]}-dot`} aria-hidden /> zone {z}
            </span>
          ))}
          {stay !== null && stay >= 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <CalendarDays className="size-3.5 text-primary" aria-hidden />
              {stay} jour{stay > 1 ? "s" : ""} sur place
            </span>
          ) : null}
          {!pairLabel ? <span>Choisissez un trajet pour ne voir que ses jours de départ.</span> : null}
        </div>
    </>
  );
  const footerBlock = (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 bg-muted/40 px-5 py-3.5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                onChange({ date: null, returnDate: null, flexDays: 0 });
                onFieldChange("out");
                setNote(null);
              }}
              className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
            >
              Appliquer
            </button>
          </div>
        </div>
  );

  const legTabs = (
    <div className={`grid gap-1.5 ${roundTrip ? "grid-cols-2" : "grid-cols-1"}`} role="tablist" aria-label="Date à choisir">
      {(roundTrip ? (["out", "ret"] as CalendarField[]) : (["out"] as CalendarField[])).map((f) => {
        const on = field === f;
        const value = f === "out" ? date : returnDate;
        return (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={f === "ret" && !date}
            onClick={() => onFieldChange(f)}
            className={`flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-3 text-left text-xs transition disabled:opacity-50 ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/50"}`}
          >
            <span className="shrink-0 font-bold">{f === "out" ? "Aller" : "Retour"}</span>
            <span className={`min-w-0 truncate font-semibold ${value ? "text-foreground" : ""}`}>
              {value ? short(value) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (inline) {
    return (
      <div className="space-y-2">
        {legTabs}
        <div className="flex items-center justify-end gap-1" role="group" aria-label="Zones de vacances scolaires">
          <span className="mr-auto text-[11px] font-semibold text-muted-foreground">
            {field === "out" ? "Touchez votre jour de départ" : "Touchez votre jour de retour"}
          </span>
          <Backpack className="mr-1 size-3.5 text-muted-foreground" aria-hidden />
          {(["A", "B", "C"] as SchoolZone[]).map((item) => {
            const on = holidaysOn && zones.includes(item);
            return (
              <button
                key={item}
                type="button"
                aria-pressed={on}
                title={`Vacances zone ${item} · ${SCHOOL_ZONES[item].cities}`}
                onClick={() => (holidaysOn || !zones.includes(item) ? toggleZone(item) : onHolidaysChange(true))}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition ${on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <span className={`size-1.5 rounded-full ${zoneTone[item]}-dot`} aria-hidden />
                {item}
              </button>
            );
          })}
        </div>
        {bodyBlock}
      </div>
    );
  }

  if (isMobile) {
    return (
      <>
        {anchor}
        <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <SheetPrimitive.Portal>
          {/* Au-dessus du tiroir mobile et de la barre d'onglets. */}
          <SheetPrimitive.Overlay className="fixed inset-0 z-[90] bg-foreground/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <SheetPrimitive.Content
            aria-describedby={undefined}
            className="batogo-cal-pop fixed inset-x-0 bottom-0 z-[95] flex h-[92dvh] flex-col rounded-t-3xl border-t border-border/60 bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetPrimitive.Title className="sr-only">Choisir les dates</SheetPrimitive.Title>
            <SheetPrimitive.Close className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Fermer">
              <X className="size-4" />
            </SheetPrimitive.Close>
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
            <div className="shrink-0">{headerBlock}</div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">{bodyBlock}</div>
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{footerBlock}</div>
          </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="batogo-cal-pop w-[640px] max-h-[var(--radix-popover-content-available-height)] max-w-[calc(100vw-1.5rem)] space-y-4 overflow-y-auto overscroll-contain rounded-2xl border-border/60 p-0 shadow-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {headerBlock}
        <div className="space-y-3 px-5">{bodyBlock}</div>
        {footerBlock}
      </PopoverContent>
    </Popover>
  );
}
