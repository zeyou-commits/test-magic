import { absoluteUrl, breadcrumbSchema, jsonLdString, seoHead } from "@/lib/seo/site";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { portFaq } from "@/lib/seo/answers";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import {
  deName,
  facilityLabels,
  formatDuration,
  isFacilityFilled,
  ratingOnlyFacilities,
} from "@/lib/ferry/format";
import { tr } from "@/lib/i18n";

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
        meta: [{ title: "Port indisponible — BledWay" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Ferry ${loaderData.name} (${loaderData.country}) — lignes et durées | BledWay`;
    const description = `Traversées en ferry au départ et à l'arrivée du port ${deName(loaderData.name)} : lignes desservies, durées, compagnies et services du port.`;
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
    name: `Port ${deName(port.name)}`,
    url: absoluteUrl(`/ports/${port.slug}`),
    address: {
      "@type": "PostalAddress",
      addressCountry: port.country_code,
      ...(port.city ? { addressLocality: port.city } : {}),
    },
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
        title={`Ferry au port ${deName(port.name)}`}
        intro={
          port.notes ??
          `Lignes maritimes, durées de traversée et compagnies desservant le port ${deName(port.name)}.`
        }
      />
      <div className="flex justify-center">
        <Link
          to="/"
          search={{ select: "port", id: port.id } as never}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {tr("ui.pagePortsSlug.voirLesProchainsDepartsSur")}
        </Link>
      </div>
      {port.status === "inactive" ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr("ui.pagePortsSlug.cePortEstTemporairementFerme")}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          {tr("ui.pagePortsSlug.lignesAuDepartOuA")}{portRoutes.length})
        </h2>
        <div className="bw-port-lines mt-4 grid gap-4 sm:grid-cols-2">
          {portRoutes.map((route) => (
            <Card key={route.id}>
              <Link to="/lignes/$slug" params={{ slug: route.slug }} className="block">
                <h3 className="font-display font-semibold">
                  {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tr("ui.pagePortsSlug.dureeTypique")}{formatDuration(route.typical_duration_minutes)}
                </p>
              </Link>
            </Card>
          ))}
          {portRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("ui.pagePortsSlug.aucuneLigneEnregistreePourCe")}</p>
          ) : null}
        </div>
      </section>

      {facilities.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{tr("ui.pagePortsSlug.servicesDuPort")}</h2>
          <dl className="bw-port-services mt-4 grid gap-3 sm:grid-cols-2">
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
          <h2 className="text-xl font-semibold">{tr("ui.pagePortsSlug.compagniesPresentes")}</h2>
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
        <h2 className="text-xl font-semibold">{tr("ui.pagePortsSlug.portsRelies")}</h2>
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
      <FaqSection
        path={`/ports/${port.slug}`}
        faq={portFaq({
          name: port.name,
          country: port.country_name,
          connected: [
            ...new Set(
              portRoutes.map((route) =>
                portName(
                  route.departure_port_id === port.id
                    ? route.arrival_port_id
                    : route.departure_port_id,
                ),
              ),
            ),
          ],
          operators: operators.map((company) => company.name),
          inactive: port.status === "inactive",
        })}
      />
      <p className="mt-10 text-sm">
        <a href="/questions-frequentes" className="font-semibold text-primary underline underline-offset-4">
          {tr("ui.pagePortsSlug.questionsFrequentes")}
        </a>{" "}
        ·{" "}
        <a
          href="/voyage-algerie"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {tr("ui.pagePortsSlug.preparerLaTraversee")}
        </a>{" "}
        ·{" "}
        <a
          href="/simulateurs/budget-voyage"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {tr("ui.pagePortsSlug.comparerLeBudgetDuVoyage")}
        </a>
      </p>
    </SiteLayout>
  );
}
