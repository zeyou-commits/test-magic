                        }`}>
                          <span>
                            <span className="block text-xs font-semibold">{formatDay(date)} · {formatTime(departure.departure_at)}</span>
                            <span className="block text-[10px] text-muted-foreground">{from.name} → {to.name}</span>
                          </span>
                          <ArrowRight className="size-4 text-primary" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucune traversée France → Algérie trouvée autour des vacances de cette zone.</p>
                )
              )}
            </section>
          ) : null}

          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={submit}
            disabled={!outboundDate || (!zone && (!fromId || !toId)) || Boolean(tripMode === "roundtrip" && returnDate && (!returnFromId || !returnToId || returnDate < outboundDate))}
          >
            <CalendarDays className="size-4" />
            Trouver ma traversée
          </Button>

          {schoolInfo ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs">
              <span className="font-semibold">Calendrier scolaire :</span>{" "}
              {schoolInfo.outbound ? `aller pendant les vacances de ${schoolInfo.outbound}` : ""}
              {schoolInfo.outbound && schoolInfo.return ? " · " : ""}
              {schoolInfo.return ? `retour pendant les vacances de ${schoolInfo.return}` : ""}
            </div>
          ) : null}

          {searched ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Suggestion Batogo</p>
              {outbound ? <Recommendation title="Aller recommandé" leg={outbound} from={portName(fromId)} to={portName(toId)} date={outboundDate} selection={selection} onSelect={onSelect} /> : <EmptyRecommendation text="Aucune traversée programmée pour l’aller à cette date." />}
              {tripMode === "roundtrip" && returnDate ? inbound ? <Recommendation title="Retour recommandé" leg={inbound} from={portName(returnFromId)} to={portName(returnToId)} date={returnDate} selection={selection} onSelect={onSelect} /> : <EmptyRecommendation text="Aucune traversée programmée pour le retour à cette date." /> : null}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Recommandation basée sur les horaires disponibles, la durée et le profil voyageur. Les tarifs ne sont pas encore pris en compte.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DateField({ label, value, min, onChange, optional = false, availableDates }: { label: string; value: string; min: string; onChange: (value: string) => void; optional?: boolean; availableDates: Set<string> }) {
  return <label className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">{label}{optional ? " · optionnel" : ""}</span><Input type="date" min={min} value={value} onChange={(event) => onChange(event.target.value)} className="bg-background/70" /><span className="text-[10px] text-muted-foreground">{availableDates.size} date(s) de traversée connues</span></label>;
}

function countDeparturesForDate(date: string, fromId: string, toId: string, routes: RouteLine[], departures: Departure[]) {
  return departures.filter((departure) => {
    if (departure.departure_at.slice(0, 10) !== date) return false;
    const route = routes.find((item) => item.id === departure.route_id);
    return Boolean(route && (!fromId || route.departure_port_id === fromId) && (!toId || route.arrival_port_id === toId));
  }).length;
}

function formatCalendarDate(value: string) {
  return toDate(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function addDays(value: string, amount: number) { const date = new Date(value + "T00:00:00"); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }

function findActualDeparture(date: string, fromId: string, toId: string, routes: RouteLine[], departures: Departure[], companyNames: Map<string, string>, companyLogos: Map<string, string | null>, traveler: TravelerType): LegRecommendation | null {
  const candidates = departures.filter((departure) => departure.departure_at.slice(0, 10) === date).map((departure) => {
    const route = routes.find((item) => item.id === departure.route_id);
    if (!route || route.departure_port_id !== fromId || route.arrival_port_id !== toId) return null;
    const hour = Number(departure.departure_at.slice(11, 13)) + Number(departure.departure_at.slice(14, 16)) / 60;
    const duration = departure.duration_minutes ?? route.typical_duration_minutes ?? 9999;
    let penalty = 0; if (traveler === "family" && (hour < 7 || hour >= 22)) penalty += 80; else if (traveler === "couple" && hour < 6) penalty += 35; else if (traveler === "solo" && hour < 5) penalty += 20;
    return { route, schedule: { id: departure.id, route_id: route.id, company_id: departure.company_id, default_vessel_id: departure.vessel_id, departure_time: departure.departure_at.slice(11, 19), duration_minutes: duration, weekdays: [], valid_from: date, valid_to: date, status: "active" as const, source_name: departure.source_name, source_url: departure.source_url, last_verified_at: departure.last_verified_at, reliability: departure.reliability, notes: departure.notes, is_demo: departure.is_demo }, companyName: companyNames.get(departure.company_id) ?? "Compagnie", companyLogoUrl: companyLogos.get(departure.company_id) ?? null, score: duration + penalty };
  }).filter(Boolean) as LegRecommendation[];
  return candidates.sort((a, b) => a.score - b.score)[0] ?? null;
}

function PortSelect({ label, value, onChange, ports }: { label: string; value: string; onChange: (value: string) => void; ports: Port[] }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value || ANY} onValueChange={(next) => onChange(next === ANY ? "" : next)}>
        <SelectTrigger className="bg-background/70"><SelectValue placeholder="Choisir un port" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Choisir un port</SelectItem>
          {ports.map((port) => <SelectItem key={port.id} value={port.id}>{port.name}{port.city ? ` · ${port.city}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function Recommendation({ title, leg, from, to, date, selection, onSelect }: { title: string; leg: LegRecommendation; from: string; to: string; date: string; selection: Selection | null; onSelect: (selection: Selection | null) => void }) {
  return (
    <button type="button" onClick={() => onSelect(selection?.type === "route" && selection.id === leg.route.id ? null : { type: "route", id: leg.route.id })} className="w-full rounded-2xl border border-primary/20 bg-background/85 p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">{title}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{formatDay(date)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="min-w-0 truncate">{from}</span>
        <ArrowRight className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate">{to}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><span className="block text-muted-foreground">Départ</span><strong>{formatTime(leg.schedule.departure_time)}</strong></div>
        <div><span className="block text-muted-foreground">Durée</span><strong>{formatDuration(leg.schedule.duration_minutes)}</strong></div>
        <div><span className="block text-muted-foreground">Compagnie</span><div className="mt-0.5 flex items-center gap-1.5"><span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background">{leg.companyLogoUrl ? <img src={leg.companyLogoUrl} alt="" className="size-full object-contain p-1" /> : <span className="text-[9px] font-semibold text-muted-foreground">{leg.companyName.slice(0, 2).toUpperCase()}</span>}</span><strong className="block truncate">{leg.companyName}</strong></div></div>
      </div>
    </button>
  );
}

function EmptyRecommendation({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{text}</div>;
}
