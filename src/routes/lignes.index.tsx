import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";

const title = "Lignes de ferry Europe ↔ Algérie : durées et compagnies — BledWay";
const description =
  "Toutes les lignes maritimes entre l'Europe et l'Algérie, dans les deux sens, avec leur durée typique et les compagnies qui les opèrent : Marseille, Sète, Alicante, Barcelone, Marseille–Alger, Oran, Béjaïa…";

export const Route = createFileRoute("/lignes/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
  },
  head: () => seoHead(title, description, "/lignes"),
  component: LignesPage,
});

function LignesPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const fromAlgeria = (departurePortId: string) =>
    ports.find((item) => item.id === departurePortId)?.country_code === "DZ";
  const groups = [
    { title: "Depuis l'Europe vers l'Algérie", items: routes.filter((r) => !fromAlgeria(r.departure_port_id)) },
    { title: "Depuis l'Algérie vers l'Europe", items: routes.filter((r) => fromAlgeria(r.departure_port_id)) },
  ];

  return (
    <SiteLayout>
      <PageHero
        overline="Lignes"
        title="Toutes les lignes de ferry Europe ↔ Algérie"
        intro="Comparez les lignes, leur durée typique et les compagnies qui les assurent, puis ouvrez la fiche d'une ligne pour ses jours de départ."
      />
      {groups.map((group) => (
      <section key={group.title} className="mt-10">
      <h2 className="text-xl font-semibold">{group.title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.items.map((route) => (
          <Card key={route.id}>
            <Link to="/lignes/$slug" params={{ slug: route.slug }} className="block">
              <h3 className="font-display text-lg font-semibold">
                {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
              </h3>
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
      </section>
      ))}
    </SiteLayout>
  );
}
