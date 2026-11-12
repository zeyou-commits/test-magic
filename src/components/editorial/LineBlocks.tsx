import { lazy, Suspense } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { LineGlance } from "@/content/types";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { BookingLink } from "@/components/panel/shared";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { LineAlertNotice, VesselAlertTag } from "@/components/panel/VesselAlert";
import { VesselCard } from "@/components/panel/VesselCard";
import { primaryLink } from "./Editorial";
import { tr } from "@/lib/i18n";

const BoardMap = lazy(() => import("@/components/board/BoardMap"));

/** Données de la ligne, chargées par le loader du dossier (mêmes requêtes que la page ligne). */
export const lineQueries = [
  routesQuery,
  portsQuery,
  companiesQuery,
  vesselsQuery,
  upcomingDeparturesQuery(),
] as const;

function useLine(slug: string) {
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());
  const route = routes.find((r) => r.slug === slug) ?? null;
  const lineDepartures = route ? departures.filter((d) => d.route_id === route.id) : [];
  const operators = route
    ? companies.filter(
        (c) => route.company_ids.includes(c.id) || lineDepartures.some((d) => d.company_id === c.id),
      )
    : [];
  const from = route ? ports.find((p) => p.id === route.departure_port_id) : undefined;
  return { routes, ports, companies, vessels, route, lineDepartures, operators, from };
}

/** La ligne sur la vraie carte BledWay (celle des horaires), filtrée, avec ses chiffres clés. */
export function LineMapCard({ line }: { line: LineGlance }) {
  const { routes, ports, route } = useLine(line.slug);
  const fallback = <div className="h-full animate-pulse bg-secondary" />;
  return (
    <section
      aria-label={`La ligne ${line.from} → ${line.to}`}
      className="mt-8 overflow-hidden rounded-2xl border bg-card"
    >
      <div className="relative h-64 md:h-80">
        <ClientOnly fallback={fallback}>
          <Suspense fallback={fallback}>
            <BoardMap
              routes={routes}
              ports={ports}
              routeIds={route ? [route.id] : []}
              selectedRouteId={route?.id ?? null}
              selectedAlert={false}
            />
          </Suspense>
        </ClientOnly>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#0f2a3d] shadow">
          {tr("ui.lineBlocks.t1NuitEnMer")}
        </span>
      </div>
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{tr("ui.lineBlocks.laLigneEnUnCoup")}</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {line.from} → {line.to}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {line.facts.map((f) => (
              <div key={f.label} className="rounded-xl bg-secondary px-3 py-3">
                <dt className="text-xs leading-snug text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 font-display text-base font-bold leading-tight md:text-lg">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {route ? (
            <Link
              to="/"
              search={{ select: "route", id: route.id } as never}
              className={`${primaryLink} sm:flex-1`}
            >
              {tr("ui.lineBlocks.suivreLaLigneEnDirect")}
            </Link>
          ) : null}
          <a
            href={`/lignes/${line.slug}`}
            className="rounded-lg border px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-secondary sm:flex-1"
          >
            {tr("ui.lineBlocks.voirLaLigneEtTous")}
          </a>
        </div>
      </div>
    </section>
  );
}

/** Les navires qui assurent la ligne : les mêmes fiches que la page Navires. */
export function LineVessels({ line }: { line: LineGlance }) {
  const { ports, vessels, route, lineDepartures } = useLine(line.slug);
  if (!route) return null;
  const count = new Map<string, number>();
  for (const d of lineDepartures) if (d.vessel_id) count.set(d.vessel_id, (count.get(d.vessel_id) ?? 0) + 1);
  const list = vessels
    .filter((v) => v.status === "active" && count.has(v.id))
    .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0));
  if (!list.length) return null;
  return (
    <section className="mt-10" aria-labelledby="navires-ligne">
      <h2 id="navires-ligne" className="font-display text-2xl font-bold tracking-tight">
        {tr("ui.lineBlocks.lesNaviresDeLaLigne")}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {tr("ui.lineBlocks.lesBateauxProgrammesSur")}{line.from} → {line.to}{tr("ui.lineBlocks.duPlusFrequentAuPlus")}
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {list.map((v) => (
          <VesselCard key={v.id} vessel={v} ports={ports} routes={[route]} />
        ))}
      </div>
    </section>
  );
}

/** Réserver auprès des compagnies et prochains départs : les blocs de la page ligne. */
export function LineBooking({ line }: { line: LineGlance }) {
  const { companies, vessels, route, lineDepartures, operators, from } = useLine(line.slug);
  if (!route) return null;
  const timeZone = portTimeZone(from);
  const next = lineDepartures.slice(0, 5);
  return (
    <>
      {operators.length ? (
        <section className="mt-10" aria-labelledby="reserver-ligne">
          <h2 id="reserver-ligne" className="font-display text-2xl font-bold tracking-tight">
            {tr("ui.lineBlocks.reserverCetteTraversee")}
          </h2>
          <p className="mt-2 text-muted-foreground">{tr("ui.lineBlocks.laReservationSeFaitDirectement")}</p>
          <div className="mt-4 empty:hidden">
            <LineAlertNotice departures={lineDepartures} vessels={vessels} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {operators.map((company) => (
              <div key={company.id} className="rounded-2xl border bg-card p-4">
                <div className="mb-3 flex items-center gap-3">
                  <CompanyBadge name={company.name} logoUrl={company.logo_url} size={40} />
                  <p className="font-display font-semibold">{company.name}</p>
                </div>
                <BookingLink company={company} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {next.length ? (
        <section className="mt-10" aria-labelledby="prochains-departs">
          <h2 id="prochains-departs" className="font-display text-2xl font-bold tracking-tight">
            {tr("ui.lineBlocks.prochainsDeparts")}{" "}
            <span className="text-base font-normal text-muted-foreground">· {zoneLabel(timeZone)}</span>
          </h2>
          <ul className="mt-4 divide-y divide-border rounded-2xl border bg-card">
            {next.map((d) => {
              const company = companies.find((c) => c.id === d.company_id);
              const vessel = vessels.find((v) => v.id === d.vessel_id);
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium">{formatDateTime(d.departure_at, timeZone)}</span>
                  <span className="text-muted-foreground">
                    {company?.name ?? "—"}
                    {d.duration_minutes ? ` · ${formatDuration(d.duration_minutes)}` : ""}
                    {d.status === "cancelled" ? tr("ui.lineBlocks.annule") : ""}
                    {vessel ? ` · ${vessel.name} ` : ""}
                    <VesselAlertTag vesselId={vessel?.id} />
                  </span>
                </li>
              );
            })}
          </ul>
          <a
            href={`/lignes/${line.slug}`}
            className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4"
          >
            {tr("ui.lineBlocks.tousLesDepartsEtLe")}
          </a>
        </section>
      ) : null}
    </>
  );
}
