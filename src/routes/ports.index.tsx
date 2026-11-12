import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { tr } from "@/lib/i18n";

const title = "Ports de ferry Europe ↔ Algérie — BledWay";
const description =
  "Tous les ports desservis : Alger, Oran, Béjaïa, Skikda, Annaba, Marseille, Sète, Alicante, Barcelone et plus. Lignes, durées et services de chaque port.";

export const Route = createFileRoute("/ports/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
    ]);
  },
  head: () => seoHead(title, description, "/ports"),
  component: PortsPage,
});

function PortsPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);

  const groups = [...new Set(ports.map((port) => port.country_name))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Ports", path: "/ports" }]} />
      <PageHero
        overline={tr("ui.pagePortsIndex.ports")}
        title={tr("ui.pagePortsIndex.lesPortsDesTraverseesEntre")}
        intro={tr("ui.pagePortsIndex.chaquePortEstDecritAvec")}
      />
      <div className="mt-10 space-y-10">
        {groups.map((country) => (
          <section key={country}>
            <h2 className="text-xl font-semibold">{country}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ports
                .filter((port) => port.country_name === country)
                .map((port) => {
                  const count = routes.filter(
                    (route) =>
                      route.departure_port_id === port.id || route.arrival_port_id === port.id,
                  ).length;
                  return (
                    <Card key={port.id}>
                      <Link to="/ports/$slug" params={{ slug: port.slug }} className="block">
                        <h3 className="font-display text-lg font-semibold">{port.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {port.city ? `${port.city} · ` : ""}
                          {count === 0
                            ? tr("ui.pagePortsIndex.aucuneLigne")
                            : count === 1
                              ? tr("ui.pagePortsIndex.t1Ligne")
                              : `${count} lignes`}
                        </p>
                        {port.status === "inactive" ? (
                          <p className="mt-2 text-xs font-semibold text-destructive">
                            {tr("ui.pagePortsIndex.temporairementFerme")}
                          </p>
                        ) : null}
                      </Link>
                    </Card>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </SiteLayout>
  );
}
