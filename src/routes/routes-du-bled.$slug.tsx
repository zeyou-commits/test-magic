import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Clock, Fuel, Hotel, Map as MapIcon, Route as RouteIcon, UtensilsCrossed } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection, StructuredData } from "@/components/editorial/Editorial";
import {
  heroChip,
  heroPrimary,
  KeyFacts,
  SectionTitle,
  ShowcaseHero,
  type Fact,
} from "@/components/editorial/Showcase";
import { Mosque, featureLabel, kindLabel } from "@/components/routesDuBled/StopVisuals";
import { mapsLink, type StopKind } from "@/lib/routesDuBled/data";
import {
  bledRoutePage,
  bledRoutePages,
  endPort,
  placeOf,
  routesData,
  stopCounts,
} from "@/lib/routesDuBled/pages";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { bledRouteFaq } from "@/lib/seo/catalogFaq";
import { absoluteUrl, displayDate, seoHead } from "@/lib/seo/site";
import { intlLocale, placeName, tr } from "@/lib/i18n";

export const Route = createFileRoute("/routes-du-bled/$slug")({
  loader: async ({ context, params }) => {
    // Import à la demande : les relevés des routes (≈ 80 Ko) ne pèsent pas sur les autres pages.
    const { bledRoutePage: findPage } = await import("@/lib/routesDuBled/pages");
    const page = findPage(params.slug);
    if (!page) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery).catch(() => null),
      context.queryClient.ensureQueryData(routesQuery).catch(() => null),
    ]);
    return { slug: page.slug, name: page.route.name, km: page.route.km };
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(
          tr("ui.pageRouteBled.titreSeo", { name: loaderData.name }),
          tr("ui.pageRouteBled.descriptionSeo", { name: loaderData.name, km: loaderData.km }),
          `/routes-du-bled/${loaderData.slug}`,
        )
      : { meta: [{ name: "robots", content: "noindex" }] },
  component: BledRoutePageView,
});

const ORDER: StopKind[] = ["carburant", "priere", "manger", "dormir", "aire", "garage", "billets"];
const ICON: Partial<Record<StopKind, typeof Fuel>> = {
  carburant: Fuel,
  manger: UtensilsCrossed,
  dormir: Hotel,
};

