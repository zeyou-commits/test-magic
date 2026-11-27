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
  FaqSection,
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
import type { Vessel } from "@/lib/ferry/types";
import { portTimeZone } from "@/lib/ferry/time";
import { vesselFaq } from "@/lib/seo/catalogFaq";
import { absoluteUrl, displayDate, seoHead } from "@/lib/seo/site";
import { tr, intlLocale, placeName } from "@/lib/i18n";

/** Résumé d'un navire sans dossier rédigé : seulement ce que dit sa fiche technique. */
function vesselSummary(vessel: Vessel, company: string | null) {
  const parts = [
    company ? tr("ui.pageNavire.resumeCompagnie", { name: vessel.name, company }) : vessel.name,
    vessel.build_year ? tr("ui.pageNavire.resumeAnnee", { year: vessel.build_year }) : null,
    vessel.passenger_capacity
      ? tr("ui.pageNavire.resumePassagers", { n: vessel.passenger_capacity.toLocaleString(intlLocale()) })
      : null,
    vessel.car_capacity
      ? tr("ui.pageNavire.resumeVehicules", { n: vessel.car_capacity.toLocaleString(intlLocale()) })
      : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. ${tr("ui.pageNavire.resumeFin")}`;
}

export const Route = createFileRoute("/bateaux/$slug")({
  loader: async ({ context, params }) => {
    const dossier = vesselDossiers.find((v) => v.slug === params.slug) ?? null;
    // Les données vivantes enrichissent le dossier ; sans la base, le dossier reste lisible.
    const [vessels, companies] = await Promise.all([
      context.queryClient.ensureQueryData(vesselsQuery).catch(() => []),
      context.queryClient.ensureQueryData(companiesQuery).catch(() => []),
      ...[routesQuery, portsQuery, upcomingDeparturesQuery()].map((query) =>
        context.queryClient.ensureQueryData(query as never).catch(() => null),
      ),
    ]);
    const vessel =
      vessels.find((item) => item.slug === params.slug && item.status === "active") ??
      (dossier ? vessels.find((item) => item.name.toLowerCase() === dossier.name.toLowerCase()) : undefined);
    // Un navire a sa page s'il a un dossier rédigé ou une fiche en service dans le catalogue.
    if (!dossier && !vessel) throw notFound();
    const company = vessel?.company_id
      ? (companies.find((item) => item.id === vessel.company_id)?.name ?? null)
      : null;
    return {
      slug: params.slug,
      dossier,
      name: dossier?.name ?? vessel!.name,
      company: dossier?.company ?? company ?? "",
      summary: dossier?.summary ?? vesselSummary(vessel!, company),
    };
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
  const data = Route.useLoaderData();
  const dossier = data.dossier ? localizeContent(data.dossier) : null;
  const v = { slug: data.slug, name: dossier?.name ?? data.name, company: data.company, summary: dossier?.summary ?? data.summary };
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
  const lineName = (route: { departure_port_id: string; arrival_port_id: string }) =>
    `${placeName(portName(route.departure_port_id))} → ${placeName(portName(route.arrival_port_id))}`;
  const firstRoute = servedRoutes[0];
  const timeZone = portTimeZone(
    firstRoute ? ports.find((port) => port.id === firstRoute.departure_port_id) : undefined,
  );
  const year = new Date().getFullYear();
  const path = `/bateaux/${v.slug}`;
  const nextDeparture = vesselDepartures[0];
  const nextRoute = nextDeparture ? routes.find((r) => r.id === nextDeparture.route_id) : undefined;
  const faq = vessel
    ? vesselFaq(
        vessel,
        company,
        servedRoutes.map(lineName),
        nextDeparture && nextRoute ? { at: nextDeparture.departure_at, line: lineName(nextRoute) } : null,
        year,
      )
    : [];
  const sisters = vessel
    ? vessels.filter((item) => item.company_id === vessel.company_id && item.id !== vessel.id && item.status === "active")
    : [];

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

  // Fiche technique tirée du catalogue (navires sans dossier rédigé) : rien d'absent n'est affiché.
  const n = (value: number | null | undefined, unit = "") =>
    value ? `${value.toLocaleString(intlLocale())}${unit}` : null;
  const specs = vessel
    ? (
        [
          [tr("ui.pageNavire.specCompagnie"), company?.name ?? null],
          [tr("ui.pageNavire.specAnnee"), vessel.build_year ? String(vessel.build_year) : null],
          [tr("ui.pageNavire.specChantier"), vessel.builder ?? null],
          [tr("ui.pageNavire.specLongueur"), n(vessel.length_meters, " m")],
          [tr("ui.pageNavire.specLargeur"), n(vessel.beam_meters, " m")],
          [tr("ui.pageNavire.specJauge"), n(vessel.gross_tonnage)],
          [tr("ui.pageNavire.specVitesse"), n(vessel.speed_knots, " nœuds")],
          [tr("ui.pageNavire.specPassagers"), n(vessel.passenger_capacity)],
          [tr("ui.pageNavire.specCabines"), n(vessel.cabin_capacity)],
          [tr("ui.pageNavire.specVehicules"), n(vessel.car_capacity)],
          [tr("ui.pageNavire.specPonts"), n(vessel.deck_count)],
          [tr("ui.pageNavire.specImo"), vessel.imo ? String(vessel.imo) : null],
        ] as const
      ).filter(([, value]) => value)
    : [];

  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${v.name} : dossier du navire`,
          url: absoluteUrl(path),
          inLanguage: "fr",
          description: v.summary,
          ...(vessel?.specs_checked_at ? { dateModified: vessel.specs_checked_at } : {}),
          about: {
            "@type": "Vehicle",
            name: v.name,
            vehicleConfiguration: tr("ui.pageBateauxSlug.ferryMixtePassagersEtVehicules"),
            ...(company ? { brand: { "@type": "Organization", name: company.name, url: absoluteUrl(`/compagnies/${company.slug}`) } } : {}),
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
          { name: v.name, path },
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
                  {lineName(route)}
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

      {dossier ? (
        <div className="mt-12">
          <ReadingLayout sections={dossier.sections}>
            <AnswerBox>{tr("ui.pageBateauxSlug.lesCaracteristiquesDecriventUnNavire")}</AnswerBox>
            <section className="mt-8">
              <h2 className="font-display text-2xl font-bold">
                {tr("ui.pageBateauxSlug.lesReperesDuDossier")}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                {dossier.specs.map((s) => (
                  <div key={s.label} className="bg-card p-3 sm:p-4">
                    <dt className="text-sm text-muted-foreground">{s.label}</dt>
                    <dd className="mt-1 font-display text-lg font-bold">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {dossier.sections.map((s) => (
              <ContentSection section={s} key={s.id} />
            ))}
            <VesselDossierCommunity slug={v.slug} />
            <SourceList ids={dossier.sources} />
          </ReadingLayout>
        </div>
      ) : (
        <>
          {specs.length ? (
            <section className="mt-10" aria-labelledby="fiche-technique">
              <SectionTitle
                id="fiche-technique"
                overline={tr("ui.pageNavire.ficheSurtitre")}
                title={tr("ui.pageNavire.ficheTitre", { name: v.name })}
              >
                {tr("ui.pageBateauxSlug.lesCaracteristiquesDecriventUnNavire")}
              </SectionTitle>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
                {specs.map(([label, value]) => (
                  <div key={label} className="bg-card p-3 sm:p-4">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-display text-lg font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              {vessel?.specs_source_name || vessel?.specs_checked_at ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {tr("ui.pageNavire.source", {
                    source: vessel.specs_source_name ?? "BledWay",
                    date: vessel.specs_checked_at ? displayDate(vessel.specs_checked_at.slice(0, 10)) : "—",
                  })}
                </p>
              ) : null}
            </section>
          ) : null}
          <div className="mt-10">
            <VesselDossierCommunity slug={v.slug} />
          </div>
        </>
      )}

      <FaqSection faq={faq} path={path} />

      {sisters.length ? (
        <nav aria-label={tr("ui.pageNavire.memeCompagnie")} className="mt-10">
          <h2 className="font-display text-xl font-bold">
            {tr("ui.pageNavire.memeCompagnieTitre", { company: company?.name ?? v.company })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sisters.map((item) => (
              <li key={item.id}>
                <Link
                  to="/bateaux/$slug"
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

      <nav
        aria-label={tr("ui.pageBateauxSlug.pourAllerPlusLoin")}
        className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          company
            ? {
                href: `/compagnies/${company.slug}`,
                title: company.name,
                text: tr("ui.pageNavire.versCompagnie"),
              }
            : {
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
