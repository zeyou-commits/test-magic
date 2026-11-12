import { formatDuration } from "@/lib/ferry/format";
import { lineCalendar } from "@/lib/ferry/lineCalendar";
import { zoneLabel } from "@/lib/ferry/time";
import type { Company, Departure } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

/** Jours et heures de la ligne, calculés depuis les prochains départs publiés. */
export function LineCalendar({
  departures,
  companies,
  timeZone,
}: {
  departures: Departure[];
  companies: Pick<Company, "id" | "name">[];
  timeZone: string;
}) {
  const entries = lineCalendar(departures, timeZone);
  if (!entries.length)
    return <p className="text-sm text-muted-foreground">{tr("ui.lineCalendar.aucunDepartPubliePourLe")}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.companyId} className="rounded-xl border border-border bg-card p-3 text-sm">
          <p className="flex items-baseline justify-between gap-2 font-semibold">
            {companies.find((company) => company.id === entry.companyId)?.name ?? tr("ui.lineCalendar.compagnie")}
            <span className="shrink-0 font-normal text-muted-foreground">
              {formatDuration(entry.durationMinutes)}
            </span>
          </p>
          <ul className="mt-1 grid gap-0.5 text-muted-foreground">
            {entry.slots.map((slot) => (
              <li key={slot.time}>
                <b className="font-medium text-foreground">{slot.time}</b> · {slot.days.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        {tr("ui.lineCalendar.heuresDeDepartDuPort")}{zoneLabel(timeZone)}{tr("ui.lineCalendar.selonLesProchainsDepartsPublies")}
      </p>
    </div>
  );
}
