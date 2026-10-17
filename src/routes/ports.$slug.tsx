import { absoluteUrl, breadcrumbSchema, jsonLdString, seoHead } from "@/lib/seo/site";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import {
  facilityLabels,
  formatDuration,
  isFacilityFilled,
  ratingOnlyFacilities,
} from "@/lib/ferry/format";

export const Route = createFileRoute("/ports/$slug")({
  loader: async ({ context, params }) => {
    const ports = await context.queryClient.ensureQueryData(portsQuery);
    const port = ports.find((item) => item.slug === params.slug);
    if (!port) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
    return { name: port.name, country: port.country_name, slug: port.slug };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Port indisponible — Batogo" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Ferry ${loaderData.name} (${loaderData.country}) — lignes et durées | Batogo`;
    const description = `Traversées en ferry au départ et à l'arrivée du port de ${loaderData.name} : lignes desservies, durées, compagnies et services du port.`;
    return seoHead(title, description, `/ports/${loaderData.slug}`);
  },
  component: PortPage,
});

function PortPage() {
  const { slug } = Route.useParams();
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);

  const port = ports.find((item) => item.slug === slug);
  if (!port) return null;
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const portSlug = (id: string) => ports.find((item) => item.id === id)?.slug ?? "";
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === port.id || route.arrival_port_id === port.id,
  );
  const facilities = Object.entries(port.facilities ?? {}).filter(
    ([key, value]) => !ratingOnlyFacilities.has(key) && isFacilityFilled(value),
  );
  const operators = companies.filter((company) =>
    portRoutes.some((route) => route.company_ids.includes(company.id)),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `Port de ${port.name}`,
    address: { "@type": "PostalAddress", addressCountry: port.country_code },
    geo: { "@type": "GeoCoordinates", latitude: port.latitude, longitude: port.longitude },
  };

  return (
    <SiteLayout>
      <Breadcrumbs
        items={[
          { name: "Ports", path: "/ports" },
          { name: port.name, path: `/ports/${port.slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <PageHero
        overline={`${port.country_name}${port.city ? ` · ${port.city}` : ""}`}
        title={`Ferry au port de ${port.name}`}
        intro={
          port.notes ??
          `Lignes maritimes, durées de traversée et compagnies desservant le port de ${port.name}.`
        }
      />
      <div className="flex justify-center">
        <Link
          to="/"
          search={{ select: "port", id: port.id } as never}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Voir les prochains départs sur la carte
        </Link>
      </div>
      {port.status === "inactive" ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          Ce port est temporairement fermé : les traversées ne sont pas assurées actuellement.
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          Lignes au départ ou à l'arrivée ({portRoutes.length})
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {portRoutes.map((route) => (
            <Card key={route.id}>
              <Link to="/lignes/$slug" params={{ slug: route.slug }} className="block">
                <h3 className="font-display font-semibold">
                  {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Durée typique : {formatDuration(route.typical_duration_minutes)}
                </p>
              </Link>
            </Card>
          ))}
          {portRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune ligne enregistrée pour ce port.</p>
          ) : null}
        </div>
      </section>

      {facilities.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Services du port</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {facilities.map(([key, value]) => (
              <div key={key} className="rounded-xl bg-secondary/60 px-4 py-3">
                <dt className="text-sm font-semibold">{facilityLabels[key] ?? key}</dt>
                <dd className="text-sm text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {operators.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Compagnies présentes</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {operators.map((company) => (
              <li key={company.id} className="rounded-full border border-border px-3 py-1 text-sm">
                {company.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Ports reliés</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            ...new Set(
              portRoutes.map((route) =>
                route.departure_port_id === port.id
                  ? route.arrival_port_id
                  : route.departure_port_id,
              ),
            ),
          ].map((id) => (
            <li key={id}>
              <Link
                to="/ports/$slug"
                params={{ slug: portSlug(id) }}
                className="rounded-full bg-secondary px-3 py-1 text-sm hover:bg-secondary/70"
              >
                {portName(id)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-10 text-sm">
        <a
          href="/voyage-algerie"
          className="font-semibold text-primary underline underline-offset-4"
        >
          Préparer la traversée
        </a>{" "}
        ·{" "}
        <a
          href="/simulateurs/budget-voyage"
          className="font-semibold text-primary underline underline-offset-4"
        >
          Comparer le budget du voyage
        </a>
      </p>
    </SiteLayout>
  );
}
