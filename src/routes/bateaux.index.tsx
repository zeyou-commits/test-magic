import { ClampedIntro } from "@/components/editorial/Editorial";
import { VesselPalmares } from "@/components/panel/VesselFacts";
import { FleetOverview } from "@/components/panel/FleetOverview";
import { createFileRoute } from "@tanstack/react-router";
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
    ]);
  },
  head: () =>
    seoHead(
      "Navires Europe ↔ Algérie : flotte et caractéristiques | BledWay",
      "Toute la flotte des ferries entre l'Europe et l'Algérie par compagnie : photos des navires, lignes desservies, capacité passagers et véhicules, âge et vitesse.",
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
  const groups = companies
    .map((c) => ({ company: c, vessels: publicVessels.filter((v) => v.company_id === c.id) }))
    .filter((g) => g.vessels.length);

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Navires", path: "/bateaux" }]} />
      <CollectionSchema
        path="/bateaux"
        name="Flotte des ferries Europe ↔ Algérie"
        items={vesselDossiers.map((v) => ({ name: v.name, path: `/bateaux/${v.slug}` }))}
      />
      <h1 className="mb-5 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
        {tr("ui.pageBateauxIndex.laFlotteEntreLEurope")}
      </h1>
      <ClampedIntro className="mb-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        {tr("ui.pageBateauxIndex.lesNaviresRenseignesSurBledway")}
      </ClampedIntro>
      <FleetOverview />
      <VesselPalmares />
      <div className="space-y-10">
        {groups.map(({ company, vessels: list }) => {
          const companyRoutes = routes.filter((r) => r.company_ids.includes(company.id));
          return (
            <section key={company.id} className="rounded-3xl border bg-card p-5 md:p-7">
              <header className="mb-5 flex flex-wrap items-center gap-4">
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={56} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-bold">{company.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {list.length}{tr("ui.pageBateauxIndex.navire")}{list.length > 1 ? "s" : ""} · {companyRoutes.length}{tr("ui.pageBateauxIndex.ligne")}
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
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
