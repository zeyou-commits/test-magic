import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { companiesQuery, portsQuery, routesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";

const title = "Horaires des ferries vers l'Algérie — prochains départs | Batogo";
const description =
  "Les prochains départs de ferry connus vers et depuis l'Algérie : date, heure, compagnie, durée de traversée et fiabilité de l'information.";

export const Route = createFileRoute("/horaires")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
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
  component: HorairesPage,
});

function HorairesPage() {
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";

  const rows = departures;

  return (
    <SiteLayout>
      <PageHero
        overline="Horaires"
        title="Prochains départs de ferry"
        intro="Les départs connus à venir, ligne par ligne. Chaque information indique sa source et sa date de vérification sur la fiche de la ligne."
      />
      <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-panel)]">
        <table className="hidden w-full text-left text-sm sm:table">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Départ</th>
              <th className="px-4 py-3">Ligne</th>
              <th className="px-4 py-3">Compagnie</th>
              <th className="px-4 py-3">Durée</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((departure) => {
              const route = routes.find((item) => item.id === departure.route_id);
              const company = companies.find((item) => item.id === departure.company_id);
              return (
                <tr key={departure.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">
                    {formatDateTime(departure.departure_at)}
                    {departure.status === "cancelled" ? (
                      <span className="ml-2 text-xs font-semibold text-destructive">Annulé</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {route ? (
                      <Link
                        to="/lignes/$slug"
                        params={{ slug: route.slug }}
                        className="hover:text-primary"
                      >
                        {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{company?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDuration(departure.duration_minutes)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Aucun départ connu à venir pour l'instant.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="grid gap-2 p-2 sm:hidden">
          {rows.map((departure) => {
            const route = routes.find((item) => item.id === departure.route_id);
            const company = companies.find((item) => item.id === departure.company_id);
            return (
              <article key={departure.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatDateTime(departure.departure_at)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{company?.name ?? "Compagnie inconnue"}</p>
                  </div>
                  {departure.status === "cancelled" ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">Annulé</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm">
                  {route ? (
                    <Link to="/lignes/$slug" params={{ slug: route.slug }} className="font-medium hover:text-primary">
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    </Link>
                  ) : "Ligne inconnue"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Durée : {formatDuration(departure.duration_minutes)}</p>
              </article>
            );
          })}
          {rows.length === 0 ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">Aucun départ connu à venir pour l'instant.</p> : null}
        </div>
      </div>
    </SiteLayout>
  );
}
