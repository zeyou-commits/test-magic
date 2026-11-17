import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Building2,
  CalendarDays,
  ExternalLink,
  Gauge,
  Megaphone,
  MessageSquare,
  PenSquare,
  Radio,
  Route as RouteIcon,
  Send,
  Ship,
  Star,
  Users,
} from "lucide-react";
import {
  BackofficeShell,
  type ShellSection,
  type ShellSpace,
} from "@/components/admin/BackofficeShell";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_ROLES } from "@/lib/admin/permissions";
import { alertLabel, communityQuery, useSignalCatalog } from "@/lib/ferry/community";
import { companyOverview } from "@/lib/ferry/companyOverview";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { reviewCriteria, reviewNumber } from "@/lib/ferry/reviewCriteria";
import type { Departure } from "@/lib/ferry/types";

type Search = { c?: string; tab?: string };
export const Route = createFileRoute("/espace-compagnie")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["c"] === "string" ? { c: search["c"] } : {}),
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Espace compagnie — BledWay" }, { name: "robots", content: "noindex" }],
  }),
  component: CompanySpacePage,
});

const SPACES: ShellSpace[] = [
  { id: "Pilotage", label: "Pilotage", tagline: "Votre activité en un coup d'œil", icon: Gauge },
  { id: "Traversées", label: "Traversées", tagline: "Départs et lignes", icon: CalendarDays },
  { id: "Flotte", label: "Flotte", tagline: "Vos navires", icon: Ship },
  { id: "Voyageurs", label: "Voyageurs", tagline: "Avis et signalements", icon: Users },
  { id: "Communication", label: "Communication", tagline: "Annonces et fiche", icon: PenSquare },
];
const SECTIONS: ShellSection[] = [
  {
    id: "home",
    label: "Tableau de bord",
    description: "Vos prochaines traversées, vos navires et ce que disent les voyageurs.",
    group: "Pilotage",
    icon: Gauge,
  },
  {
    id: "crossings",
    label: "Mes traversées",
    short: "Traversées",
    description: "Tous vos départs à venir publiés sur BledWay, avec leur navire et leur statut.",
    group: "Traversées",
    icon: CalendarDays,
  },
  {
    id: "lines",
    label: "Mes lignes",
    short: "Lignes",
    description: "Vos liaisons, leur fréquence sur 8 semaines et le prochain départ.",
    group: "Traversées",
    icon: RouteIcon,
  },
  {
    id: "fleet",
    label: "Ma flotte",
    description: "Vos navires en service, leurs capacités et leur note voyageurs.",
    group: "Flotte",
    icon: Ship,
  },
  {
    id: "reviews",
    label: "Avis des voyageurs",
    short: "Avis",
    description: "Les notes publiées sur votre compagnie, critère par critère.",
    group: "Voyageurs",
    icon: Star,
  },
  {
    id: "signals",
    label: "Signalements en direct",
    short: "En direct",
    description: "Ce que les voyageurs signalent en ce moment sur vos navires.",
    group: "Voyageurs",
    icon: Radio,
  },
  {
    id: "announce",
    label: "Annonces",
    description: "Prévenir les voyageurs d'une traversée : retard, changement de navire, consigne.",
    group: "Communication",
    icon: Megaphone,
  },
  {
    id: "profile",
    label: "Ma fiche",
    description: "Ce que les voyageurs voient de votre compagnie : logo, site, contacts.",
    group: "Communication",
    icon: Building2,
  },
];

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const hourFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const STATUS: Record<Departure["status"], { label: string; tone?: string }> = {
  scheduled: { label: "Prévue" },
  modified: { label: "Modifiée", tone: "warn" },
  cancelled: { label: "Annulée", tone: "bad" },
};

function CompanySpacePage() {
  const { user, roles, loading } = useAuth();
  const staff = roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
  if (loading) return <p className="bo-empty p-6">Chargement…</p>;
  if (!user || !staff)
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-bold">Espace compagnie</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cet espace est en préparation avec les compagnies partenaires. Pour l'instant, seule
          l'équipe BledWay peut le consulter.
        </p>
        <Link to="/" className="bw-action-secondary mt-4 inline-flex">
          Retour au site
        </Link>
      </div>
    );
  return <CompanySpace />;
}

