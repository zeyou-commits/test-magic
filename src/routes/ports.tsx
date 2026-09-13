import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";

const title = "Ports de ferry vers l'Algérie — Batogo";
const description =
  "Tous les ports desservis : Alger, Oran, Béjaïa, Skikda, Annaba, Marseille, Sète, Alicante, Barcelone et plus. Lignes, durées et services de chaque port.";

export const Route = createFileRoute("/ports")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
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
      <PageHero
        overline="Ports"
        title="Les ports des traversées vers l'Algérie"
        intro="Chaque port est décrit avec ses lignes, ses durées de traversée et les services utiles avant l'embarquement."
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
                      <Link
                        to="/ports/$slug"
                        params={{ slug: port.slug }}
                        className="block"
                      >
                        <h3 className="font-display text-lg font-semibold">{port.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {port.city ? `${port.city} · ` : ""}
                          {count === 0 ? "Aucune ligne" : count === 1 ? "1 ligne" : `${count} lignes`}
                        </p>
                        {port.status === "inactive" ? (
                          <p className="mt-2 text-xs font-semibold text-destructive">
                            Temporairement fermé
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
