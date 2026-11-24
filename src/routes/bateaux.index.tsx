import { VesselPalmares } from "@/components/panel/VesselFacts";
import { FleetOverview } from "@/components/panel/FleetOverview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import { heroChip, heroPrimary, SectionTitle, ShowcaseHero } from "@/components/editorial/Showcase";
import { VesselThumb } from "@/components/panel/LineOverview";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, CollectionSchema } from "@/components/editorial/Editorial";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { FollowButton } from "@/components/panel/FollowButton";
import { vesselDossiers } from "@/content/vessels";
import { seoHead } from "@/lib/seo/site";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { VesselCard, routeLabel } from "@/components/panel/VesselCard";
import type { Port, RouteLine } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/bateaux/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      // Les départs ordonnent le visuel d'en-tête : le serveur et le navigateur doivent voir les mêmes.
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()).catch(() => null),
    ]);
  },
  head: () =>
    seoHead(
      tr("ui.pageBateauxIndex.naviresEuropeAlgerieFlotteEt"),
      tr("ui.pageBateauxIndex.touteLaFlotteDesFerries"),
      "/bateaux",
    ),
  component: Boats,
});

function Boats() {
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);

  const routesByVessel = new Map<string, Set<string>>();
  for (const d of [...recent, ...upcoming]) {
    if (!d.vessel_id) continue;
    const set = routesByVessel.get(d.vessel_id) ?? new Set<string>();
    set.add(d.route_id);
    routesByVessel.set(d.vessel_id, set);
  }
  // Brouillons et navires archivés (inactifs) ne sont pas présentés.
  const publicVessels = vessels.filter((v) => v.status === "active");
  const departuresByVessel = new Map<string, number>();
  for (const d of upcoming)
    if (d.vessel_id)
      departuresByVessel.set(d.vessel_id, (departuresByVessel.get(d.vessel_id) ?? 0) + 1);
  // Les trois navires qui partent le plus : leur rendu sert de visuel d'en-tête.
  const busiest = vessels
    .filter((v) => v.status === "active")
    .sort((a, b) => (departuresByVessel.get(b.id) ?? 0) - (departuresByVessel.get(a.id) ?? 0))
    .slice(0, 3);
  const groups = companies
    .map((c) => ({ company: c, vessels: publicVessels.filter((v) => v.company_id === c.id) }))
    .filter((g) => g.vessels.length);

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: tr("ui.pageBateauxIndex.navires"), path: "/bateaux" }]} />
      <CollectionSchema
        path="/bateaux"
        name="Flotte des ferries Europe ↔ Algérie"
        items={vesselDossiers.map((v) => ({ name: v.name, path: `/bateaux/${v.slug}` }))}
      />
      <ShowcaseHero
        overline={tr("ui.pageBateauxIndex.navires")}
        title={tr("ui.pageBateauxIndex.laFlotteEntreLEurope")}
        intro={<p>{tr("ui.pageBateauxIndex.lesNaviresRenseignesSurBledway")}</p>}
        chips={
          <>
            {groups.map(({ company, vessels: list }) => (
              <a
                key={company.id}
                href={`#compagnie-${company.slug}`}
                className={`${heroChip} hover:border-[#0e7a43]/40`}
              >
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={16} />
                {company.name} · {list.length}
              </a>
            ))}
          </>
        }
        actions={
          <Link to="/" className={heroPrimary}>
            <MapIcon className="size-4" aria-hidden />{tr("ui.pageBateauxIndex.voirLesNaviresEnDirect")}
          </Link>
        }
        visual={
          <div className="relative grid h-full grid-cols-1 place-items-center overflow-hidden bg-gradient-to-b from-[#dcebf2] via-[#c9e1ec] to-[#8fbfd4] px-4 py-6">
            <span
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0f2a3d]/25 to-transparent"
              aria-hidden
            />
            <span className="relative flex w-full max-w-[560px] flex-col items-center gap-1 [&_img]:h-auto [&_img]:w-full [&_img]:object-contain [&_img]:drop-shadow-xl">
              {busiest.map((vessel, index) => (
                <span
                  key={vessel.id}
                  className={
                    index === 0
                      ? "w-[78%] self-start"
                      : index === 1
                        ? "-mt-6 w-[64%] self-end"
                        : "-mt-6 w-[52%]"
                  }
                >
                  <VesselThumb vessel={vessel} width={440} towardRight={index === 1} />
                </span>
              ))}
            </span>
          </div>
        }
      />
      <div className="mt-6">
        <FleetOverview />
      </div>
      <VesselPalmares />
      <div className="space-y-10">
        {groups.map(({ company, vessels: list }) => {
          const companyRoutes = routes.filter((r) => r.company_ids.includes(company.id));
          return (
            <section
              key={company.id}
              id={`compagnie-${company.slug}`}
              className="scroll-mt-24 rounded-3xl border bg-card p-5 md:p-7"
            >
              <header className="mb-5 flex flex-wrap items-center gap-4">
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={56} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-bold">{company.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {list.length}
                    {tr("ui.pageBateauxIndex.navire")}
                    {list.length > 1 ? "s" : ""} · {companyRoutes.length}
                    {tr("ui.pageBateauxIndex.ligne")}
                    {companyRoutes.length > 1 ? "s" : ""}
                  </p>
                </div>
                <FollowButton kind="company" targetId={company.id} label={company.name} compact />
              </header>
              {companyRoutes.length ? (
                <div className="mb-5 flex flex-wrap gap-2">
                  {companyRoutes.map((r) => (
                    <RouteChip key={r.id} route={r} ports={ports} />
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((v) => (
                  <VesselCard
                    key={v.id}
                    vessel={v}
                    ports={ports}
                    routes={routes.filter((r) => routesByVessel.get(v.id)?.has(r.id))}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <section className="mt-12" aria-labelledby="dossiers">
        <SectionTitle id="dossiers" overline={tr("ui.pageBateauxIndex.aLire")} title={tr("ui.pageBateauxIndex.lesDossiersDesNavires")}>
          {tr("ui.pageBateauxIndex.cabinesFauteuilsVieABord")}
        </SectionTitle>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {vesselDossiers.map((dossier) => (
            <li key={dossier.slug} className="min-w-0">
              <Link
                to="/bateaux/$slug"
                params={{ slug: dossier.slug }}
                className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-[#0e7a43]/40"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-[#0f2a3d]">{dossier.name}</span>
                  <span className="text-xs text-muted-foreground">{dossier.company}</span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-[#0e7a43] transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SiteLayout>
  );
}

function RouteChip({ route, ports }: { route: RouteLine; ports: Port[] }) {
  return (
    <span className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
      {routeLabel(route, ports)}
    </span>
  );
}
