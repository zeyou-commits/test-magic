import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fr } from "react-day-picker/locale";
import { Backpack, CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
  anchor: ReactNode;
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
}: TripCalendarProps) {
  const [zones, setZones] = useState<SchoolZone[]>([]);
  const [month, setMonth] = useState<Date>(() => keyToDate(date ?? today));
  const [note, setNote] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Les zones choisies sont mémorisées dans le navigateur.
  useEffect(() => {
    try {
      const saved = (window.localStorage.getItem(ZONE_STORAGE_KEY) ?? "")
        .split(",")
        .filter((z): z is SchoolZone => z === "A" || z === "B" || z === "C");
      setZones(saved);
    } catch {
      // Stockage indisponible : sans conséquence.
    }
  }, []);
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

  const zoneTone: Record<SchoolZone, string> = {
    A: "batogo-zone-a",
    B: "batogo-zone-b",
    C: "batogo-zone-c",
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="batogo-cal-pop w-[348px] max-w-[calc(100vw-1.5rem)] space-y-4 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl md:w-[640px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* En-tête : étape en cours + zones de vacances */}
        <div className="flex flex-col gap-3 border-b border-border/60 px-5 pb-4 pt-5 md:flex-row md:items-end md:justify-between">
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
        <div className="space-y-4 px-5">

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
          numberOfMonths={isMobile ? 1 : 2}
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Souplesse</span>
            <div className="flex rounded-full bg-background p-0.5 shadow-sm ring-1 ring-border/60" role="radiogroup" aria-label="Souplesse sur la date d'aller">
              {[0, 1, 2, 3].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={flexDays === value}
                  onClick={() => onChange({ flexDays: value })}
                  className={`h-7 min-w-11 rounded-full px-2.5 text-[11px] font-semibold transition ${flexDays === value ? "bg-foreground text-background shadow" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {value === 0 ? "Exact" : `± ${value} j`}
                </button>
              ))}
            </div>
          </div>
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
      </PopoverContent>
    </Popover>
  );
}
