import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Plus, Check, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminRoutesQuery,
  adminPortsQuery,
  companiesQuery,
  schedulesQuery,
  adminDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { safeExternalUrl } from "@/components/panel/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";

type Operator = {
  route_id: string;
  company_id: string;
  official_urls?: string[];
  commercial_checked_at?: string | null;
};
export function CommercialPrograms({
  companyId: selectedCompanyId,
  routeId: selectedRouteId,
  onContext,
  onNetwork,
  renderSchedules,
  renderDepartures,
  renderVessels,
}: {
  companyId?: string | undefined;
  routeId?: string | undefined;
  onContext: (company: string, route?: string) => void;
  onNetwork: () => void;
  renderSchedules: (company: string, route: string) => ReactNode;
  renderDepartures: (company: string, route: string) => ReactNode;
  renderVessels: (company: string, ids: string[]) => ReactNode;
}) {
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: departures = [] } = useQuery(adminDeparturesQuery("upcoming"));
  const operators = useQuery({
    queryKey: ["admin", "commercial-operators"],
    queryFn: async () => {
      const result = await supabase.from("route_operators").select("*");
      if (result.error) throw result.error;
      return result.data as unknown as Operator[];
    },
  });
  const companyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const company = companies.find((c) => c.id === companyId);
  const [search, setSearch] = useState("");
  const [addRoute, setAddRoute] = useState("");
  const client = useQueryClient();
  const attach = useMutation({
    mutationFn: async () => {
      const result = await supabase
        .from("route_operators")
        .upsert(
          { route_id: addRoute, company_id: companyId },
          { onConflict: "route_id,company_id", ignoreDuplicates: true },
        );
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "commercial-operators"] });
      void client.invalidateQueries({ queryKey: ["routes"] });
      onContext(companyId, addRoute);
      setAddRoute("");
      toast.success("Liaison rattachée à la compagnie.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const belongs = (id: string) =>
    (operators.data ?? []).some((o) => o.company_id === companyId && o.route_id === id) ||
    schedules.some((s) => s.company_id === companyId && s.route_id === id) ||
    departures.some((d) => d.company_id === companyId && d.route_id === id);
  const name = (id: string) => ports.find((p) => p.id === id)?.name ?? "Port à renseigner";
  const label = (route: (typeof routes)[number]) =>
    `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}`;
  const linked = routes
    .filter((r) => belongs(r.id))
    .sort((a, b) => label(a).localeCompare(label(b), "fr"));
  const displayed = linked.filter((r) =>
    label(r).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")),
  );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <label className="block text-xs font-semibold" htmlFor="commercial-company">
          Compagnie
        </label>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <CompanyBadge name={company?.name} logoUrl={company?.logo_url} size={48} />
          <select
            id="commercial-company"
            value={companyId}
            onChange={(e) => onContext(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm font-bold"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{linked.length} ligne(s)</span>
          <span>
            {
              departures.filter((d) => d.company_id === companyId && d.status !== "cancelled")
                .length
            }{" "}
            départ(s) à venir
          </span>
          {safeExternalUrl(company?.website_url) && (
            <a
              className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline"
              href={safeExternalUrl(company?.website_url)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Site de la compagnie <ExternalLink size={13} />
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ouvrez une ligne pour mettre à jour son programme commercial. Les ports et les tracés
          restent gérés dans le réseau général.
        </p>
      </div>
      <Input
        aria-label="Rechercher une ligne commerciale"
        placeholder="Rechercher un port ou une liaison"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {operators.error && (
        <p role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
          Les rattachements commerciaux n’ont pas pu être chargés.{" "}
          <button className="underline" onClick={() => void operators.refetch()}>
            Réessayer
          </button>
        </p>
      )}
      {displayed.map((route) => {
        const open = selectedRouteId === route.id;
        const rows = departures.filter(
          (d) => d.route_id === route.id && d.company_id === companyId,
        );
        const programs = schedules.filter(
          (s) => s.route_id === route.id && s.company_id === companyId,
        );
        const operator = operators.data?.find(
          (o) => o.route_id === route.id && o.company_id === companyId,
        );
        const vesselIds = [
          ...new Set(
            [...rows.map((d) => d.vessel_id), ...programs.map((s) => s.default_vessel_id)].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ];
        return (
          <section
            key={`${companyId}:${route.id}`}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`commercial-${route.id}`}
              onClick={() => onContext(companyId, open ? undefined : route.id)}
              className="flex min-h-20 w-full items-center gap-3 p-4 text-left hover:bg-secondary/40"
            >
              <CalendarDays className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">{label(route)}</strong>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {rows.length} départ(s) · {programs.length} calendrier(s)
                  {rows.some((d) => !d.vessel_id && d.status !== "cancelled")
                    ? " · Navire à affecter"
                    : ""}
                  {route.status !== "active" ? " · Ligne hors publication" : ""}
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && (
              <div
                id={`commercial-${route.id}`}
                className="space-y-4 border-t bg-secondary/15 p-3 md:p-4"
              >
                <CommercialRouteBody
                  key={`${companyId}:${route.id}`}
                  companyId={companyId}
                  routeId={route.id}
                  operator={operator}
                  scheduleSources={programs
                    .map((s) => s.source_url)
                    .filter((s): s is string => Boolean(s))}
                  schedules={renderSchedules(companyId, route.id)}
                  departures={renderDepartures(companyId, route.id)}
                  vessels={
                    vesselIds.length ? (
                      renderVessels(companyId, vesselIds)
                    ) : (
                      <p className="p-3 text-sm text-muted-foreground">
                        Aucun navire affecté. Choisissez un navire dans le calendrier ou dans le
                        départ.
                      </p>
                    )
                  }
                  durationMinutes={route.typical_duration_minutes}
                  timezone={portTimeZone(ports.find((p) => p.id === route.departure_port_id))}
                />
              </div>
            )}
          </section>
        );
      })}
      {!displayed.length && (
        <p className="rounded-xl border p-4 text-sm">
          {operators.isPending
            ? "Chargement des lignes…"
            : "Aucune ligne ne correspond. Rattachez une ligne du réseau à cette compagnie."}
        </p>
      )}
      <details className="rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Ajouter une ligne à cette compagnie
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Ce rattachement ne crée aucun horaire ni départ.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            aria-label="Liaison du réseau à rattacher"
            className="min-h-10 min-w-0 flex-1 rounded-xl border bg-background px-2 text-xs"
            value={addRoute}
            onChange={(e) => setAddRoute(e.target.value)}
          >
            <option value="">Choisir dans le réseau général</option>
            {routes
              .filter((r) => !belongs(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {label(r)}
                </option>
              ))}
          </select>
          <Button
            disabled={!companyId || !addRoute || attach.isPending || Boolean(operators.error)}
            onClick={() => attach.mutate()}
          >
            <Plus size={14} />
            Rattacher
          </Button>
        </div>
        <button
          type="button"
          className="mt-3 min-h-9 text-xs font-semibold text-primary underline"
          onClick={onNetwork}
        >
          Créer ou modifier une ligne dans le réseau général
        </button>
      </details>
    </div>
  );
}

function CommercialRouteBody({
  companyId,
  routeId,
  operator,
  scheduleSources,
  schedules,
  departures,
  vessels,
  timezone,
  durationMinutes,
}: {
  companyId: string;
  routeId: string;
  operator: Operator | undefined;
  scheduleSources: string[];
  schedules: ReactNode;
  departures: ReactNode;
  vessels: ReactNode;
  timezone: string;
  durationMinutes: number | null;
}) {
  const [tab, setTab] = useState("departures");
  return (
    <>
      <OfficialSources
        companyId={companyId}
        routeId={routeId}
        operator={operator}
        scheduleSources={scheduleSources}
      />
      <div
        className="grid grid-cols-3 rounded-xl border bg-card p-1"
        aria-label="Contenu de la liaison"
      >
        {[
          ["departures", "Départs / arrivées"],
          ["schedules", "Calendriers"],
          ["vessels", "Navires & photos"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value!)}
            className={`min-h-11 rounded-lg px-1 text-[11px] font-semibold ${tab === value ? "bg-primary text-white" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "departures" ? (
        <>
          <QuickDeparture
            companyId={companyId}
            routeId={routeId}
            timezone={timezone}
            durationMinutes={durationMinutes}
          />
          {departures}
        </>
      ) : tab === "schedules" ? (
        schedules
      ) : (
        vessels
      )}
    </>
  );
}

function OfficialSources({
  companyId,
  routeId,
  operator,
  scheduleSources,
}: {
  companyId: string;
  routeId: string;
  operator: Operator | undefined;
  scheduleSources: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [urls, setUrls] = useState((operator?.official_urls ?? []).join("\n"));
  const client = useQueryClient();
  const links = [...new Set([...(operator?.official_urls ?? []), ...scheduleSources])].filter(
    (url) => /^https:\/\//i.test(url) && safeExternalUrl(url),
  );
  const save = useMutation({
    mutationFn: async (checked: boolean) => {
      const values = urls
        .split(/\n/)
        .map((u) => u.trim())
        .filter(Boolean);
      if (
        values.length > 6 ||
        values.some(
          (url) => !/^https:\/\//i.test(url) || !safeExternalUrl(url) || url.length > 2048,
        )
      )
        throw new Error("Renseignez jusqu’à 6 liens HTTPS valides, un par ligne.");
      const result = await supabase.from("route_operators").upsert(
        {
          route_id: routeId,
          company_id: companyId,
          ...(checked
            ? { commercial_checked_at: new Date().toISOString() }
            : { official_urls: values, commercial_checked_at: null }),
        } as never,
        { onConflict: "route_id,company_id" },
      );
      if (result.error)
        throw new Error(
          "Enregistrement impossible. Vérifiez la migration des programmes commerciaux et vos droits.",
        );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "commercial-operators"] });
      setEditing(false);
      toast.success("Sources mises à jour.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs">Sources officielles</strong>
        <button
          type="button"
          className="min-h-9 text-xs font-semibold text-primary underline"
          onClick={() => {
            setUrls((operator?.official_urls ?? []).join("\n"));
            setEditing(!editing);
          }}
        >
          Gérer les liens
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold text-primary"
          >
            <ExternalLink size={12} className="shrink-0" />
            Source {i + 1} · <span className="truncate">{new URL(url).hostname}</span>
          </a>
        ))}
      </div>
      {!links.length && (
        <p className="text-xs text-muted-foreground">
          Ajoutez vos liens vers les horaires et réservations officiels.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {operator?.commercial_checked_at
            ? `Dernier contrôle manuel : ${new Date(operator.commercial_checked_at).toLocaleDateString("fr-FR")}`
            : "À contrôler sur le site officiel"}
        </span>
        <button
          type="button"
          disabled={!links.length || save.isPending}
          onClick={() => save.mutate(true)}
          className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary disabled:opacity-40"
        >
          <Check size={12} />
          J’ai contrôlé les sources
        </button>
      </div>
      {editing && (
        <div className="mt-2 space-y-2">
          <label className="block text-xs">
            Liens officiels · un par ligne
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              maxLength={13000}
              className="mt-1 block min-h-24 w-full rounded-lg border bg-background p-2 text-xs"
              placeholder="https://…"
            />
          </label>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(false)}>
            Enregistrer les liens
          </Button>
        </div>
      )}
    </div>
  );
}

function QuickDeparture({
  companyId,
  routeId,
  timezone,
  durationMinutes,
}: {
  companyId: string;
  routeId: string;
  timezone: string;
  durationMinutes: number | null;
}) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00");
  const [duration, setDuration] = useState(durationMinutes ? String(durationMinutes) : "");
  const [vessel, setVessel] = useState("");
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: async () => {
      const minutes = Number(duration);
      if (!date || !time || !Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
        throw new Error("Vérifiez la date, l’heure et la durée en minutes.");
      const start = zonedTimeToUtc(date, time, timezone);
      if (!Number.isFinite(start.getTime())) throw new Error("Date invalide.");
      const result = await supabase.from("departures").insert({
        route_id: routeId,
        company_id: companyId,
        departure_at: start.toISOString(),
        arrival_at: new Date(start.getTime() + minutes * 60000).toISOString(),
        duration_minutes: minutes,
        vessel_id: vessel || null,
        status: "scheduled",
        reliability: "to_verify",
        is_demo: false,
      });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["departures"] });
      setDate("");
      toast.success("Départ ajouté. Vérifiez la source avant de le marquer vérifié.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <details className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer text-xs font-semibold text-primary">
        Ajouter un départ ponctuel
      </summary>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="text-xs">
          Date locale
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-xs">
          Départ · {timezone}
          <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-xs">
          Durée en minutes
          <Input
            type="number"
            min={1}
            max={10080}
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Navire
          <select
            className="block min-h-10 w-full rounded-lg border bg-background px-2"
            value={vessel}
            onChange={(e) => setVessel(e.target.value)}
          >
            <option value="">À affecter</option>
            {vessels
              .filter((v) => !v.company_id || v.company_id === companyId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        <p className="text-[10px] text-muted-foreground sm:col-span-2">
          L’ajout publie ce départ sur le site. L’arrivée est calculée avec la durée saisie ; les
          alertes d’ouverture restent soumises à validation admin.
        </p>
        <Button type="submit" disabled={create.isPending}>
          Ajouter ce départ
        </Button>
      </form>
    </details>
  );
}
