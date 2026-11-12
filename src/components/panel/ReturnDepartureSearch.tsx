import { useEffect, useState } from "react";
import { CalendarDays, Search, Ship } from "lucide-react";
import { useReturnDepartures } from "@/lib/ferry/journey";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { VesselAlertTag } from "./VesselAlert";
import { tr } from "@/lib/i18n";

const WEEKS = [
  { label: "Tous", days: 0 },
  { label: "1 sem", days: 7 },
  { label: "2 sem", days: 14 },
  { label: "3 sem", days: 21 },
  { label: "1 mois", days: 30 },
];
const dayKey = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function ReturnDepartureSearch({ departureId, selectedId, onChoose, disabled = false, outboundAt }: {
  departureId: string;
  /** Date de l'aller : affiche les pastilles « 1 sem, 2 sem… » (3 semaines par défaut). */
  outboundAt?: string | undefined;
  selectedId?: string | null;
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [date, setDate] = useState("");
  const [after, setAfter] = useState<number>(0);
  const [anyPort, setAnyPort] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const span = !date && outboundAt && after ? `>${dayKey(outboundAt, after)}` : date;
  const returns = useReturnDepartures(departureId, debounced, span, !anyPort);
  const shown = anyPort ? returns.data : returns.data?.slice(0, 6);

  return <div className="grid gap-2">
    {outboundAt ? <div className="bw-return-weeks" role="group" aria-label={tr("ui.returnDepartureSearch.dureeDuSejour")}>
      {WEEKS.map((item) => <button key={item.days} type="button" aria-pressed={!date && after === item.days} onClick={() => { setDate(""); setAfter(item.days); }}>{item.label}</button>)}
    </div> : null}
    {anyPort ? <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
      <Search size={16} className="shrink-0 text-primary" aria-hidden />
      <span className="sr-only">{tr("ui.returnDepartureSearch.rechercherUnRetourParPort")}</span>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("ui.returnDepartureSearch.portCompagnieOuNavire")} className="min-w-0 flex-1 bg-transparent py-2 outline-none" autoComplete="off" />
    </label> : null}
    <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
      <CalendarDays size={16} className="shrink-0 text-primary" aria-hidden />
      <span className="text-xs text-muted-foreground">{outboundAt ? tr("ui.returnDepartureSearch.autreDate") : tr("ui.returnDepartureSearch.dateDuRetour")}</span>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-right outline-none" />
    </label>
    <div className="grid max-h-56 gap-2 overflow-y-auto" aria-label={tr("ui.returnDepartureSearch.suggestionsDeRetours")}>
      {returns.isPending || search !== debounced ? <p className="py-2 text-xs text-muted-foreground">{tr("ui.returnDepartureSearch.rechercheDesRetours")}</p>
        : returns.isError ? <p role="alert" className="py-2 text-xs text-destructive">{tr("ui.returnDepartureSearch.lesRetoursSontIndisponiblesPour")}</p>
        : shown?.length ? shown.map((item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={selectedId === item.id} onClick={() => onChoose(item.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left text-xs hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary/5">
          <span className="min-w-0"><strong className="block truncate text-sm">{item.from_name} → {item.to_name}</strong>
            <span className="block text-muted-foreground">{formatDateTime(item.departure_at, portTimeZone({ country_code: item.from_country_code }))}</span>
            <span className="block truncate text-muted-foreground">{[item.company_name, item.vessel_name].filter(Boolean).join(" · ") || tr("ui.returnDepartureSearch.compagnieAConfirmer")} <VesselAlertTag vesselId={item.vessel_id} /></span>
          </span><Ship size={17} className="shrink-0 text-primary" aria-hidden />
        </button>) : <p className="py-2 text-xs text-muted-foreground">{!date && after ? tr("ui.returnDepartureSearch.lesCompagniesNOntPas") : tr("ui.returnDepartureSearch.aucunRetourPublieAvecCes")}</p>}
    </div>
    {!anyPort && !date && (returns.data?.length ?? 0) > 6 ? <p className="text-[11px] text-muted-foreground">{tr("ui.returnDepartureSearch.choisissezUneDatePourVoir")}</p> : null}
    <button type="button" className="justify-self-start text-xs font-semibold text-primary underline underline-offset-2" onClick={() => { setAnyPort((value) => !value); setSearch(""); }}>{anyPort ? tr("ui.returnDepartureSearch.revenirParLaMemeLigne") : tr("ui.returnDepartureSearch.revenirParUnAutrePort")}</button>
    {anyPort && !search && !date && returns.data?.length === 40 ? <p className="text-[11px] text-muted-foreground">{tr("ui.returnDepartureSearch.affichageDes40PremiersDeparts")}</p> : null}
  </div>;
}
