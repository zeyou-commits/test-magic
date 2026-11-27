import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Clock3,
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
  SectionTitle,
  ShowcaseHero,
  ShowcaseMap,
  type Fact,
} from "@/components/editorial/Showcase";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { formatDate, formatDuration } from "@/lib/ferry/format";
import { lineBenchmark, weeklyPace } from "@/lib/ferry/showcase";
import { portTimeZone } from "@/lib/ferry/time";
import type { Departure, RouteLine } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

const title = "Lignes de ferry Europe ↔ Algérie : horaires, durées, prix | BledWay";
const description =
  "Toutes les lignes de ferry entre l'Europe et l'Algérie, dans les deux sens : prochains départs, durée, départs par semaine, prix repères et compagnies. Marseille, Sète, Alicante, Barcelone, Alger, Oran…";

export const Route = createFileRoute("/lignes/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
  },
  head: () => seoHead(title, description, "/lignes"),
  component: LignesPage,
});

function LignesPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());
  const port = (id: string) => ports.find((item) => item.id === id);
  const portName = (id: string) => port(id)?.name ?? "—";
  const fromAlgeria = (route: RouteLine) => port(route.departure_port_id)?.country_code === "DZ";
  const byRoute = new Map<string, Departure[]>();
  for (const departure of departures) {
    const list = byRoute.get(departure.route_id) ?? [];
    list.push(departure);
    byRoute.set(departure.route_id, list);
  }
  const sortRoutes = (list: RouteLine[]) =>
    [...list].sort(
      (a, b) =>
        (byRoute.get(b.id)?.length ?? 0) - (byRoute.get(a.id)?.length ?? 0) ||
        portName(a.departure_port_id).localeCompare(portName(b.departure_port_id), "fr"),
    );
  const groups = [
    {
      id: "vers-algerie",
      overline: tr("ui.pageLignesIndex.aller"),
      title: tr("ui.pageLignesIndex.depuisLEuropeVersL"),
      items: sortRoutes(routes.filter((route) => !fromAlgeria(route))),
    },
    {
      id: "vers-europe",
      overline: tr("ui.pageLignesIndex.retour"),
      title: tr("ui.pageLignesIndex.depuisLAlgerieVersL"),
      items: sortRoutes(routes.filter(fromAlgeria)),
    },
  ];
  const activeCompanies = companies.filter((company) =>
    routes.some((route) => route.company_ids.includes(company.id)),
  );
  const usedPorts = new Set(
    routes.flatMap((route) => [route.departure_port_id, route.arrival_port_id]),
  );
  const durations = routes
    .map((route) => route.typical_duration_minutes)
    .filter((value): value is number => Boolean(value && value > 0));
  const pace = weeklyPace(departures);

  const facts: Fact[] = [
    {
      icon: RouteIcon,
      label: tr("ui.pageLignesIndex.lignes"),
      value: String(routes.length),
      hint: tr("ui.pageLignesIndex.versLAlgerieVersL", { length: groups[0]!.items.length, length2: groups[1]!.items.length }),
    },
    {
      icon: MapPin,
      label: tr("ui.pageLignesIndex.ports"),
      value: String(usedPorts.size),
      hint: tr("ui.pageLignesIndex.desDeuxCotesDeLa"),
    },
  ];
  if (durations.length)
    facts.push({
      icon: Clock3,
      label: tr("ui.pageLignesIndex.duree"),
      value: `${formatDuration(Math.min(...durations))} à ${formatDuration(Math.max(...durations))}`,
      hint: tr("ui.pageLignesIndex.dureesTypiquesDeLaPlus"),
    });
  if (pace)
    facts.push({
      icon: CalendarDays,
      label: pace.kind === "average" ? tr("ui.pageLignesIndex.departsParSemaine") : tr("ui.pageLignesIndex.departsSous7Jours"),
      value: pace.kind === "average" ? `≈ ${pace.value}` : String(pace.value),
      hint: tr("ui.pageLignesIndex.toutesLignesEtCompagniesConfondues"),
    });
  else
    facts.push({
      icon: Building2,
      label: tr("ui.pageLignesIndex.compagnies"),
      value: String(activeCompanies.length),
      hint: activeCompanies.map((company) => company.name).join(", "),
    });

  return (
    <SiteLayout>
      <CollectionSchema
        path="/lignes"
        name="Lignes de ferry Europe ↔ Algérie"
        items={groups.flatMap((group) =>
          group.items.map((route) => ({
            name: tr("ui.pageLignesIndex.ferry", { portName: portName(route.departure_port_id), portName2: portName(route.arrival_port_id) }),
            path: `/lignes/${route.slug}`,
          })),
        )}
      />
      <Breadcrumbs items={[{ name: tr("ui.pageLignesIndex.lignes"), path: "/lignes" }]} />
      <ShowcaseHero
        overline={tr("ui.pageLignesIndex.lignes")}
        title={tr("ui.pageLignesIndex.toutesLesLignesDeFerry")}
        intro={<p>{tr("ui.pageLignesIndex.comparezLesLignesLeurDuree")}</p>}
        chips={
          <>
            {activeCompanies.slice(0, 6).map((company) => (
              <span key={company.id} className={heroChip}>
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={16} />
                {company.name}
              </span>
            ))}
          </>
        }
        actions={
          <>
            <Link to="/" className={heroPrimary}>
              <MapIcon className="size-4" aria-hidden />{tr("ui.pageLignesIndex.voirLesNaviresEnDirect")}
            </Link>
            <a
              href="#vers-algerie"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-semibold text-[#0f2a3d] transition hover:border-[#0e7a43]/40 hover:bg-[#f1f8f4]"
            >
              {tr("ui.pageLignesIndex.choisirUneLigne")}<ArrowRight className="size-4" aria-hidden />
            </a>
          </>
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
      <KeyFacts facts={facts} label={tr("ui.pageLignesIndex.lesLignesEnChiffres")} />

      {groups.map((group) => (
        <section
          key={group.id}
          className="mt-12 scroll-mt-24"
          id={group.id}
          aria-labelledby={`${group.id}-titre`}
        >
          <SectionTitle id={`${group.id}-titre`} overline={group.overline} title={group.title}>
            {tr("ui.pageLignesIndex.lesLignesQuiPartentLe")}
          </SectionTitle>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((route) => {
              const from = port(route.departure_port_id);
              const to = port(route.arrival_port_id);
              const list = byRoute.get(route.id) ?? [];
              const next = list.find((departure) => departure.status !== "cancelled");
              const linePace = weeklyPace(list);
              const benchmark = from && to ? lineBenchmark(from, to) : null;
              const lineCompanies = companies.filter(
                (company) =>
                  route.company_ids.includes(company.id) ||
                  list.some((departure) => departure.company_id === company.id),
              );
              return (
                <li key={route.id} className="min-w-0">
                  <Link
                    to="/lignes/$slug"
                    params={{ slug: route.slug }}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-[#0e7a43]/35 hover:shadow-md sm:p-5"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-display text-lg font-bold leading-snug text-[#0f2a3d]">
                          {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {from?.country_name} → {to?.country_name}
                        </span>
                      </span>
                      <ArrowRight
                        className="mt-1.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#0e7a43]"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      <span className="rounded-lg bg-secondary/70 px-1.5 py-2">
                        <span className="block text-[11px] text-muted-foreground">{tr("ui.pageLignesIndex.duree")}</span>
                        <span className="block text-sm font-bold">
                          {formatDuration(route.typical_duration_minutes)}
                        </span>
                      </span>
                      <span className="rounded-lg bg-secondary/70 px-1.5 py-2">
                        <span className="block text-[11px] text-muted-foreground">{tr("ui.pageLignesIndex.parSemaine")}</span>
                        <span className="block text-sm font-bold">
                          {linePace
                            ? `${linePace.kind === "average" ? "≈ " : ""}${linePace.value}`
                            : "—"}
                        </span>
                      </span>
                      <span className="rounded-lg bg-secondary/70 px-1.5 py-2">
                        <span className="block text-[11px] text-muted-foreground">
                          {tr("ui.pageLignesIndex.avecVoiture")}
                        </span>
                        <span className="block text-sm font-bold text-[#0e7a43]">
                          {benchmark ? `${benchmark.withCar} €` : "—"}
                        </span>
                      </span>
                    </span>
                    <span className="mt-3 text-sm text-muted-foreground">
                      {next ? (
                        <>
                          {tr("ui.pageLignesIndex.prochainDepart")}{" "}
                          <strong className="font-semibold text-[#0f2a3d]">
                            {formatDate(next.departure_at, portTimeZone(from))}
                          </strong>
                        </>
                      ) : (
                        tr("ui.pageLignesIndex.aucunDepartPubliePourLe")
                      )}
                    </span>
                    {lineCompanies.length ? (
                      <span className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                        {lineCompanies.map((company) => (
                          <CompanyBadge
                            key={company.id}
                            name={company.name}
                            logoUrl={company.logo_url}
                            size={20}
                          />
                        ))}
                        <span className="sr-only">
                          {lineCompanies.map((company) => company.name).join(", ")}
                        </span>
                      </span>
                    ) : (
                      <span className="mt-auto pt-3 text-xs text-muted-foreground">
                        {tr("ui.pageLignesIndex.compagnieAConfirmer")}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <nav
        aria-label={tr("ui.pageLignesIndex.pourAllerPlusLoin")}
        className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          {
            href: "/ports",
            title: tr("ui.pageLignesIndex.lesPorts"),
            text: tr("ui.pageLignesIndex.lignesDepartsEtServicesDe"),
          },
          {
            href: "/barometre-prix",
            title: tr("ui.pageLignesIndex.barometreDesPrix"),
            text: tr("ui.pageLignesIndex.reperesParLigneEtPar"),
          },
          { href: "/bateaux", title: tr("ui.pageLignesIndex.lesNavires"), text: tr("ui.pageLignesIndex.photosCapacitesLignesDesservies") },
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
