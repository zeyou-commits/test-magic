import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration, weekdayLabels } from "@/lib/ferry/format";

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
      context.queryClient.ensureQueryData(schedulesQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
    return {
      from: ports.find((port) => port.id === route.departure_port_id)?.name ?? "—",
      to: ports.find((port) => port.id === route.arrival_port_id)?.name ?? "—",
      duration: formatDuration(route.typical_duration_minutes),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Ligne indisponible — Batogo" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Ferry ${loaderData.from} — ${loaderData.to} : durée, horaires, compagnies | Batogo`;
    const description = `Traversée en ferry ${loaderData.from} → ${loaderData.to} : durée typique de ${loaderData.duration}, calendrier habituel, compagnies et prochains départs connus.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: LignePage,
});

function LignePage() {
  const { slug } = Route.useParams();
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: schedules } = useSuspenseQuery(schedulesQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());

  const route = routes.find((item) => item.slug === slug);
  if (!route) return null;
  const from = ports.find((port) => port.id === route.departure_port_id);
  const to = ports.find((port) => port.id === route.arrival_port_id);
  const routeSchedules = schedules.filter((schedule) => schedule.route_id === route.id);
  const nextDepartures = departures
    .filter((departure) => departure.route_id === route.id)
    .slice(0, 10);
  const operators = companies.filter((company) => route.company_ids.includes(company.id));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Combien de temps dure la traversée ${from?.name} — ${to?.name} ?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `La durée typique de la traversée est de ${formatDuration(
            route.typical_duration_minutes,
          )}.`,
        },
      },
      {
        "@type": "Question",
        name: `Quelles compagnies assurent la ligne ${from?.name} — ${to?.name} ?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            operators.map((company) => company.name).join(", ") ||
            "Les compagnies desservant cette ligne restent à confirmer.",
        },
      },
    ],
  };

  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHero
        overline="Ligne maritime"
        title={`Ferry ${from?.name ?? "—"} → ${to?.name ?? "—"}`}
        intro={`Durée typique : ${formatDuration(route.typical_duration_minutes)}${
          route.distance_km ? ` · ${route.distance_km} km` : ""
        }. ${route.notes ?? ""}`}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {[from, to].map((port) =>
          port ? (
            <Link
              key={port.id}
              to="/ports/$slug"
              params={{ slug: port.slug }}
              className="rounded-full bg-secondary px-3 py-1 text-sm hover:bg-secondary/70"
            >
              Port de {port.name}
            </Link>
          ) : null,
        )}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Calendrier habituel</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {routeSchedules.map((schedule) => {
            const company = companies.find((item) => item.id === schedule.company_id);
            const vessel = vessels.find((item) => item.id === schedule.default_vessel_id);
            return (
              <Card key={schedule.id}>
                <p className="font-display font-semibold">
                  Départ {schedule.departure_time.slice(0, 5)} ·{" "}
                  {formatDuration(schedule.duration_minutes)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {schedule.weekdays
                    .map((day) => weekdayLabels[day - 1] ?? "")
                    .filter(Boolean)
                    .join(", ")}
                  {company ? ` · ${company.name}` : ""}
                  {vessel ? ` · ${vessel.name}` : ""}
                </p>
              </Card>
            );
          })}
          {routeSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun calendrier vérifié pour cette ligne pour le moment.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Prochains départs connus</h2>
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
          {nextDepartures.map((departure) => {
            const company = companies.find((item) => item.id === departure.company_id);
            return (
              <li
                key={departure.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">{formatDateTime(departure.departure_at)}</span>
                <span className="text-muted-foreground">
                  {company?.name ?? "—"}
                  {departure.duration_minutes
                    ? ` · ${formatDuration(departure.duration_minutes)}`
                    : ""}
                  {departure.status === "cancelled" ? " · Annulé" : ""}
                </span>
              </li>
            );
          })}
          {nextDepartures.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Aucun départ connu à venir sur cette ligne.
            </li>
          ) : null}
        </ul>
      </section>
    </SiteLayout>
  );
}
