import { localizeContent } from "@/lib/i18n/content";
import {
  VesselDossierCommunity,
  VesselDossierFollow,
} from "@/components/panel/VesselDossierCommunity";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CarFront, Map as MapIcon, Ruler, Users } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  AnswerBox,
  Breadcrumbs,
  ContentSection,
  ReadingLayout,
  SourceList,
  StructuredData,
} from "@/components/editorial/Editorial";
import {
  DepartureRows,
  heroChip,
  heroPrimary,
  KeyFacts,
  SectionTitle,
  ShowcaseHero,
  type Fact,
} from "@/components/editorial/Showcase";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { VesselThumb } from "@/components/panel/LineOverview";
import { vesselDossiers } from "@/content/vessels";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
import { tr, intlLocale } from "@/lib/i18n";

export const Route = createFileRoute("/bateaux/$slug")({
  loader: async ({ context, params }) => {
    const v = vesselDossiers.find((v) => v.slug === params.slug);
    if (!v) throw notFound();
    // Les données vivantes enrichissent le dossier ; sans la base, le dossier reste lisible.
    await Promise.all(
      [vesselsQuery, companiesQuery, routesQuery, portsQuery, upcomingDeparturesQuery()].map(
        (query) => context.queryClient.ensureQueryData(query as never).catch(() => null),
      ),
    );
    return v;
  },
  head: ({ loaderData: v }) =>
    v
      ? seoHead(
          tr("ui.pageBateauxSlug.navireLignesEtVieA", { name: v.name, company: v.company }),
          v.summary,
          `/bateaux/${v.slug}`,
        )
      : {
          meta: [{ title: tr("ui.pageBateauxSlug.navireIntrouvableBledway") }, { name: "robots", content: "noindex" }],
        },
  component: Boat,
});

