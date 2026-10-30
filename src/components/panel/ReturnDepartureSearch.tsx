import { useEffect, useState } from "react";
import { CalendarDays, Search, Ship } from "lucide-react";
import { useReturnDepartures } from "@/lib/ferry/journey";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { VesselAlertTag } from "./VesselAlert";

export function ReturnDepartureSearch({ departureId, selectedId, onChoose, disabled = false }: {
  departureId: string;
  selectedId?: string | null;
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [date, setDate] = useState("");
  const [anyPort, setAnyPort] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const returns = useReturnDepartures(departureId, debounced, date, !anyPort);
  const shown = anyPort ? returns.data : returns.data?.slice(0, 5);

  return <div className="grid gap-2">
    {anyPort ? <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
      <Search size={16} className="shrink-0 text-primary" aria-hidden />
      <span className="sr-only">Rechercher un retour par port, compagnie ou navire</span>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Port, compagnie ou navire" className="min-w-0 flex-1 bg-transparent py-2 outline-none" autoComplete="off" />
    </label> : null}
    <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
      <CalendarDays size={16} className="shrink-0 text-primary" aria-hidden />
      <span className="text-xs text-muted-foreground">Date du retour</span>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-right outline-none" />
    </label>
    <div className="grid max-h-56 gap-2 overflow-y-auto" aria-label="Suggestions de retours">
      {returns.isPending || search !== debounced ? <p className="py-2 text-xs text-muted-foreground">Recherche des retours…</p>
        : returns.isError ? <p role="alert" className="py-2 text-xs text-destructive">Les retours sont indisponibles pour le moment.</p>
        : shown?.length ? shown.map((item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={selectedId === item.id} onClick={() => onChoose(item.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left text-xs hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary/5">
          <span className="min-w-0"><strong className="block truncate text-sm">{item.from_name} → {item.to_name}</strong>
            <span className="block text-muted-foreground">{formatDateTime(item.departure_at, portTimeZone({ country_code: item.from_country_code }))}</span>
            <span className="block truncate text-muted-foreground">{[item.company_name, item.vessel_name].filter(Boolean).join(" · ") || "Compagnie à confirmer"} <VesselAlertTag vesselId={item.vessel_id} /></span>
          </span><Ship size={17} className="shrink-0 text-primary" aria-hidden />
        </button>) : <p className="py-2 text-xs text-muted-foreground">Aucun retour publié avec ces critères. Essayez une autre date, un port ou une compagnie.</p>}
    </div>
    {!anyPort && !date && (returns.data?.length ?? 0) > 5 ? <p className="text-[11px] text-muted-foreground">Choisissez une date pour voir les autres départs.</p> : null}
    <button type="button" className="justify-self-start text-xs font-semibold text-primary underline underline-offset-2" onClick={() => { setAnyPort((value) => !value); setSearch(""); }}>{anyPort ? "Revenir par la même ligne" : "Revenir par un autre port"}</button>
    {anyPort && !search && !date && returns.data?.length === 40 ? <p className="text-[11px] text-muted-foreground">Affichage des 40 premiers départs. Saisissez une date ou un nom pour chercher plus loin.</p> : null}
  </div>;
}
