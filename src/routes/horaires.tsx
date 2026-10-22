import { seoHead } from "@/lib/seo/site";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import {
  capitalizeFirst,
  formatDuration,
  formatShortDay,
  formatTime,
  reliabilityLabel,
  reliabilityTone,
} from "@/lib/ferry/format";
import { dateKeyInZone, portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { FollowButton } from "@/components/panel/FollowButton";
import type { Port } from "@/lib/ferry/types";

const title = "Horaires des ferries Europe ↔ Algérie — prochains départs | Batogo";
const description =
  "Les prochains départs de ferry connus vers et depuis l'Algérie : date, heure locale du port, compagnie, durée de traversée et fiabilité de l'information.";

const PAGE_SIZE = 40;
type Direction = "all" | "toAlgeria" | "fromAlgeria";

export const Route = createFileRoute("/horaires")({
  validateSearch: (search: Record<string, unknown>): { from?: string; to?: string; month?: string } => {
    const result: { from?: string; to?: string; month?: string } = {};
    if (typeof search['from'] === "string" && /^[\da-f-]{36}$/i.test(search['from'])) result.from = search['from'];
    if (typeof search['to'] === "string" && /^[\da-f-]{36}$/i.test(search['to'])) result.to = search['to'];
    if (typeof search['month'] === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search['month'])) result.month = search['month'];
    return result;
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
  },
  head: () => seoHead(title, description, "/horaires"),
  component: HorairesPage,
});

const isAlgeria = (port: Port | undefined) => port?.country_code === "DZ";

function HorairesPage() {
  const search = Route.useSearch();
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const [direction, setDirection] = useState<Direction>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const portById = useMemo(() => new Map(ports.map((port) => [port.id, port])), [ports]);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);

  const rows = useMemo(
    () =>
      departures
        .map((departure) => {
          const route = routeById.get(departure.route_id);
          const from = route ? portById.get(route.departure_port_id) : undefined;
          const to = route ? portById.get(route.arrival_port_id) : undefined;
          return {
            departure,
            route,
            from,
            to,
            company: companies.find((item) => item.id === departure.company_id),
          };
        })
        // Un départ dont la ligne n'est plus publiée (ligne suspendue) n'est pas affiché.
        .filter(({ route, from, to }) => Boolean(route && from && to))
        .filter(({ from, to, departure }) => (!search.from || from?.id === search.from) && (!search.to || to?.id === search.to) && (!search.month || dateKeyInZone(departure.departure_at, portTimeZone(from)).startsWith(search.month)))
        .filter(({ from, to }) =>
          direction === "all"
            ? true
            : direction === "toAlgeria"
              ? isAlgeria(to) && !isAlgeria(from)
              : isAlgeria(from) && !isAlgeria(to),
        ),
    [departures, routeById, portById, companies, direction, search.from, search.to, search.month],
  );

  return (
    <SiteLayout>
      <PageHero
        overline="Horaires"
        title="Prochains départs de ferry"
        intro="Les départs connus à venir, dans les deux sens. Chaque heure est donnée dans l'heure locale du port de départ, comme sur votre billet."
      />

      {(search.from || search.to || search.month) && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-semibold">{search.from ? portById.get(search.from)?.name ?? "Départ" : "Tous les ports"} → {search.to ? portById.get(search.to)?.name ?? "Arrivée" : "Tous les ports"}{search.month && ` · ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${search.month}-15T12:00:00`))}`}</p><Link to="/horaires" search={{}} className="text-xs font-semibold text-primary underline">Tous les départs</Link></div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="batogo-tabbar inline-grid grid-cols-3 gap-1 p-1"
          role="radiogroup"
          aria-label="Sens de la traversée"
        >
          {(
            [
              ["all", "Tous"],
              ["toAlgeria", "Vers l'Algérie"],
              ["fromAlgeria", "Depuis l'Algérie"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              data-active={direction === value}
              onClick={() => {
                setDirection(value);
                setVisible(PAGE_SIZE);
              }}
              className="batogo-tab px-3"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} départ{rows.length > 1 ? "s" : ""} connu{rows.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-panel)]">
        <table className="hidden w-full text-left text-sm sm:table">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Départ (heure locale)</th>
              <th className="px-4 py-3">Ligne</th>
              <th className="px-4 py-3">Compagnie</th>
              <th className="px-4 py-3">Durée</th>
              <th className="px-4 py-3">Fiabilité</th>
              <th className="px-4 py-3"><span className="sr-only">Suivre la traversée</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, visible).map(({ departure, route, from, to, company }) => {
              const timeZone = portTimeZone(from);
              return (
                <tr key={departure.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <span className="font-semibold">
                      {capitalizeFirst(formatShortDay(departure.departure_at, timeZone))}
                    </span>
                    <span className="ml-2 font-bold tabular-nums text-primary">
                      {formatTime(departure.departure_at, timeZone)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {zoneLabel(timeZone)}
                    </span>
                    {departure.status === "cancelled" ? (
                      <span className="text-xs font-semibold text-destructive">Annulé</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {route ? (
                      <Link
                        to="/lignes/$slug"
                        params={{ slug: route.slug }}
                        className="font-medium hover:text-primary"
                      >
                        {from?.name ?? "—"} → {to?.name ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{company?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDuration(departure.duration_minutes)}
                  </td>
                  <td
                    className={`px-4 py-3 text-xs font-semibold ${reliabilityTone[departure.reliability]}`}
                  >
                    {reliabilityLabel[departure.reliability]}
                  </td>
                  <td className="px-4 py-3"><FollowButton kind="departure" targetId={departure.id} label={`${from?.name ?? "Départ"} → ${to?.name ?? "Arrivée"}`} compact demo={Boolean(departure.is_demo)}/></td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Aucun départ publié ne correspond à ces critères pour le moment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="grid gap-2 p-2 sm:hidden">
          {rows.slice(0, visible).map(({ departure, route, from, to, company }) => {
            const timeZone = portTimeZone(from);
            return (
              <article
                key={departure.id}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {capitalizeFirst(formatShortDay(departure.departure_at, timeZone))} ·{" "}
                      <span className="tabular-nums text-primary">
                        {formatTime(departure.departure_at, timeZone)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {zoneLabel(timeZone)} · {company?.name ?? "Compagnie inconnue"}
                    </p>
                  </div>
                  {departure.status === "cancelled" ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                      Annulé
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm">
                  {route ? (
                    <Link
                      to="/lignes/$slug"
                      params={{ slug: route.slug }}
                      className="font-medium hover:text-primary"
                    >
                      {from?.name ?? "—"} → {to?.name ?? "—"}
                    </Link>
                  ) : (
                    "Ligne inconnue"
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Durée : {formatDuration(departure.duration_minutes)} ·{" "}
                  <span className={`font-semibold ${reliabilityTone[departure.reliability]}`}>
                    {reliabilityLabel[departure.reliability]}
                  </span>
                </p>
                <div className="mt-3"><FollowButton kind="departure" targetId={departure.id} label={`${from?.name ?? "Départ"} → ${to?.name ?? "Arrivée"}`} compact demo={Boolean(departure.is_demo)}/></div>
              </article>
            );
          })}
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              Aucun départ connu à venir pour l'instant.
            </p>
          ) : null}
        </div>
      </div>
      {rows.length > visible ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
            className="h-11 rounded-xl border border-border bg-card px-5 text-sm font-semibold hover:bg-secondary"
          >
            Afficher plus de départs ({rows.length - visible} restants)
          </button>
        </div>
      ) : null}
    </SiteLayout>
  );
}
