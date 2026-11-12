import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";
import { tr } from "@/lib/i18n";

const title = "Lignes de ferry Europe ↔ Algérie : durées et compagnies — BledWay";
const description =
  "Toutes les lignes de ferry entre l'Europe et l'Algérie, dans les deux sens, avec leur durée typique et leurs compagnies : Marseille, Sète, Alicante, Oran, Alger…";

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
      <Breadcrumbs items={[{ name: "Lignes", path: "/lignes" }]} />
      <PageHero
        overline={tr("ui.pageLignesIndex.lignes")}
        title={tr("ui.pageLignesIndex.toutesLesLignesDeFerry")}
        intro={tr("ui.pageLignesIndex.comparezLesLignesLeurDuree")}
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
                {tr("ui.pageLignesIndex.dureeTypique")}{formatDuration(route.typical_duration_minutes)}
                {route.distance_km ? ` · ${route.distance_km} km` : ""}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {companies
                  .filter((company) => route.company_ids.includes(company.id))
                  .map((company) => company.name)
                  .join(", ") || tr("ui.pageLignesIndex.compagnieAConfirmer")}
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
