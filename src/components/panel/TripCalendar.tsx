import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fr } from "react-day-picker/locale";
import { Backpack, CalendarDays, Check } from "lucide-react";
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
  holidaysOpen?: boolean;
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
  holidaysOpen = false,
  anchor,
}: TripCalendarProps) {
  const [vacOpen, setVacOpen] = useState(false);
  const [zone, setZone] = useState<SchoolZone | null>(null);
  const [month, setMonth] = useState<Date>(() => keyToDate(date ?? today));
  const [note, setNote] = useState<string | null>(null);
  // Période de vacances choisie alors qu'aucune traversée n'est encore programmée.
  const [emptyPeriod, setEmptyPeriod] = useState<HolidayPeriod | null>(null);

  // La zone choisie est mémorisée dans le navigateur : on ne la redemande pas à chaque visite.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZONE_STORAGE_KEY);
      if (saved === "A" || saved === "B" || saved === "C") setZone(saved);
    } catch {
      // Stockage indisponible : sans conséquence.
    }
  }, []);
  const chooseZone = (next: SchoolZone | null) => {
    setZone(next);
    setNote(null);
    try {
      if (next) window.localStorage.setItem(ZONE_STORAGE_KEY, next);
      else window.localStorage.removeItem(ZONE_STORAGE_KEY);
    } catch {
      // Sans conséquence.
    }
  };

  // Retour : si aucun trajet de retour précis n'est connu, on propose les jours où le réseau a des départs.
  const activeDays = field === "ret" && backDays.size > 0 ? backDays : outDays;
  const periods = useMemo(() => (zone ? holidayPeriods(zone, today) : []), [zone, today]);
  const inHoliday = (key: string) =>
    periods.some((period) => key >= period.start && key <= period.lastDay);

  // On se place sur le bon mois à l'ouverture et au changement de champ.
  useEffect(() => {
    if (!open) return;
    const target = field === "ret" ? (returnDate ?? date) : date;
    const first = [...activeDays.keys()].sort()[0];
    setMonth(keyToDate(target ?? first ?? today));
    setNote(null);
    setVacOpen(holidaysOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  const lastAvailable = [...activeDays.keys()].sort().at(-1);
  const endMonth = keyToDate(lastAvailable ?? addDaysKey(today, 365));

  const pick = (key: string) => {
    setNote(null);
    setEmptyPeriod(null);
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

  const applyPeriod = (period: HolidayPeriod) => {
    if (isUnscheduled(period)) {
      setEmptyPeriod(period);
      setNote(null);
      return;
    }
    setEmptyPeriod(null);
    // On cale l'aller et le retour sur les vrais départs les plus proches du début et de la fin des vacances.
    const out = nearest(outDays, period.start, 3, 3, today);
    const ret = nearest(backDays.size > 0 ? backDays : outDays, period.lastDay, 6, 0, out ?? today);
    const nextDate = out ?? (period.start < today ? today : period.start);
    onChange({ roundTrip: true, date: nextDate, returnDate: ret ?? period.lastDay });
    setMonth(keyToDate(nextDate));
    onFieldChange("out");
    setNote(
      out && ret
        ? `Dates calées sur les départs les plus proches des vacances de ${period.name.toLowerCase()}.`
        : "Aucun départ exact autour de ces dates : dates des vacances conservées, à ajuster.",
    );
  };

  const hasRange = Boolean(date && returnDate && roundTrip);
  const stay = date && returnDate ? diffDays(date, returnDate) : null;
  const activeValue = field === "out" ? date : returnDate;
  const unavailableActive = activeValue ? !activeDays.has(activeValue) : false;
  const suggestion =
    activeValue && unavailableActive ? nearest(activeDays, activeValue, 7, 7, today) : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="max-h-[min(var(--radix-popover-content-available-height),640px)] w-[348px] max-w-[calc(100vw-1.5rem)] space-y-2.5 overflow-y-auto overflow-x-hidden p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Aller / Retour */}
        <div
          className="batogo-tabbar grid grid-cols-2 gap-1 p-1"
          role="tablist"
          aria-label="Date à choisir"
        >
          {(["out", ...(roundTrip ? (["ret"] as const) : [])] as CalendarField[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={field === item}
              data-active={field === item}
              onClick={() => onFieldChange(item)}
              className="batogo-tab px-2 text-left"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {item === "out" ? "Aller" : "Retour"}
              </span>
              <span className="block text-sm">
                {(item === "out" ? date : returnDate)
                  ? long((item === "out" ? date : returnDate)!)
                  : "Choisir"}
              </span>
            </button>
          ))}
          {!roundTrip ? (
            <button
              type="button"
              onClick={() => onChange({ roundTrip: true })}
              className="batogo-tab px-2 text-xs"
            >
              + Ajouter un retour
            </button>
          ) : null}
        </div>

        {/* Vacances scolaires */}
        <div className="rounded-2xl bg-secondary/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Backpack className="size-3.5 text-primary" aria-hidden /> Vacances scolaires
            </span>
            {zone && !vacOpen ? (
              <button
                type="button"
                onClick={() => setVacOpen(true)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold hover:bg-muted"
              >
                Zone {zone} · modifier
              </button>
            ) : (
              <div className="flex gap-1" role="radiogroup" aria-label="Zone de vacances scolaires">
                {([null, "A", "B", "C"] as (SchoolZone | null)[]).map((item) => (
                  <button
                    key={item ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={zone === item}
                    onClick={() => chooseZone(item)}
                    className={`h-9 min-w-10 rounded-full sm:h-7 sm:min-w-9 border px-2 text-[11px] font-bold transition ${zone === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                  >
                    {item ?? "Non"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {zone ? (
            <>
              {vacOpen ? (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  <strong className="text-foreground">{SCHOOL_ZONES[zone].label}</strong> :{" "}
                  {SCHOOL_ZONES[zone].cities}
                </p>
              ) : null}
              <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {periods.map((period) => {
                  const applied =
                    date &&
                    date >= addDaysKey(period.start, -3) &&
                    date <= period.lastDay &&
                    returnDate !== null &&
                    returnDate <= addDaysKey(period.reprise, 0);
                  return (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => applyPeriod(period)}
                      className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition hover:border-primary ${applied ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        {applied ? <Check className="size-3 text-primary" aria-hidden /> : null}
                        {period.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {short(period.start)} → {short(period.lastDay)}
                        {isUnscheduled(period) ? " · à venir" : ""}
                      </span>
                    </button>
                  );
                })}
                {periods.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">Aucune période à venir.</span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Choisissez votre zone : les vacances s’affichent dans le calendrier et se règlent en
              un clic.
            </p>
          )}
        </div>

        {emptyPeriod ? (
          <SalesAlertForm
            periodLabel={`${emptyPeriod.name} · ${short(emptyPeriod.start)} → ${short(emptyPeriod.lastDay)}`}
            periodStart={emptyPeriod.start}
            periodEnd={emptyPeriod.lastDay}
            fromLabel={pairLabel?.split(" → ")[0] ?? null}
            toLabel={pairLabel?.split(" → ")[1] ?? null}
          />
        ) : null}

        {/* Calendrier */}
        <Calendar
          mode="single"
          locale={fr}
          weekStartsOn={1}
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
            holiday: (day) => inHoliday(dateToKey(day)),
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
            holiday: "batogo-day-holiday",
            out: "batogo-day-out",
            ret: "batogo-day-ret",
            between: "batogo-day-between",
            flex: "batogo-day-flex",
          }}
          className="!p-0 [--cell-size:min(2.75rem,calc((100vw_-_3rem_-_1.5rem)/7))]"
        />

        {/* Aides intelligentes */}
        {note ? (
          <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">{note}</p>
        ) : null}
        {suggestion ? (
          <button
            type="button"
            onClick={() => pick(suggestion)}
            className="w-full rounded-xl bg-warning/15 px-3 py-2 text-left text-xs text-warning-foreground"
          >
            Pas de départ le {long(activeValue!)}. Le plus proche :{" "}
            <strong>{long(suggestion)}</strong> (cliquez pour le choisir).
          </button>
        ) : null}
        {stay !== null && stay >= 0 ? (
          <p className="text-center text-xs font-semibold">
            <CalendarDays className="mr-1 inline size-3.5 text-primary" aria-hidden />
            {stay} jour{stay > 1 ? "s" : ""} sur place
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> départ possible
          </span>
          {zone ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded bg-warning/40" aria-hidden /> vacances zone {zone}
            </span>
          ) : null}
          <span>
            {pairLabel
              ? `Seuls les jours avec départ ${pairLabel} sont proposés.`
              : "Choisissez un trajet pour ne voir que ses jours de départ."}
          </span>
        </div>

        {/* Souplesse */}
        <div className="flex items-center justify-between gap-2 border-t pt-2.5">
          <span className="text-xs font-semibold">Aller flexible</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Souplesse sur la date d'aller">
            {[0, 1, 2, 3].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={flexDays === value}
                onClick={() => onChange({ flexDays: value })}
                className={`h-9 min-w-10 rounded-full sm:h-7 sm:min-w-9 border px-2 text-[11px] font-bold transition ${flexDays === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                {value === 0 ? "Exact" : `± ${value} j`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onChange({ date: null, returnDate: null, flexDays: 0 });
              onFieldChange("out");
              setNote(null);
            }}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Effacer les dates
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Terminer
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
