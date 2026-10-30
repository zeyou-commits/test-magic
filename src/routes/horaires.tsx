import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Map as MapIcon, Search, Share2, Ship, X } from "lucide-react";
import { DataUnavailableNotice } from "@/components/layout/DataUnavailableNotice";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { FollowButton } from "@/components/panel/FollowButton";
import { MakeMyTrip } from "@/components/panel/MakeMyTrip";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { safeExternalUrl } from "@/components/panel/shared";
import { defaultTripProfile } from "@/components/panel/TripProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import {
  boardStatus,
  inPeriod,
  priceSearchHref,
  type BoardStatus,
} from "@/lib/ferry/departureBoard";
import { capitalizeFirst, formatShortDay, formatTime } from "@/lib/ferry/format";
import { estimateFerryFare, formatEuro, formatFareRange } from "@/lib/ferry/pricing";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { dateKeyInZone, portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { buildSailings, type Sailing } from "@/lib/ferry/trips";
import type { Company } from "@/lib/ferry/types";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
import { seoHead } from "@/lib/seo/site";

const BoardMap = lazy(() => import("@/components/board/BoardMap"));

const title = "Départs et arrivées des ferries Europe ↔ Algérie | BledWay";
const description =
  "Les départs et arrivées de ferries vers et depuis l'Algérie : heure locale, navire, compagnie, statut constaté ou prévu et prix indicatif.";
const PAGE_SIZE = 40;
const UUID = /^[\da-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type BoardSearch = {
  from?: string;
  to?: string;
  month?: string;
  kind?: "arrivals";
  period?: string;
  dir?: "toAlgeria" | "fromAlgeria";
  company?: string;
  vessel?: string;
  route?: string;
  q?: string;
  id?: string;
};

export const Route = createFileRoute("/horaires")({
  validateSearch: (search: Record<string, unknown>): BoardSearch => {
    const result: BoardSearch = {};
    const uuid = (key: "from" | "to" | "company" | "vessel" | "route" | "id") => {
      const value = search[key];
      if (typeof value === "string" && UUID.test(value)) result[key] = value;
    };
    (["from", "to", "company", "vessel", "route", "id"] as const).forEach(uuid);
    if (typeof search["month"] === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search["month"]))
      result.month = search["month"];
    if (search["kind"] === "arrivals") result.kind = "arrivals";
    if (search["dir"] === "toAlgeria" || search["dir"] === "fromAlgeria")
      result.dir = search["dir"];
    const period = search["period"];
    if (
      typeof period === "string" &&
      (["today", "tomorrow", "week"].includes(period) || DAY.test(period))
    )
      result.period = period;
    if (typeof search["q"] === "string" && search["q"].length <= 80) result.q = search["q"];
    return result;
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
  },
  head: () => seoHead(title, description, "/horaires"),
  component: BoardPage,
});

const toneClass: Record<BoardStatus["tone"], string> = {
  alert: "bg-red-700 text-white",
  warning: "bg-amber-100 text-amber-900",
  live: "bg-emerald-100 text-emerald-900",
  seen: "bg-sky-100 text-sky-900",
  done: "bg-emerald-700 text-white",
  planned: "bg-secondary text-foreground",
};

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Row = {
  sailing: Sailing;
  status: BoardStatus;
  at: string;
  zone: string;
  dayKey: string;
};

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-xl border px-3 text-[13px] font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"}`}
    >
      {children}
    </button>
  );
}

function BoardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: upcoming } = useSuspenseQuery(upcomingDeparturesQuery());
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);
  const signals = useLiveShips();
  const alerts = useVesselAlerts();
  const isMobile = useIsMobile();
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showMap, setShowMap] = useState(false);
  const [term, setTerm] = useState(search.q ?? "");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const update = (patch: { [Key in keyof BoardSearch]?: BoardSearch[Key] | undefined }) => {
    setVisible(PAGE_SIZE);
    void navigate({
      search: (current) => {
        const next: Record<string, unknown> = { ...current, ...patch };
        Object.keys(next).forEach((key) => next[key] === undefined && delete next[key]);
        return next as BoardSearch;
      },
      replace: true,
      resetScroll: false,
    });
  };
  // La recherche reste fluide : l'adresse partageable suit après la frappe.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((search.q ?? "") !== term) update({ q: term || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const arrivals = search.kind === "arrivals";

  const sailings = useMemo(
    () =>
      buildSailings(
        [...new Map([...recent, ...upcoming].map((d) => [d.id, d])).values()],
        routes,
        ports,
        companies,
        vessels,
      ),
    [recent, upcoming, routes, ports, companies, vessels],
  );

  /** Toutes les lignes du sens choisi, avant les filtres : les compteurs des logos en dépendent. */
  const all = useMemo(() => {
    const signalBy = new Map(signals.map((signal) => [signal.departure.id, signal]));
    const threeHours = 3 * 3_600_000;
    return sailings
      .flatMap((sailing): Row[] => {
        const { departure, from, to } = sailing;
        const live = signalBy.get(departure.id) ?? null;
        const progress = crossingProgress(departure, from, to, live, now);
        const iso = arrivals
          ? (progress.times.arrival.iso ?? departure.arrival_at)
          : departure.departure_at;
        if (!iso || Date.parse(iso) < now - threeHours) return [];
        const zone = portTimeZone(arrivals ? to : from);
        const status = boardStatus({
          departure,
          observedArrival: progress.times.arrival.kind === "observed",
          hold: progress.hold,
          signal: progress.signal,
          shiftMinutes:
            progress.times.departure.shiftMinutes ?? progress.times.arrival.shiftMinutes ?? null,
          alert: departure.vessel_id ? (alerts.get(departure.vessel_id) ?? null) : null,
          now,
        });
        return [{ sailing, status, at: iso, zone, dayKey: dateKeyInZone(iso, zone) }];
      })
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [sailings, signals, alerts, arrivals, now]);

  const today = (zone: string, plus = 0) =>
    dateKeyInZone(new Date(now + plus * 86_400_000).toISOString(), zone);
  const matchesExceptCompany = ({ sailing, zone, dayKey }: Row) => {
    const { from, to, company, vessel } = sailing;
    const isDz = (code: string) => code === "DZ";
    if (search.from && from.id !== search.from) return false;
    if (search.to && to.id !== search.to) return false;
    if (search.month && !dayKey.startsWith(search.month)) return false;
    if (search.dir === "toAlgeria" && !(isDz(to.country_code) && !isDz(from.country_code)))
      return false;
    if (search.dir === "fromAlgeria" && !(isDz(from.country_code) && !isDz(to.country_code)))
      return false;
    if (!inPeriod(dayKey, search.period, today(zone), today(zone, 1), today(zone, 7))) return false;
    const words = norm(term.trim());
    return (
      !words ||
      norm(`${from.name} ${to.name} ${vessel?.name ?? ""} ${company?.name ?? ""}`).includes(words)
    );
  };
  const base = all.filter(matchesExceptCompany);
  const rows = base.filter(
    ({ sailing }) =>
      (!search.company || sailing.company?.id === search.company) &&
      (!search.vessel || sailing.vessel?.id === search.vessel) &&
      (!search.route || sailing.route.id === search.route),
  );

  const counts = new Map<string, { company: Company; count: number }>();
  for (const { sailing } of base) {
    if (!sailing.company) continue;
    const entry = counts.get(sailing.company.id);
    if (entry) entry.count += 1;
    else counts.set(sailing.company.id, { company: sailing.company, count: 1 });
  }
  const chips = [...counts.values()].sort((a, b) => b.count - a.count);

  const company = companies.find((item) => item.id === search.company) ?? null;
  const own = company ? all.filter(({ sailing }) => sailing.company?.id === company.id) : [];
  const ownRoutes = [...new Map(own.map(({ sailing }) => [sailing.route.id, sailing])).values()];
  const ownFleet = [
    ...new Map(
      own.flatMap(({ sailing }) =>
        sailing.vessel ? [[sailing.vessel.id, sailing.vessel] as const] : [],
      ),
    ).values(),
  ];

  const selected = all.find((row) => row.sailing.departure.id === search.id) ?? null;
  const select = (id: string) => update({ id: id === search.id ? undefined : id });

  const routeIds = [...new Set(rows.map(({ sailing }) => sailing.route.id))];
  const selectedAlert = selected?.status.tone === "alert";

  const detail = selected ? <TripDetail row={selected} arrivals={arrivals} now={now} /> : null;
  const map = (
    <ClientOnly fallback={<div className="h-full animate-pulse bg-secondary" />}>
      <Suspense fallback={<div className="h-full animate-pulse bg-secondary" />}>
        <BoardMap
          routes={routes}
          ports={ports}
          routeIds={routeIds}
          selectedRouteId={selected?.sailing.route.id ?? null}
          selectedAlert={selectedAlert}
        />
      </Suspense>
    </ClientOnly>
  );

  const clear = () => {
    setTerm("");
    void navigate({
      search: arrivals ? { kind: "arrivals" } : {},
      replace: true,
      resetScroll: false,
    });
  };
  const anyFilter = Boolean(
    term ||
    search.period ||
    search.dir ||
    search.company ||
    search.vessel ||
    search.route ||
    search.from ||
    search.to ||
    search.month,
  );

  return (
    <>
      <SiteHeader />
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 sm:px-6 md:pb-16"
      >
        <DataUnavailableNotice className="mb-3" />
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Départs &amp; arrivées
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vers et depuis l'Algérie, en heure locale du port. « Prévu » reste un horaire publié,
              « constaté » vient du signal du navire.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search size={16} className="shrink-0 text-primary" aria-hidden />
            <span className="sr-only">Rechercher un port, un navire ou une compagnie</span>
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Port, navire ou compagnie"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div
            className="flex rounded-xl bg-secondary p-1"
            role="group"
            aria-label="Départs ou arrivées"
          >
            {(
              [
                ["", "Départs"],
                ["arrivals", "Arrivées"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={arrivals === (value === "arrivals")}
                onClick={() => update({ kind: value ? "arrivals" : undefined })}
                className={`min-h-9 rounded-lg px-4 text-[13px] transition-colors ${arrivals === (value === "arrivals") ? "bg-card font-bold shadow-sm" : "font-medium"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {(
            [
              ["today", "Aujourd'hui"],
              ["tomorrow", "Demain"],
              ["week", "7 jours"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              on={search.period === value}
              onClick={() => update({ period: search.period === value ? undefined : value })}
            >
              {label}
            </Chip>
          ))}
          <label
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${search.period && DAY.test(search.period) ? "border-primary" : "border-border"} bg-card`}
          >
            Date
            <input
              type="date"
              value={search.period && DAY.test(search.period) ? search.period : ""}
              onChange={(event) => update({ period: event.target.value || undefined })}
              className="bg-transparent text-[13px] font-normal"
            />
          </label>
          {(
            [
              ["toAlgeria", "Vers l'Algérie"],
              ["fromAlgeria", "Depuis l'Algérie"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              on={search.dir === value}
              onClick={() => update({ dir: search.dir === value ? undefined : value })}
            >
              {label}
            </Chip>
          ))}
          {anyFilter ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-[13px] font-semibold text-primary"
            >
              <X size={14} aria-hidden /> Tout effacer
            </button>
          ) : null}
        </div>

        <div
          className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
          role="group"
          aria-label="Filtrer par compagnie"
        >
          {chips.map(({ company: item, count }) => {
            const on = search.company === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  update({ company: on ? undefined : item.id, vessel: undefined, route: undefined })
                }
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border-2 py-1 pl-2 pr-3 text-[13px] font-semibold transition-all hover:-translate-y-px ${on ? "border-primary bg-card shadow-md" : "border-border bg-card/60"}`}
              >
                <CompanyBadge name={item.name} logoUrl={item.logo_url} size={26} />
                {item.name}
                <small className="font-medium text-muted-foreground">{count}</small>
              </button>
            );
          })}
        </div>

        {company ? (
          <section
            key={company.id}
            className="bw-board-rise mt-3 flex flex-wrap gap-x-8 gap-y-4 rounded-2xl border border-border bg-card p-4"
            aria-label={`Compagnie ${company.name}`}
          >
            <div className="min-w-[220px] flex-1">
              <div className="flex items-center gap-3">
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={46} />
                <div>
                  <h2 className="text-lg font-bold">{company.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {ownRoutes.length} ligne{ownRoutes.length > 1 ? "s" : ""} · {ownFleet.length}{" "}
                    navire{ownFleet.length > 1 ? "s" : ""} · {own.length}{" "}
                    {arrivals ? "arrivée" : "départ"}
                    {own.length > 1 ? "s" : ""} à venir
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-primary">
                {safeExternalUrl(company.booking_url ?? company.website_url) ? (
                  <a
                    href={safeExternalUrl(company.booking_url ?? company.website_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Site de la compagnie
                  </a>
                ) : null}
                <Link
                  to="/"
                  search={{ select: "company", id: company.id } as never}
                  className="underline underline-offset-2"
                >
                  Sa fiche et ses contacts
                </Link>
              </div>
            </div>
            <div className="min-w-[260px] flex-[2]">
              <h3 className="mb-2 text-[13px] font-bold">Ses lignes</h3>
              <div className="flex flex-wrap gap-1.5">
                {ownRoutes.map((sailing) => (
                  <Chip
                    key={sailing.route.id}
                    on={search.route === sailing.route.id}
                    onClick={() =>
                      update({
                        route: search.route === sailing.route.id ? undefined : sailing.route.id,
                        vessel: undefined,
                      })
                    }
                  >
                    {sailing.from.name} → {sailing.to.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="min-w-[220px] flex-[2]">
              <h3 className="mb-2 text-[13px] font-bold">Sa flotte</h3>
              <div className="flex flex-wrap gap-1.5">
                {ownFleet.length ? (
                  ownFleet.map((vessel) => (
                    <Chip
                      key={vessel.id}
                      on={search.vessel === vessel.id}
                      onClick={() =>
                        update({
                          vessel: search.vessel === vessel.id ? undefined : vessel.id,
                          route: undefined,
                        })
                      }
                    >
                      {vessel.name}{" "}
                      {alerts.has(vessel.id) ? <b className="ml-1 text-red-600">!</b> : null}
                    </Chip>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Navires à confirmer sur ces traversées.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {isMobile ? (
          <button
            type="button"
            onClick={() => setShowMap((value) => !value)}
            aria-expanded={showMap}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#16324a] text-sm font-semibold text-white"
          >
            <MapIcon size={16} aria-hidden /> {showMap ? "Masquer la carte" : "Voir sur la carte"}
          </button>
        ) : null}
        {isMobile && showMap ? (
          <div className="mt-2 h-72 overflow-hidden rounded-2xl border border-border">{map}</div>
        ) : null}

        <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section
            className="overflow-hidden rounded-2xl border border-border bg-card"
            aria-label={arrivals ? "Arrivées" : "Départs"}
          >
            <p
              className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {rows.length} {arrivals ? "arrivée" : "départ"}
              {rows.length > 1 ? "s" : ""} · prix indicatifs pour 2 adultes et une berline
            </p>
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune traversée publiée pour ces filtres. Essayez une autre date ou une autre
                compagnie.
              </p>
            ) : null}
            <ul>
              {rows.slice(0, visible).map((row) => {
                const { sailing, status } = row;
                const id = sailing.departure.id;
                const open = search.id === id;
                const fare =
                  status.label === "Annulée"
                    ? null
                    : estimateFerryFare(sailing, defaultTripProfile);
                return (
                  <li key={id} className="bw-board-rise border-b border-border last:border-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => select(id)}
                      className={`flex min-h-[68px] w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left transition-colors sm:flex-nowrap sm:px-4 ${open ? "bg-primary/5" : "hover:bg-secondary/50"}`}
                    >
                      <span className="w-[76px] shrink-0">
                        <strong className="block text-lg font-extrabold tabular-nums leading-tight">
                          {formatTime(row.at, row.zone)}
                        </strong>
                        <small className="text-[11px] text-muted-foreground">
                          {capitalizeFirst(formatShortDay(row.at, row.zone))}
                        </small>
                      </span>
                      <CompanyBadge
                        name={sailing.company?.name}
                        logoUrl={sailing.company?.logo_url}
                        size={28}
                      />
                      <span className="min-w-[140px] flex-1 sm:min-w-0">
                        <strong className="block truncate text-sm font-bold">
                          {sailing.from.name} → {sailing.to.name}
                        </strong>
                        <small className="block truncate text-xs text-muted-foreground">
                          {[sailing.vessel?.name ?? "Navire à confirmer", sailing.company?.name]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <span className="flex w-full shrink-0 items-center justify-between gap-1 sm:w-auto sm:flex-col sm:items-end">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneClass[status.tone]}`}
                        >
                          {status.tone === "alert" && status.label !== "Annulée" ? "! " : ""}
                          {status.label}
                        </span>
                        {fare ? (
                          <small className="text-[11px] text-muted-foreground">
                            {formatEuro(fare.amount)}
                          </small>
                        ) : null}
                      </span>
                    </button>
                    {open && isMobile ? (
                      <div className="border-t border-border p-3">{detail}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {rows.length > visible ? (
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="min-h-11 w-full border-t border-border text-sm font-semibold text-primary"
              >
                Afficher plus ({rows.length - visible} restants)
              </button>
            ) : null}
          </section>

          {!isMobile ? (
            <aside className="grid gap-3 lg:sticky lg:top-20">
              <div className="h-[340px] overflow-hidden rounded-2xl border border-border">
                {map}
              </div>
              {detail ?? (
                <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Choisissez une traversée pour voir son trajet, son statut et son prix indicatif.
                </p>
              )}
            </aside>
          ) : null}
        </div>
      </main>
      <SiteFooter />
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <MobileTabBar />
      </div>
    </>
  );
}

function TripDetail({ row, arrivals, now }: { row: Row; arrivals: boolean; now: number }) {
  const { sailing, status } = row;
  const { departure, from, to, vessel, company } = sailing;
  const [copied, setCopied] = useState(false);
  const fare = status.label === "Annulée" ? null : estimateFerryFare(sailing, defaultTripProfile);
  const fromZone = portTimeZone(from);
  const toZone = portTimeZone(to);
  const upcoming = Date.parse(departure.departure_at) > now;
  const share = async () => {
    const url = window.location.href;
    const text = `${from.name} → ${to.name} sur BledWay`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* partage annulé */
    }
  };
  return (
    <section
      key={departure.id}
      className="bw-board-rise rounded-2xl border border-border bg-card p-4"
      aria-label="Détail de la traversée"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${toneClass[status.tone]}`}>
          {status.label}
        </span>
        <FollowButton
          kind="departure"
          targetId={departure.id}
          iconOnly
          label={`${from.name} → ${to.name}`}
          demo={Boolean(departure.is_demo)}
        />
      </div>
      <h2 className="mt-2 text-lg font-extrabold">
        {from.name} → {to.name}
      </h2>
      <p className="text-[13px] text-muted-foreground">
        {arrivals ? "Arrivée" : "Départ"} {capitalizeFirst(formatShortDay(row.at, row.zone))} à{" "}
        {formatTime(row.at, row.zone)} ({zoneLabel(arrivals ? toZone : fromZone)})
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
        <Ship size={14} className="text-primary" aria-hidden />
        {vessel ? (
          <Link
            to="/"
            search={{ select: "vessel", id: vessel.id } as never}
            className="font-semibold underline underline-offset-2"
          >
            {vessel.name}
          </Link>
        ) : (
          "Navire à confirmer"
        )}
        <VesselAlertTag vesselId={vessel?.id} />
        {company ? <span className="text-muted-foreground">· {company.name}</span> : null}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed">{status.proof}</p>

      {fare ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 p-3">
          <span>
            <strong className="block text-sm">Prix indicatif : {formatFareRange(fare)}</strong>
            <small className="text-[11px] text-muted-foreground">
              2 adultes et une berline, aller simple. Repère, pas un devis.
            </small>
          </span>
          <a
            href={priceSearchHref(from, to, dateKeyInZone(departure.departure_at, fromZone))}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-bold text-primary-foreground"
          >
            Comparer les prix <ArrowRight size={14} aria-hidden />
          </a>
        </div>
      ) : null}

      {upcoming ? (
        <div className="mt-1">
          <MakeMyTrip
            kind="departure"
            targetId={departure.id}
            label={`${from.name} → ${to.name}`}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
        <Link
          to="/"
          search={{ select: "departure", id: departure.id } as never}
          className="inline-flex min-h-10 items-center rounded-lg border border-border px-3"
        >
          Voir la fiche complète
        </Link>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3"
        >
          <Share2 size={14} aria-hidden /> {copied ? "Lien copié" : "Partager aux proches"}
        </button>
      </div>
    </section>
  );
}
