import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CarFront, Gauge, Ruler, Ship, Users } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, CollectionSchema, EditorialHero } from "@/components/editorial/Editorial";
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
  head: () =>
    seoHead(
      "Navires et compagnies Europe ↔ Algérie : flotte, lignes et caractéristiques | BledWay",
      "Toute la flotte des ferries entre l'Europe et l'Algérie par compagnie : photos des navires, lignes desservies, capacité passagers et véhicules, âge et vitesse.",
      "/bateaux",
    ),
  component: Boats,
});

function Boats() {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
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
      <Breadcrumbs items={[{ name: "Bateaux", path: "/bateaux" }]} />
      <CollectionSchema
        path="/bateaux"
        name="Flotte des ferries Europe ↔ Algérie"
        items={vesselDossiers.map((v) => ({ name: v.name, path: `/bateaux/${v.slug}` }))}
      />
      <EditorialHero
        label="La flotte"
        title="Les compagnies, leurs navires et leurs lignes"
        intro="Chaque armateur, chaque navire en photo avec ses caractéristiques et les traversées qu'il assure. Les capacités générales ne sont pas des places disponibles."
      />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chargement de la flotte…</p>
      ) : null}
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
    { icon: Ship, label: "Âge", value: vessel.build_year && vessel.build_year <= year ? `${year - vessel.build_year} ans` : null },
    { icon: Users, label: "Passagers", value: vessel.passenger_capacity?.toLocaleString("fr-FR") },
    { icon: CarFront, label: "Véhicules", value: vessel.car_capacity?.toLocaleString("fr-FR") },
    { icon: Ruler, label: "Longueur", value: vessel.length_meters ? `${vessel.length_meters} m` : null },
    { icon: Gauge, label: "Vitesse", value: vessel.speed_knots ? `${Math.round(vessel.speed_knots * 1.852)} km/h` : null },
    { icon: Ship, label: "Cabines", value: vessel.cabin_capacity?.toLocaleString("fr-FR") },
    { icon: Ship, label: "Jauge brute", value: vessel.gross_tonnage ? `${vessel.gross_tonnage.toLocaleString("fr-FR")} t` : null },
    { icon: Ruler, label: "Largeur", value: vessel.beam_meters ? `${vessel.beam_meters.toLocaleString("fr-FR")} m` : null },
    { icon: Ship, label: "Ponts", value: vessel.deck_count?.toLocaleString("fr-FR") },
  ].filter((s) => s.value);
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-background shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/9] bg-white">
        {photo?.url && !failed ? (
          <img
            src={photo.url}
            alt={vessel.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Ship size={40} aria-hidden />
          </div>
        )}
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
                  <s.icon size={11} aria-hidden /> {s.label}
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