function BledRoutePageView() {
  const { slug } = Route.useLoaderData();
  const { route } = bledRoutePage(slug)!;
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: lines } = useSuspenseQuery(routesQuery);
  const path = `/routes-du-bled/${slug}`;
  const from = placeOf(route.via[0] ?? "");
  const to = placeOf(route.via.at(-1) ?? "");
  const portLabel = endPort(route);
  const port = portLabel
    ? ports.find((item) => item.name.toLowerCase() === portLabel.toLowerCase())
    : undefined;
  const ferryLines = port ? lines.filter((line) => line.departure_port_id === port.id) : [];
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const counts = stopCounts(route);
  const hours = Math.floor(route.h);
  const minutes = Math.round((route.h - hours) * 60);
  const duration = minutes ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;
  const faq = bledRouteFaq({
    name: route.name,
    from: placeName(from),
    to: placeName(to),
    km: route.km,
    hours: route.h,
    counts,
    halal: counts.halal,
    port: port ? placeName(port.name) : null,
  });
  const byKind = ORDER.map((kind) => ({
    kind,
    stops: route.stops.filter((stop) => stop.k === kind).sort((a, b) => a.km - b.km),
  })).filter((group) => group.stops.length);
  const others = bledRoutePages.filter((page) => page.slug !== slug);

  const facts: Fact[] = [
    { icon: RouteIcon, label: tr("ui.pageRouteBled.distance"), value: `${route.km.toLocaleString(intlLocale())} km` },
    {
      icon: Clock,
      label: tr("ui.pageRouteBled.conduite"),
      value: duration,
      hint: tr("ui.pageRouteBled.sansPauses"),
    },
    {
      icon: Fuel,
      label: tr("ui.pageRouteBled.stations"),
      value: String(counts.carburant),
      hint: counts.h24 ? tr("ui.pageRouteBled.ouvert24h", { n: counts.h24 }) : undefined,
    },
    {
      icon: Mosque,
      label: tr("ui.pageRouteBled.priere"),
      value: String(counts.priere),
      hint: counts.halal ? tr("ui.pageRouteBled.halal", { n: counts.halal }) : undefined,
    },
  ];

  return (
    <SiteLayout>
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: route.name,
          url: absoluteUrl(path),
          inLanguage: "fr",
          dateModified: routesData.version,
          about: {
            "@type": "Trip",
            name: route.name,
            itinerary: {
              "@type": "ItemList",
              itemListElement: route.via.map((place, index) => ({
                "@type": "ListItem",
                position: index + 1,
                item: { "@type": "Place", name: placeOf(place) },
              })),
            },
          },
        }}
      />
      <Breadcrumbs
        items={[
          { name: tr("ui.pageRouteBled.routesDuBled"), path: "/routes-du-bled" },
          { name: route.name, path },
        ]}
      />
      <ShowcaseHero
        overline={tr("ui.pageRouteBled.surtitre")}
        title={tr("ui.pageRouteBled.titre", { name: route.name })}
        intro={
          <p>
            {tr("ui.pageRouteBled.intro", {
              from: placeName(from),
              to: placeName(to),
              km: route.km.toLocaleString(intlLocale()),
              duree: duration,
              n: route.stops.length,
            })}
          </p>
        }
        chips={
          <>
            {route.via.map((place) => (
              <span key={place} className={heroChip}>
                {placeName(placeOf(place))}
              </span>
            ))}
          </>
        }
        actions={
          <Link to="/routes-du-bled" className={heroPrimary}>
            <MapIcon className="size-4" aria-hidden />
            {tr("ui.pageRouteBled.ouvrirCarte")}
          </Link>
        }
        visual={
          <div className="grid h-full place-items-center bg-gradient-to-b from-[#f1f8f4] to-[#dcebf2] p-6">
            <ol className="w-full max-w-sm space-y-3">
              {route.via.map((place, index) => (
                <li key={place} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0e7a43] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="font-display text-lg font-bold text-[#0f2a3d]">
                    {placeName(placeOf(place))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        }
      />
      <KeyFacts facts={facts} label={tr("ui.pageRouteBled.enChiffres", { name: route.name })} />

      <section className="mt-10" aria-labelledby="pauses">
        <SectionTitle
          id="pauses"
          overline={tr("ui.pageRouteBled.securite")}
          title={tr("ui.pageRouteBled.pausesTitre")}
        >
          {tr("ui.pageRouteBled.pausesTexte", { n: Math.max(1, Math.floor(route.h / 2)), s: route.h >= 4 ? "s" : "" })}
        </SectionTitle>
      </section>

      {byKind.map(({ kind, stops }) => {
        const Icon = ICON[kind];
        return (
          <section key={kind} className="mt-10" aria-labelledby={`haltes-${kind}`}>
            <SectionTitle
              id={`haltes-${kind}`}
              overline={tr("ui.pageRouteBled.haltes")}
              title={tr("ui.pageRouteBled.groupe", { kind: kindLabel(kind), n: stops.length })}
            />
            <ul className="mt-4 divide-y rounded-2xl border border-border bg-card">
              {stops.map((stop) => (
                <li key={stop.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="w-16 shrink-0 text-sm font-bold tabular-nums text-[#0e7a43]">
                    km {Math.round(stop.km)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <a
                      href={mapsLink(stop)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-[#0f2a3d] hover:text-[#0e7a43]"
                    >
                      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
                      {stop.n}
                    </a>
                    {stop.place ? <span className="text-sm text-muted-foreground"> · {stop.place}</span> : null}
                    {stop.f.length ? (
                      <span className="block text-sm text-muted-foreground">
                        {stop.f.map((feature) => featureLabel(feature)).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {port ? (
        <section className="mt-10" aria-labelledby="ferry">
          <SectionTitle
            id="ferry"
            overline={tr("ui.pageRouteBled.ensuite")}
            title={tr("ui.pageRouteBled.ferryDepuis", { port: placeName(port.name) })}
          >
            {tr("ui.pageRouteBled.ferryAide")}
          </SectionTitle>
          <ul className="mt-4 flex flex-wrap gap-2">
            <li>
              <Link to="/ports/$slug" params={{ slug: port.slug }} className={`${heroChip} hover:border-[#0e7a43]/40`}>
                {tr("ui.pageRouteBled.lePort", { port: placeName(port.name) })}
              </Link>
            </li>
            {ferryLines.map((line) => (
              <li key={line.id}>
                <Link
                  to="/lignes/$slug"
                  params={{ slug: line.slug }}
                  className={`${heroChip} hover:border-[#0e7a43]/40`}
                >
                  {placeName(portName(line.departure_port_id))} → {placeName(portName(line.arrival_port_id))}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FaqSection faq={faq} path={path} />

      <p className="mt-8 text-sm text-muted-foreground">
        {tr("ui.pageRouteBled.source", { date: displayDate(routesData.version) })}
      </p>

      {others.length ? (
        <nav aria-label={tr("ui.pageRouteBled.autres")} className="mt-8">
          <h2 className="font-display text-xl font-bold">{tr("ui.pageRouteBled.autres")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((page) => (
              <li key={page.slug}>
                <Link
                  to="/routes-du-bled/$slug"
                  params={{ slug: page.slug }}
                  className={`${heroChip} hover:border-[#0e7a43]/40`}
                >
                  {page.route.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </SiteLayout>
  );
}
