import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";

const title = "Lignes de ferry vers l'Algérie : durées et compagnies — Batogo";
const description =
  "Toutes les liaisons maritimes vers l'Algérie avec leur durée typique et les compagnies qui les opèrent : Marseille, Sète, Alicante, Barcelone, Marseille–Alger, Oran, Béjaïa…";

export const Route = createFileRoute("/lignes")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
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
  component: LignesPage,
});

function LignesPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";

  return (
    <SiteLayout>
      <PageHero
        overline="Lignes"
        title="Toutes les lignes de ferry vers l'Algérie"
        intro="Comparez les liaisons, leur durée typique et les compagnies qui les assurent, puis ouvrez la fiche d'une ligne pour ses calendriers."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((route) => (
          <Card key={route.id}>
            <Link to="/lignes/$slug" params={{ slug: route.slug }} className="block">
              <h2 className="font-display text-lg font-semibold">
                {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Durée typique : {formatDuration(route.typical_duration_minutes)}
                {route.distance_km ? ` · ${route.distance_km} km` : ""}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {companies
                  .filter((company) => route.company_ids.includes(company.id))
                  .map((company) => company.name)
                  .join(", ") || "Compagnie à confirmer"}
              </p>
            </Link>
          </Card>
        ))}
      </div>
    </SiteLayout>
  );
}
