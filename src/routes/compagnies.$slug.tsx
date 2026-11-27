import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  ExternalLink,
  Map as MapIcon,
  Repeat,
  Route as RouteIcon,
  Ship,
  Users,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection, StructuredData } from "@/components/editorial/Editorial";
import {
  DepartureRows,
  heroChip,
  heroPrimary,
  heroSecondary,
  KeyFacts,
  SectionTitle,
  ShowcaseHero,
  type Fact,
} from "@/components/editorial/Showcase";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { VesselThumb } from "@/components/panel/LineOverview";
import { companyOverview } from "@/lib/ferry/companyOverview";
import { formatDuration } from "@/lib/ferry/format";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { companyFaq } from "@/lib/seo/catalogFaq";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
import { intlLocale, placeName, tr } from "@/lib/i18n";

export const Route = createFileRoute("/compagnies/$slug")({
  loader: async ({ context, params }) => {
    const [companies] = await Promise.all([
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
    const company = companies.find((item) => item.slug === params.slug && item.status === "active");
    if (!company) throw notFound();
    return { name: company.name, slug: company.slug };
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(
          tr("ui.pageCompagnie.titre", { name: loaderData.name }),
          tr("ui.pageCompagnie.description", { name: loaderData.name }),
          `/compagnies/${loaderData.slug}`,
        )
      : { meta: [{ name: "robots", content: "noindex" }] },
  component: CompanyPage,
});

const number = (value: number) => value.toLocaleString(intlLocale());
const decimal = (value: number) => value.toLocaleString(intlLocale(), { maximumFractionDigits: 1 });

function CompanyPage() {
  const { slug } = Route.useLoaderData();
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());
  const company = companies.find((item) => item.slug === slug)!;
  const overview = companyOverview(company, vessels, routes, departures);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const lineName = (route: { departure_port_id: string; arrival_port_id: string }) =>
    `${placeName(portName(route.departure_port_id))} → ${placeName(portName(route.arrival_port_id))}`;
  const path = `/compagnies/${company.slug}`;
  const year = new Date().getFullYear();
  const fleet = [...overview.fleet].sort(
    (a, b) => (b.passenger_capacity ?? 0) - (a.passenger_capacity ?? 0),
  );
  const mine = departures
    .filter((d) => d.company_id === company.id && d.status !== "cancelled")
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const firstRoute = overview.lines[0]?.route;
  const timeZone = portTimeZone(
    firstRoute ? ports.find((port) => port.id === firstRoute.departure_port_id) : undefined,
  );
  const faq = companyFaq(company, overview, portName, year);
  const others = companies.filter((item) => item.id !== company.id && item.status === "active");

  const facts: Fact[] = [
    { icon: Ship, label: tr("ui.pageCompagnie.navires"), value: number(fleet.length) },
    { icon: RouteIcon, label: tr("ui.pageCompagnie.lignes"), value: number(overview.lines.length) },
  ];
  if (overview.perWeek > 0)
    facts.push({
      icon: Repeat,
      label: tr("ui.pageCompagnie.departsParSemaine"),
      value: decimal(overview.perWeek),
      hint: tr("ui.pageCompagnie.surLesProgrammes"),
    });
  if (overview.averageAge !== null)
    facts.push({
      icon: CalendarDays,
      label: tr("ui.pageCompagnie.ageMoyen"),
      value: tr("ui.pageCompagnie.ans", { n: overview.averageAge }),
    });
  if (overview.passengersMax)
    facts.push({
      icon: Users,
      label: tr("ui.pageCompagnie.plusGrandNavire"),
      value: number(overview.passengersMax),
      hint: overview.flagship
        ? tr("ui.pageCompagnie.passagersSur", { name: overview.flagship.name })
        : undefined,
    });
  if (overview.next)
    facts.push({
      icon: Clock,
      label: tr("ui.pageCompagnie.prochainDepart"),
      value: new Date(overview.next.departure_at).toLocaleDateString(intlLocale(), {
        day: "numeric",
        month: "short",
        timeZone,
      }),
      hint: (() => {
        const route = routes.find((r) => r.id === overview.next!.route_id);
        return route ? lineName(route) : undefined;
      })(),
    });

  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": absoluteUrl(`${path}#compagnie`),
          name: company.name,
          ...(company.website_url ? { url: company.website_url, sameAs: [company.website_url] } : {}),
          ...(company.logo_url ? { logo: company.logo_url } : {}),
          ...(company.description ? { description: company.description } : {}),
          subjectOf: { "@type": "WebPage", url: absoluteUrl(path) },
          makesOffer: overview.lines.map(({ route }) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "BoatTrip",
              name: `Ferry ${lineName(route)}`,
              url: absoluteUrl(`/lignes/${route.slug}`),
            },
          })),
        }}
      />
      <Breadcrumbs
        items={[
          { name: tr("ui.pageCompagnie.compagnies"), path: "/compagnies" },
          { name: company.name, path },
        ]}
      />
      <ShowcaseHero
        overline={tr("ui.pageCompagnie.surtitre")}
        title={company.name}
        intro={
          <p>
            {tr("ui.pageCompagnie.intro", {
              name: company.name,
              n: overview.lines.length,
              fleet: fleet.length,
            })}{" "}
            {company.description ?? ""}
          </p>
        }
        chips={
          overview.lines.length ? (
            <>
              {overview.lines.slice(0, 6).map(({ route }) => (
                <Link
                  key={route.id}
                  to="/lignes/$slug"
                  params={{ slug: route.slug }}
                  className={`${heroChip} hover:border-[#0e7a43]/40`}
                >
                  {lineName(route)}
                </Link>
              ))}
            </>
          ) : null
        }
        actions={
          <>
            <Link
              to="/horaires"
              search={{ company: company.id } as never}
              className={heroPrimary}
            >
              <CalendarDays className="size-4" aria-hidden />
              {tr("ui.pageCompagnie.voirLesDeparts")}
            </Link>
            <Link
              to="/"
              search={{ select: "company", id: company.id } as never}
              className={heroSecondary}
            >
              <MapIcon className="size-4" aria-hidden />
              {tr("ui.pageCompagnie.surLaCarte")}
            </Link>
          </>
        }
        visual={
          <div className="relative grid h-full place-items-center overflow-hidden bg-gradient-to-b from-[#dcebf2] via-[#c9e1ec] to-[#8fbfd4] p-6">
            <span className="absolute left-5 top-5 rounded-2xl bg-white/90 p-2 shadow-sm">
              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={56} />
            </span>
            {overview.flagship ? (
              <span className="relative w-full max-w-[520px] [&_img]:h-auto [&_img]:w-full [&_img]:object-contain [&_img]:drop-shadow-xl">
                <VesselThumb vessel={overview.flagship} width={520} />
              </span>
            ) : (
              <Ship className="size-16 text-[#0f2a3d]/40" aria-hidden />
            )}
          </div>
        }
      />
      <KeyFacts facts={facts} label={tr("ui.pageCompagnie.enChiffres", { name: company.name })} />

      {overview.lines.length ? (
        <section className="mt-10" aria-labelledby="lignes">
          <SectionTitle
            id="lignes"
            overline={tr("ui.pageCompagnie.reseau")}
            title={tr("ui.pageCompagnie.lignesDe", { name: company.name })}
          >
            {tr("ui.pageCompagnie.lignesAide")}
          </SectionTitle>
          <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {overview.lines.map(({ route, perWeek, next }) => (
              <li key={route.id}>
                <Link
                  to="/lignes/$slug"
                  params={{ slug: route.slug }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-[#0e7a43]/40"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#0f2a3d]">{lineName(route)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[
                        route.typical_duration_minutes ? formatDuration(route.typical_duration_minutes) : null,
                        perWeek
                          ? tr("ui.pageCompagnie.parSemaine", { n: decimal(perWeek) })
                          : tr("ui.pageCompagnie.pasDeProgramme"),
                        next
                          ? tr("ui.pageCompagnie.prochainLe", {
                              day: new Date(next).toLocaleDateString(intlLocale(), {
                                day: "numeric",
                                month: "short",
                                timeZone: "Europe/Paris",
                              }),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-[#0e7a43]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="prochains-departs">
        <SectionTitle
          id="prochains-departs"
          overline={tr("ui.pageCompagnie.calendrier")}
          title={tr("ui.pageCompagnie.prochainsDeparts", { name: company.name })}
        >
          {tr("ui.pageCompagnie.departsAide")}
        </SectionTitle>
        <DepartureRows
          departures={mine.slice(0, 8)}
          companies={companies}
          vessels={vessels}
          ports={ports}
          routes={routes}
          timeZone={timeZone}
          showRoute
          empty={tr("ui.pageCompagnie.aucunDepart")}
        />
      </section>

      {fleet.length ? (
        <section className="mt-10" aria-labelledby="flotte">
          <SectionTitle
            id="flotte"
            overline={tr("ui.pageCompagnie.flotte")}
            title={tr("ui.pageCompagnie.naviresDe", { name: company.name })}
          />
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.map((vessel) => (
              <li key={vessel.id}>
                <Link
                  to="/bateaux/$slug"
                  params={{ slug: vessel.slug }}
                  className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-[#0e7a43]/40"
                >
                  <span className="w-24 shrink-0 [&_img]:h-auto [&_img]:w-full">
                    <VesselThumb vessel={vessel} width={96} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#0f2a3d]">{vessel.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[
                        vessel.build_year
                          ? tr("ui.pageCompagnie.depuis", { year: vessel.build_year })
                          : null,
                        vessel.passenger_capacity
                          ? tr("ui.pageCompagnie.passagers", { n: number(vessel.passenger_capacity) })
                          : null,
                        vessel.car_capacity
                          ? tr("ui.pageCompagnie.vehicules", { n: number(vessel.car_capacity) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {company.website_url || company.booking_url || company.contact_url || company.claims_url ? (
        <section className="mt-10" aria-labelledby="contacts">
          <SectionTitle
            id="contacts"
            overline={tr("ui.pageCompagnie.officiel")}
            title={tr("ui.pageCompagnie.reserverContacter", { name: company.name })}
          >
            {tr("ui.pageCompagnie.contactsAide")}
          </SectionTitle>
          <ul className="mt-4 flex flex-wrap gap-2">
            {(
              [
                [company.booking_url, tr("ui.pageCompagnie.lienReserver")],
                [company.website_url, tr("ui.pageCompagnie.lienSite")],
                [company.contact_url, tr("ui.pageCompagnie.lienContact")],
                [company.claims_url, tr("ui.pageCompagnie.lienReclamation")],
              ] as const
            )
              .filter(([url]) => url && /^https:\/\//.test(url))
              .map(([url, label]) => (
                <li key={label}>
                  <a href={url!} target="_blank" rel="noopener noreferrer" className={heroSecondary}>
                    {label}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <FaqSection faq={faq} path={path} />

      {others.length ? (
        <nav aria-label={tr("ui.pageCompagnie.autres")} className="mt-10">
          <h2 className="font-display text-xl font-bold">{tr("ui.pageCompagnie.autres")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((item) => (
              <li key={item.id}>
                <Link
                  to="/compagnies/$slug"
                  params={{ slug: item.slug }}
                  className={`${heroChip} hover:border-[#0e7a43]/40`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </SiteLayout>
  );
}