function Boat() {
  const v = localizeContent(Route.useLoaderData());
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());

  const vessel =
    vessels.find((item) => item.slug === v.slug) ??
    vessels.find((item) => item.name.toLowerCase() === v.name.toLowerCase());
  const company = vessel?.company_id
    ? companies.find((item) => item.id === vessel.company_id)
    : undefined;
  const vesselDepartures = vessel ? departures.filter((item) => item.vessel_id === vessel.id) : [];
  const routeIds = [...new Set(vesselDepartures.map((item) => item.route_id))];
  const servedRoutes = routes.filter((route) => routeIds.includes(route.id));
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const firstRoute = servedRoutes[0];
  const timeZone = portTimeZone(
    firstRoute ? ports.find((port) => port.id === firstRoute.departure_port_id) : undefined,
  );
  const year = new Date().getFullYear();

  const facts: Fact[] = [];
  if (vessel?.build_year && vessel.build_year <= year)
    facts.push({
      icon: CalendarDays,
      label: tr("ui.pageBateauxSlug.miseEnService"),
      value: String(vessel.build_year),
      hint: `${year - vessel.build_year} ans`,
    });
  if (vessel?.passenger_capacity)
    facts.push({
      icon: Users,
      label: tr("ui.pageBateauxSlug.passagers"),
      value: vessel.passenger_capacity.toLocaleString(intlLocale()),
      hint: tr("ui.pageBateauxSlug.capaciteAnnoncee"),
    });
  if (vessel?.car_capacity)
    facts.push({
      icon: CarFront,
      label: tr("ui.pageBateauxSlug.vehicules"),
      value: vessel.car_capacity.toLocaleString(intlLocale()),
      hint: tr("ui.pageBateauxSlug.capaciteDuGarage"),
    });
  if (vessel?.length_meters)
    facts.push({
      icon: Ruler,
      label: tr("ui.pageBateauxSlug.longueur"),
      value: `${vessel.length_meters.toLocaleString(intlLocale())} m`,
      hint: vessel.speed_knots ? tr("ui.pageBateauxSlug.vitesseNUds", { speedknots: vessel.speed_knots }) : undefined,
    });

  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${v.name} : dossier du navire`,
          url: absoluteUrl(`/bateaux/${v.slug}`),
          inLanguage: "fr",
          description: v.summary,
          about: {
            "@type": "Vehicle",
            name: v.name,
            vehicleConfiguration: tr("ui.pageBateauxSlug.ferryMixtePassagersEtVehicules"),
            ...(company ? { brand: { "@type": "Organization", name: company.name } } : {}),
            ...(vessel?.build_year ? { vehicleModelDate: String(vessel.build_year) } : {}),
            ...(vessel?.passenger_capacity ? { seatingCapacity: vessel.passenger_capacity } : {}),
            ...(vessel?.imo ? { identifier: `IMO ${vessel.imo}` } : {}),
          },
          ...(servedRoutes.length
            ? {
                mentions: servedRoutes.map((route) => ({
                  "@type": "BoatTrip",
                  name: `Ferry ${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`,
                  url: absoluteUrl(`/lignes/${route.slug}`),
                })),
              }
            : {}),
        }}
      />
      <Breadcrumbs
        items={[
          { name: tr("ui.pageBateauxSlug.navires"), path: "/bateaux" },
          { name: v.name, path: `/bateaux/${v.slug}` },
        ]}
      />
      <ShowcaseHero
        overline={
          <span className="inline-flex items-center gap-2">
            {company ? (
              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
            ) : null}
            {tr("ui.pageBateauxSlug.navire")}{company?.name ?? v.company}
          </span>
        }
        title={v.name}
        intro={<p>{v.summary}</p>}
        chips={
          servedRoutes.length ? (
            <>
              {servedRoutes.slice(0, 6).map((route) => (
                <Link
                  key={route.id}
                  to="/lignes/$slug"
                  params={{ slug: route.slug }}
                  className={`${heroChip} hover:border-[#0e7a43]/40`}
                >
                  {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                </Link>
              ))}
            </>
          ) : null
        }
        actions={
          vessel ? (
            <Link
              to="/"
              search={{ select: "vessel", id: vessel.id } as never}
              className={heroPrimary}
            >
              <MapIcon className="size-4" aria-hidden />{tr("ui.pageBateauxSlug.ouEstLe")}{v.name} ?
            </Link>
          ) : null
        }
        visual={
          <div className="relative grid h-full place-items-center overflow-hidden bg-gradient-to-b from-[#dcebf2] via-[#c9e1ec] to-[#8fbfd4] p-6">
            <span
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0f2a3d]/25 to-transparent"
              aria-hidden
            />
            <span className="relative w-full max-w-[520px] [&_img]:h-auto [&_img]:w-full [&_img]:object-contain [&_img]:drop-shadow-xl">
              <VesselThumb
                vessel={vessel ?? { id: v.slug, name: v.name, photo_url: null }}
                width={520}
              />
            </span>
          </div>
        }
      />
      <KeyFacts facts={facts} label={tr("ui.pageBateauxSlug.leEnChiffres", { name: v.name })} />
      <VesselDossierFollow slug={v.slug} />

      {vessel ? (
        <section className="mt-10" aria-labelledby="prochains-departs">
          <SectionTitle
            id="prochains-departs"
            overline={tr("ui.pageBateauxSlug.calendrier")}
            title={tr("ui.pageBateauxSlug.prochainsDepartsDu", { name: v.name })}
          >
            {servedRoutes.length
              ? tr("ui.pageBateauxSlug.programmeSurTouchezUnDepart", { v: servedRoutes.map((route) => `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`).join(", ") })
              : tr("ui.pageBateauxSlug.touchezUnDepartPourLe")}
          </SectionTitle>
          <DepartureRows
            departures={vesselDepartures.slice(0, 6)}
            companies={companies}
            vessels={vessels}
            ports={ports}
            routes={routes}
            timeZone={timeZone}
            showRoute
            empty="Aucun départ publié pour ce navire pour le moment."
          />
        </section>
      ) : null}

      <div className="mt-12">
        <ReadingLayout sections={v.sections}>
          <AnswerBox>{tr("ui.pageBateauxSlug.lesCaracteristiquesDecriventUnNavire")}</AnswerBox>
          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold">
              {tr("ui.pageBateauxSlug.lesReperesDuDossier")}
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
              {v.specs.map((s) => (
                <div key={s.label} className="bg-card p-3 sm:p-4">
                  <dt className="text-sm text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 font-display text-lg font-bold">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {v.sections.map((s) => (
            <ContentSection section={s} key={s.id} />
          ))}
          <VesselDossierCommunity slug={v.slug} />
          <SourceList ids={v.sources} />
        </ReadingLayout>
      </div>

      <nav
        aria-label={tr("ui.pageBateauxSlug.pourAllerPlusLoin")}
        className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          {
            href: "/bateaux",
            title: tr("ui.pageBateauxSlug.touteLaFlotte"),
            text: tr("ui.pageBateauxSlug.lesNaviresDesLignesEurope"),
          },
          {
            href: "/guide/cabine-ou-fauteuil-ferry",
            title: tr("ui.pageBateauxSlug.cabineOuFauteuilFaireLe"),
            text: tr("ui.pageBateauxSlug.bienChoisirSonInstallationA"),
          },
          {
            href: "/guide/voyage-algerie-voiture-checklist",
            title: tr("ui.pageBateauxSlug.preparerLaVoitureEtLe"),
            text: tr("ui.pageBateauxSlug.laListeAvantDEmbarquer"),
          },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-border bg-card p-4 transition hover:border-[#0e7a43]/40"
          >
            <span className="flex items-center justify-between gap-2 font-semibold text-[#0f2a3d]">
              {item.title}
              <ArrowRight
                className="size-4 shrink-0 text-[#0e7a43] transition group-hover:translate-x-0.5"
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
