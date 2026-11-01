import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { VesselPalmares, VesselPhotoBadge } from "@/components/panel/VesselFacts";
import { FleetOverview } from "@/components/panel/FleetOverview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  CarFront,
  Gauge,
  Layers,
  MoveHorizontal,
  Ruler,
  Scale,
  Ship,
  Users,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, CollectionSchema } from "@/components/editorial/Editorial";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
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
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Port, RouteLine, Vessel } from "@/lib/ferry/types";

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
        La flotte entre l'Europe et l'Algérie
      </h1>
      <p className="mb-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        Les navires renseignés sur BledWay, classés par compagnie, avec leurs lignes et leurs
        caractéristiques connues. L'affectation d'un navire à un départ peut changer : elle se
        confirme auprès de la compagnie.
      </p>
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
                    {list.length} navire{list.length > 1 ? "s" : ""} · {companyRoutes.length} ligne
                    {companyRoutes.length > 1 ? "s" : ""}
                  </p>
                </div>
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

function routeLabel(route: RouteLine, ports: Port[]) {
  const from = ports.find((p) => p.id === route.departure_port_id)?.name ?? "?";
  const to = ports.find((p) => p.id === route.arrival_port_id)?.name ?? "?";
  return `${from} → ${to}`;
}

function RouteChip({ route, ports }: { route: RouteLine; ports: Port[] }) {
  return (
    <span className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
      {routeLabel(route, ports)}
    </span>
  );
}

function VesselCard({ vessel, routes, ports }: { vessel: Vessel; routes: RouteLine[]; ports: Port[] }) {
  const photo = useQuery(vesselPhotoQuery(vessel)).data;
  const [failed, setFailed] = useState(false);
  const year = new Date().getFullYear();
  const dossier = vesselDossiers.find((d) => d.name.toLowerCase() === vessel.name.toLowerCase());
  const stats = [
    { icon: CalendarDays, label: "Âge", value: vessel.build_year && vessel.build_year <= year ? `${year - vessel.build_year} ans` : null },
    { icon: Users, label: "Passagers", value: vessel.passenger_capacity?.toLocaleString("fr-FR") },
    { icon: CarFront, label: "Véhicules", value: vessel.car_capacity?.toLocaleString("fr-FR") },
    { icon: Ruler, label: "Longueur", value: vessel.length_meters ? `${vessel.length_meters} m` : null },
    { icon: Gauge, label: "Vitesse", value: vessel.speed_knots ? `${Math.round(vessel.speed_knots * 1.852)} km/h` : null },
    { icon: BedDouble, label: "Cabines", value: vessel.cabin_capacity?.toLocaleString("fr-FR") },
    { icon: Scale, label: "Jauge brute", value: vessel.gross_tonnage ? `${vessel.gross_tonnage.toLocaleString("fr-FR")} t` : null },
    { icon: MoveHorizontal, label: "Largeur", value: vessel.beam_meters ? `${vessel.beam_meters.toLocaleString("fr-FR")} m` : null },
    { icon: Layers, label: "Ponts", value: vessel.deck_count?.toLocaleString("fr-FR") },
  ].filter((s) => s.value);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border bg-background shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/9] overflow-hidden bg-white">
        {photo?.url && !failed ? (
          <img
            src={photo.url}
            alt={vessel.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-2 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Ship size={40} aria-hidden />
          </div>
        )}
        <VesselPhotoBadge vesselId={vessel.id} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-bold">
          {vessel.name} <VesselAlertTag vesselId={vessel.id} />
        </h3>
        {stats.length ? (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/60 px-2 py-1.5">
                <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <s.icon size={13} className="text-primary" aria-hidden /> {s.label}
                </dt>
                <dd className="font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {routes.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {routes.map((r) => (
              <li key={r.id}>⚓ {routeLabel(r, ports)}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-3 pt-4 text-sm font-semibold">
          <Link to="/" search={{ select: "vessel", id: vessel.id } as never} className="inline-flex items-center gap-1 text-primary">
            Voir sur la carte <ArrowRight size={14} />
          </Link>
          {dossier ? (
            <Link to="/bateaux/$slug" params={{ slug: dossier.slug }} className="text-muted-foreground hover:text-primary">
              Dossier complet
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