function CompanySpace() {
  useSignalCatalog();
  const { c, tab = "home" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const departures = useQuery(upcomingDeparturesQuery());
  const feed = useQuery(communityQuery());
  const active = companies.filter((item) => item.status === "active" && !item.is_demo);
  const company = active.find((item) => item.id === c) ?? active[0];
  const reviews = useQuery({
    ...entityReviewsQuery("company", company?.id ?? ""),
    enabled: Boolean(company),
  });
  const overview = company
    ? companyOverview(company, vessels, routes, departures.data ?? [])
    : null;
  const fleet = overview?.fleet ?? [];
  const vesselNotes = useQueries({
    queries: fleet.map((vessel) => entityReviewsQuery("vessel", vessel.id)),
  });
  const mine = (departures.data ?? [])
    .filter((item) => item.company_id === company?.id)
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const fleetIds = new Set(fleet.map((vessel) => vessel.id));
  const alerts = (feed.data?.alerts ?? []).filter(
    (alert) => alert.target_kind === "vessel" && fleetIds.has(alert.target_id),
  );
  const portName = (id: string | undefined) => ports.find((port) => port.id === id)?.name ?? "—";
  const lineOf = (routeId: string) => {
    const route = routes.find((item) => item.id === routeId);
    return `${portName(route?.departure_port_id)} → ${portName(route?.arrival_port_id)}`;
  };
  const vesselName = (id: string | null) =>
    vessels.find((vessel) => vessel.id === id)?.name ?? "Navire à confirmer";
  const go = (next: string) =>
    void navigate({ search: { ...(company ? { c: company.id } : {}), tab: next } });

  const crossingRows = (rows: Departure[]) =>
    rows.length ? (
      <ul className="bo-rows">
        {rows.map((item) => (
          <li key={item.id}>
            <time dateTime={item.departure_at}>
              <b>{hourFmt.format(new Date(item.departure_at))}</b>
              {dayFmt.format(new Date(item.departure_at))}
            </time>
            <span>
              <strong>{lineOf(item.route_id)}</strong>
              <small>{vesselName(item.vessel_id)}</small>
            </span>
            <em className="bo-pill" data-tone={STATUS[item.status].tone}>
              {STATUS[item.status].label}
            </em>
          </li>
        ))}
      </ul>
    ) : (
      <p className="bo-empty">
        {departures.isPending ? "Chargement des traversées…" : "Aucune traversée à venir publiée."}
      </p>
    );
  const criteria = reviewCriteria.company.filter((item) => reviews.data?.criteria[item.code]);
  const reviewBars = reviews.data?.count ? (
    <ul className="bo-rows">
      {criteria.map((item) => {
        const value = reviews.data!.criteria[item.code]!;
        return (
          <li key={item.code}>
            <span>
              <strong>{item.label}</strong>
              <small>
                {value.count} note{value.count > 1 ? "s" : ""}
              </small>
            </span>
            <meter min={0} max={5} value={value.average} className="bo-meter" />
            <b>{reviewNumber(value.average)}</b>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="bo-empty">
      {reviews.isPending ? "Chargement des notes…" : "Pas encore de note publiée."}
    </p>
  );
  const signalRows = alerts.length ? (
    <ul className="bo-rows">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <time dateTime={alert.created_at}>
            <b>{hourFmt.format(new Date(alert.created_at))}</b>
            {dayFmt.format(new Date(alert.created_at))}
          </time>
          <span>
            <strong>{alertLabel(alert)}</strong>
            <small>{vesselName(alert.target_id)}</small>
          </span>
          <em className="bo-pill" data-tone="warn">
            {1 + alert.confirmations} voyageur{alert.confirmations ? "s" : ""}
          </em>
        </li>
      ))}
    </ul>
  ) : (
    <p className="bo-empty">Aucun signalement en cours sur vos navires.</p>
  );
  const soon = <span className="bo-soon">À valider ensemble</span>;

  return (
    <BackofficeShell
      kind="company"
      brandLabel="Espace compagnie"
      brandSub={
        <label className="bo-company-pick">
          <span>Compagnie affichée</span>
          <select
            value={company?.id ?? ""}
            onChange={(event) => void navigate({ search: { c: event.target.value, tab } })}
          >
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      }
      spaces={SPACES}
      sections={SECTIONS}
      tab={SECTIONS.some((section) => section.id === tab) ? tab : "home"}
      onNavigate={go}
      badges={{ signals: alerts.length }}
      notice={
        <div className="bo-notice" data-tone="info" role="note">
          <strong>Aperçu réservé à l'équipe BledWay : proposition à valider.</strong>
          <span>
            Les chiffres sont réels (données publiées). Rien n'est modifiable par une compagnie tant
            que les droits ne sont pas décidés.
          </span>
        </div>
      }
    >
      {!company || !overview ? (
        <p className="bo-empty">Chargement de la compagnie…</p>
      ) : tab === "crossings" ? (
        <section className="bo-card">
          <h2>
            <CalendarDays aria-hidden /> {mine.length} traversée{mine.length > 1 ? "s" : ""} à venir
            <small>Signaler un changement {soon}</small>
          </h2>
          {crossingRows(mine)}
        </section>
      ) : tab === "lines" ? (
        <section className="bo-card">
          <h2>
            <RouteIcon aria-hidden /> {overview.lines.length} ligne
            {overview.lines.length > 1 ? "s" : ""}
            <small>fréquence calculée sur 8 semaines</small>
          </h2>
          {overview.lines.length ? (
            <ul className="bo-rows">
              {overview.lines.map((line) => (
                <li key={line.route.id}>
                  <span>
                    <strong>{lineOf(line.route.id)}</strong>
                    <small>
                      {line.next
                        ? `Prochain départ ${dayFmt.format(new Date(line.next))}`
                        : "Aucun départ publié"}
                    </small>
                  </span>
                  <em className="bo-pill" data-tone={line.perWeek ? undefined : "mute"}>
                    {String(line.perWeek).replace(".", ",")} / semaine
                  </em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bo-empty">Aucune ligne rattachée à cette compagnie.</p>
          )}
        </section>
      ) : tab === "fleet" ? (
        <div className="bo-fleet">
          {fleet.map((vessel, index) => {
            const note = vesselNotes[index]?.data;
            return (
              <article className="bo-card" key={vessel.id}>
                <h2>
                  <Ship aria-hidden /> {vessel.name}
                  <small>
                    {note?.count ? `${reviewNumber(note.average ?? 0)}/5` : "pas de note"}
                  </small>
                </h2>
                <dl className="bo-facts">
                  <div>
                    <dt>Mise en service</dt>
                    <dd>{vessel.build_year ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Passagers</dt>
                    <dd>{vessel.passenger_capacity ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Véhicules</dt>
                    <dd>{vessel.car_capacity ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Suivi en mer</dt>
                    <dd>{vessel.mmsi ? "Actif" : "Non relié"}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          {fleet.length ? null : <p className="bo-empty">Aucun navire en service.</p>}
        </div>
      ) : tab === "reviews" ? (
        <section className="bo-card">
          <h2>
            <Star aria-hidden />{" "}
            {reviews.data?.count
              ? `${reviewNumber(reviews.data.average ?? 0)}/5 sur ${reviews.data.count} avis`
              : "Avis des voyageurs"}
            <small>Répondre à un avis {soon}</small>
          </h2>
          {reviewBars}
        </section>
      ) : tab === "signals" ? (
        <section className="bo-card">
          <h2>
            <Radio aria-hidden /> En ce moment
            <small>Confirmer ou démentir {soon}</small>
          </h2>
          {signalRows}
        </section>
      ) : tab === "announce" ? (
        <section className="bo-card">
          <h2>
            <Megaphone aria-hidden /> Prévenir vos passagers {soon}
          </h2>
          <p className="bo-lead">
            L'idée : vous choisissez une traversée, un motif (retard, changement de navire, consigne
            d'embarquement) et votre message part aux voyageurs qui la suivent, avec la mention «
            Information de la compagnie ». BledWay relit avant l'envoi, ou non : c'est un des points
            à décider.
          </p>
          <div className="bo-mock" aria-hidden>
            <span>Traversée</span>
            <p>
              {mine[0]
                ? `${lineOf(mine[0].route_id)} · ${dayFmt.format(new Date(mine[0].departure_at))}`
                : "—"}
            </p>
            <span>Motif</span>
            <p>Retard · Changement de navire · Consigne · Autre</p>
            <span>Message</span>
            <p>Votre message aux voyageurs…</p>
            <button type="button" disabled>
              <Send /> Envoyer aux voyageurs
            </button>
          </div>
        </section>
      ) : tab === "profile" ? (
        <section className="bo-card">
          <h2>
            <Building2 aria-hidden /> {company.name}
            <small>Proposer une correction {soon}</small>
          </h2>
          <dl className="bo-facts bo-facts--wide">
            <div>
              <dt>Logo</dt>
              <dd>
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={44} />
              </dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd>{company.website_url ?? "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Réservation</dt>
              <dd>{company.booking_url ?? "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Contact voyageurs</dt>
              <dd>{company.contact_url ?? company.phone ?? "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Présentation</dt>
              <dd>{company.description ?? "Non renseignée"}</dd>
            </div>
          </dl>
          <a
            className="bo-link"
            href={`/compagnies/${company.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Voir la fiche publique <ExternalLink aria-hidden />
          </a>
        </section>
      ) : (
        <>
          <div className="bo-hello">
            <div className="bo-hello__who">
              <CompanyBadge
                name={company.name}
                logoUrl={company.logo_url}
                size={46}
                tone="framed"
              />
              <div>
                <h2>{company.name}</h2>
                <p>
                  {overview.next
                    ? `Prochain départ ${dayFmt.format(new Date(overview.next.departure_at))} à ${hourFmt.format(new Date(overview.next.departure_at))}`
                    : "Aucun départ publié à venir"}
                </p>
              </div>
            </div>
            <div className="bo-hello__actions">
              <button type="button" onClick={() => go("crossings")}>
                <CalendarDays aria-hidden /> Mes traversées
              </button>
              <button type="button" onClick={() => go("announce")}>
                <Megaphone aria-hidden /> Prévenir mes passagers
              </button>
            </div>
          </div>
          <div className="bo-kpis">
            <button type="button" className="bo-kpi" onClick={() => go("crossings")}>
              <span className="bo-kpi__top">
                Traversées à venir <CalendarDays aria-hidden />
              </span>
              <strong>{departures.isPending ? "–" : overview.upcoming}</strong>
              <small>{String(overview.perWeek).replace(".", ",")} par semaine sur 8 semaines</small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("lines")}>
              <span className="bo-kpi__top">
                Lignes <Anchor aria-hidden />
              </span>
              <strong>{overview.lines.length}</strong>
              <small>entre les deux rives</small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("fleet")}>
              <span className="bo-kpi__top">
                Navires en service <Ship aria-hidden />
              </span>
              <strong>{fleet.length}</strong>
              <small>
                {overview.averageAge !== null
                  ? `âge moyen ${overview.averageAge} ans`
                  : "âge non renseigné"}
              </small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("reviews")}>
              <span className="bo-kpi__top">
                Note des voyageurs <Star aria-hidden />
              </span>
              <strong>
                {reviews.data?.count ? reviewNumber(reviews.data.average ?? 0) : "–"}
                {reviews.data?.count ? <i>/5</i> : null}
              </strong>
              <small>
                {reviews.data?.count
                  ? `${reviews.data.count} avis publié${reviews.data.count > 1 ? "s" : ""}`
                  : "pas encore d'avis publié"}
              </small>
            </button>
            <button
              type="button"
              className="bo-kpi"
              data-tone={alerts.length ? "todo" : "ok"}
              onClick={() => go("signals")}
            >
              <span className="bo-kpi__top">
                Signalements en cours <MessageSquare aria-hidden />
              </span>
              <strong>{alerts.length}</strong>
              <small>{alerts.length ? "sur vos navires" : "Rien en ce moment"}</small>
            </button>
          </div>
          <div className="bo-grid2">
            <section className="bo-card">
              <h2>
                <CalendarDays aria-hidden /> Prochaines traversées
                <small>
                  <button type="button" className="bo-link" onClick={() => go("crossings")}>
                    Tout voir
                  </button>
                </small>
              </h2>
              {crossingRows(mine.slice(0, 6))}
            </section>
            <div className="bo-stack">
              <section className="bo-card">
                <h2>
                  <Star aria-hidden /> Ce que disent les voyageurs
                </h2>
                {reviewBars}
              </section>
              <section className="bo-card">
                <h2>
                  <Radio aria-hidden /> Signalé en ce moment
                </h2>
                {signalRows}
              </section>
            </div>
          </div>
        </>
      )}
    </BackofficeShell>
  );
}
