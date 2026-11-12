import { LineAlertNotice, VesselAlertTag } from "@/components/panel/VesselAlert";
import { LineCalendar } from "@/components/panel/LineCalendar";
import { absoluteUrl, breadcrumbSchema, jsonLdString, seoHead } from "@/lib/seo/site";
import { AnswerBox, Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { lineFaq, lineSummary } from "@/lib/seo/answers";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { deName, formatDateTime, formatDuration } from "@/lib/ferry/format";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { BookingLink } from "@/components/panel/shared";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/lignes/$slug")({
  loader: async ({ context, params }) => {
    const [routes, ports] = await Promise.all([
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
    ]);
    const route = routes.find((item) => item.slug === params.slug);
    if (!route) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
    return {
      from: ports.find((port) => port.id === route.departure_port_id)?.name ?? "—",
      to: ports.find((port) => port.id === route.arrival_port_id)?.name ?? "—",
      duration: formatDuration(route.typical_duration_minutes),
      slug: route.slug,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Ligne indisponible — BledWay" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Ferry ${loaderData.from} — ${loaderData.to} : durée, horaires, compagnies | BledWay`;
    const description = `Ferry ${loaderData.from} → ${loaderData.to} : durée typique estimée à ${loaderData.duration}, jours de départ, compagnies et prochains départs connus.`;
    return seoHead(title, description, `/lignes/${loaderData.slug}`);
  },
  component: LignePage,
});

function LignePage() {
  const { slug } = Route.useParams();
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());

  const route = routes.find((item) => item.slug === slug);
  if (!route) return null;
  const from = ports.find((port) => port.id === route.departure_port_id);
  const to = ports.find((port) => port.id === route.arrival_port_id);
  const lineDepartures = departures.filter((departure) => departure.route_id === route.id);
  const nextDepartures = lineDepartures.slice(0, 10);
  const operators = companies.filter(
    (company) =>
      route.company_ids.includes(company.id) ||
      lineDepartures.some((departure) => departure.company_id === company.id),
  );
  const timeZone = portTimeZone(from);
  const reverse = routes.find(
    (item) =>
      item.departure_port_id === route.arrival_port_id &&
      item.arrival_port_id === route.departure_port_id,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Ferry ${from?.name ?? ""} → ${to?.name ?? ""}`,
    url: absoluteUrl(`/lignes/${route.slug}`),
    inLanguage: "fr",
  };

  return (
    <SiteLayout>
      <Breadcrumbs
        items={[
          { name: "Lignes", path: "/lignes" },
          { name: `${from?.name ?? ""} → ${to?.name ?? ""}`, path: `/lignes/${route.slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <PageHero
        overline={tr("ui.pageLignesSlug.ligneMaritime")}
        title={`Ferry ${from?.name ?? "—"} → ${to?.name ?? "—"}`}
        intro={`Durée typique : ${formatDuration(route.typical_duration_minutes)}${
          route.distance_km ? ` · ${route.distance_km} km` : ""
        }. ${route.notes ?? ""}`}
      />

      <div className="mx-auto mb-6 max-w-3xl">
        <AnswerBox>
          {lineSummary(
            from?.name ?? "—",
            to?.name ?? "—",
            route.typical_duration_minutes,
            operators.map((company) => company.name),
          )}
        </AnswerBox>
      </div>

      <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
        <Link
          to="/"
          search={{ select: "route", id: route.id } as never}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {tr("ui.pageLignesSlug.voirSurLaCarte")}
        </Link>
        {reverse ? (
          <Link
            to="/lignes/$slug"
            params={{ slug: reverse.slug }}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-semibold hover:bg-secondary"
          >
            {tr("ui.pageLignesSlug.sensInverse")}{to?.name} → {from?.name}
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {[from, to].map((port) =>
          port ? (
            <Link
              key={port.id}
              to="/ports/$slug"
              params={{ slug: port.slug }}
              className="rounded-full bg-secondary px-3 py-1 text-sm hover:bg-secondary/70"
            >
              {tr("ui.pageLignesSlug.port")}{deName(port.name)}
            </Link>
          ) : null,
        )}
      </div>

      {operators.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{tr("ui.pageLignesSlug.reserverCetteTraversee")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr("ui.pageLignesSlug.laReservationSeFaitDirectement")}
          </p>
          <div className="mt-4 empty:hidden">
            <LineAlertNotice departures={lineDepartures} vessels={vessels} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {operators.map((company) => (
              <Card key={company.id}>
                <p className="mb-3 font-display font-semibold">{company.name}</p>
                <BookingLink company={company} />
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{tr("ui.pageLignesSlug.joursEtHeuresDeDepart")}</h2>
        <div className="mt-4">
          <LineCalendar departures={lineDepartures} companies={companies} timeZone={timeZone} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          {tr("ui.pageLignesSlug.prochainsDepartsConnus")}{" "}
          <span className="text-base font-normal text-muted-foreground">
            · {zoneLabel(timeZone)}
          </span>
        </h2>
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
          {nextDepartures.map((departure) => {
            const company = companies.find((item) => item.id === departure.company_id);
            const vessel = vessels.find((item) => item.id === departure.vessel_id);
            return (
              <li
                key={departure.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {formatDateTime(departure.departure_at, timeZone)}
                </span>
                <span className="text-muted-foreground">
                  {company?.name ?? "—"}
                  {departure.duration_minutes
                    ? ` · ${formatDuration(departure.duration_minutes)}`
                    : ""}
                  {departure.status === "cancelled" ? tr("ui.pageLignesSlug.annule") : ""}
                  {vessel ? ` · ${vessel.name} ` : ""}
                  <VesselAlertTag vesselId={vessel?.id} />
                </span>
              </li>
            );
          })}
          {nextDepartures.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              {tr("ui.pageLignesSlug.aucunDepartConnuAVenir")}
            </li>
          ) : null}
        </ul>
      </section>
      <FaqSection
        path={`/lignes/${route.slug}`}
        faq={lineFaq({
          from: from?.name ?? "—",
          to: to?.name ?? "—",
          fromSlug: from?.slug,
          toSlug: to?.slug,
          minutes: route.typical_duration_minutes,
          operators: operators.map((company) => company.name),
          hasReverse: Boolean(reverse),
        })}
      />
      <p className="mt-10 text-sm">
        <a href="/barometre-prix" className="font-semibold text-primary underline underline-offset-4">
          {tr("ui.pageLignesSlug.reperesDePrixParLigne")}
        </a>{" "}
        ·{" "}
        <a href="/questions-frequentes" className="font-semibold text-primary underline underline-offset-4">
          {tr("ui.pageLignesSlug.questionsFrequentes")}
        </a>{" "}
        ·{" "}
        <a
          href="/voyage-algerie"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {tr("ui.pageLignesSlug.preparerLaTraversee")}
        </a>{" "}
        ·{" "}
        <a
          href="/simulateurs/budget-voyage"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {tr("ui.pageLignesSlug.comparerLeBudgetDuVoyage")}
        </a>
      </p>
    </SiteLayout>
  );
}
