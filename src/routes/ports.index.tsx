import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Flag,
  MapPin,
  Map as MapIcon,
  Route as RouteIcon,
} from "lucide-react";
import { seoHead } from "@/lib/seo/site";
import { Breadcrumbs, CollectionSchema } from "@/components/editorial/Editorial";
import {
  heroChip,
  heroPrimary,
  KeyFacts,
  PortTile,
  SectionTitle,
  ShowcaseHero,
  ShowcaseMap,
  type Fact,
} from "@/components/editorial/Showcase";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { deName, formatDate } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { tr } from "@/lib/i18n";

const title = "Ports de ferry Europe ↔ Algérie : lignes, départs, services | BledWay";
const description =
  "Tous les ports desservis entre l'Europe et l'Algérie : Alger, Oran, Béjaïa, Skikda, Annaba, Marseille, Sète, Alicante, Barcelone… Lignes, prochains départs, compagnies et services de chaque port.";

export const Route = createFileRoute("/ports/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
  },
  head: () => seoHead(title, description, "/ports"),
  component: PortsPage,
});

function PortsPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());

  const countries = [...new Set(ports.map((port) => port.country_name))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const routesOf = (id: string) =>
    routes.filter((route) => route.departure_port_id === id || route.arrival_port_id === id);
  const activeCompanies = companies.filter((company) =>
    routes.some((route) => route.company_ids.includes(company.id)),
  );
  const connectedPorts = ports.filter((port) => routesOf(port.id).length > 0);

  const facts: Fact[] = [
    {
      icon: MapPin,
      label: "Ports",
      value: String(connectedPorts.length),
      hint: closedHint(ports.filter((port) => port.status === "inactive").length),
    },
    {
      icon: Flag,
      label: "Pays",
      value: String(countries.length),
      hint: countries.join(", "),
    },
    {
      icon: RouteIcon,
      label: "Lignes",
      value: String(routes.length),
      hint: "Dans les deux sens",
    },
    {
      icon: Building2,
      label: "Compagnies",
      value: String(activeCompanies.length),
      hint: activeCompanies.map((company) => company.name).join(", "),
    },
  ];

  return (
    <SiteLayout>
      <CollectionSchema
        path="/ports"
        name="Ports de ferry Europe ↔ Algérie"
        items={ports.map((port) => ({
          name: `Port ${deName(port.name)}`,
          path: `/ports/${port.slug}`,
        }))}
      />
      <Breadcrumbs items={[{ name: "Ports", path: "/ports" }]} />
      <ShowcaseHero
        overline={tr("ui.pagePortsIndex.ports")}
        title={tr("ui.pagePortsIndex.lesPortsDesTraverseesEntre")}
        intro={<p>{tr("ui.pagePortsIndex.chaquePortEstDecritAvec")}</p>}
        chips={
          <>
            {countries.map((country) => (
              <a
                key={country}
                href={`#${slugOf(country)}`}
                className={`${heroChip} hover:border-[#0e7a43]/40`}
              >
                {country} · {ports.filter((port) => port.country_name === country).length}
              </a>
            ))}
          </>
        }
        actions={
          <Link to="/" className={heroPrimary}>
            <MapIcon className="size-4" aria-hidden /> Voir les ports sur la carte
          </Link>
        }
        visual={
          <ShowcaseMap
            className="h-full"
            routes={routes}
            ports={ports}
            routeIds={routes.map((route) => route.id)}
          />
        }
      />
      <KeyFacts facts={facts} label="Les ports en chiffres" />

      {countries.map((country) => {
        const list = ports
          .filter((port) => port.country_name === country)
          .sort(
            (a, b) =>
              routesOf(b.id).length - routesOf(a.id).length || a.name.localeCompare(b.name, "fr"),
          );
        return (
          <section
            key={country}
            id={slugOf(country)}
            className="mt-12 scroll-mt-24"
            aria-labelledby={`${slugOf(country)}-titre`}
          >
            <SectionTitle
              id={`${slugOf(country)}-titre`}
              overline={`${list.length} port${list.length > 1 ? "s" : ""}`}
              title={country}
            />
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((port) => {
                const count = routesOf(port.id).length;
                const outboundIds = new Set(
                  routes
                    .filter((route) => route.departure_port_id === port.id)
                    .map((route) => route.id),
                );
                const next = departures.find(
                  (departure) =>
                    outboundIds.has(departure.route_id) && departure.status !== "cancelled",
                );
                const caption = [
                  count === 0
                    ? tr("ui.pagePortsIndex.aucuneLigne")
                    : count === 1
                      ? tr("ui.pagePortsIndex.t1Ligne")
                      : `${count} lignes`,
                  next
                    ? `prochain départ le ${formatDate(next.departure_at, portTimeZone(port))}`
                    : null,
                  port.status === "inactive" ? tr("ui.pagePortsIndex.temporairementFerme") : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={port.id} className="min-w-0">
                    <PortTile port={port} detail={caption} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <nav
        aria-label="Pour aller plus loin"
        className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          { href: "/lignes", title: "Les lignes", text: "Durées, départs et prix repères" },
          {
            href: "/routes-du-bled",
            title: "Routes du bled",
            text: "La route jusqu'au port, avec les haltes",
          },
          { href: "/compagnies", title: "Les compagnies", text: "Lignes, flotte et contacts" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-border bg-card p-4 transition hover:border-[#0e7a43]/40"
          >
            <span className="flex items-center justify-between font-semibold text-[#0f2a3d]">
              {item.title}
              <ArrowRight
                className="size-4 text-[#0e7a43] transition group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">{item.text}</span>
          </a>
        ))}
      </nav>
    </SiteLayout>
  );
}

const slugOf = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

const closedHint = (closed: number) =>
  closed === 0 ? "Tous ouverts" : `${closed} temporairement fermé${closed > 1 ? "s" : ""}`;
