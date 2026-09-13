import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";

const title = "Compagnies de ferry vers l'Algérie — Batogo";
const description =
  "Les compagnies maritimes qui relient l'Europe à l'Algérie : lignes desservies, flotte et durées de traversée.";

export const Route = createFileRoute("/compagnies")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: CompagniesPage,
});

function CompagniesPage() {
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";

  return (
    <SiteLayout>
      <PageHero
        overline="Compagnies"
        title="Les compagnies qui desservent l'Algérie"
        intro="Qui opère quelle ligne, avec quels navires et quelles durées de traversée."
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {companies.map((company) => {
          const lines = routes.filter((route) => route.company_ids.includes(company.id));
          const fleet = vessels.filter((vessel) => vessel.company_id === company.id);
          return (
            <Card key={company.id}>
              <h2 className="font-display text-xl font-semibold">{company.name}</h2>
              {company.description ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {company.description}
                </p>
              ) : null}
              <h3 className="mt-4 text-sm font-semibold">Lignes ({lines.length})</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {lines.map((route) => (
                  <li key={route.id}>
                    <Link
                      to="/lignes/$slug"
                      params={{ slug: route.slug }}
                      className="hover:text-primary"
                    >
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)} ·{" "}
                      {formatDuration(route.typical_duration_minutes)}
                    </Link>
                  </li>
                ))}
              </ul>
              {fleet.length > 0 ? (
                <>
                  <h3 className="mt-4 text-sm font-semibold">Flotte ({fleet.length})</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fleet.map((vessel) => vessel.name).join(", ")}
                  </p>
                </>
              ) : null}
              {company.website_url ? (
                <a
                  href={company.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4"
                >
                  Site officiel
                </a>
              ) : null}
            </Card>
          );
        })}
      </div>
    </SiteLayout>
  );
}
