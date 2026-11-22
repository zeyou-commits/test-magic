import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  Gauge,
  ListTodo,
  Megaphone,
  MessageSquare,
  PenSquare,
  Radio,
  Route as RouteIcon,
  Ship,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import {
  BackofficeShell,
  type ShellSection,
  type ShellSpace,
} from "@/components/admin/BackofficeShell";
import {
  CompanyAnnouncementsTab,
  CrossingActionPanel,
  CompanyRequestsTab,
  useCompanyActivity,
  type DeskContext,
} from "@/components/company/CompanyDesk";
import {
  CompanyManagerPanel,
  CompanyPhotosTab,
  CompanyProfileTab,
  CompanyReviewsTab,
  CompanySignalsTab,
  useCompanyFeedback,
  type VoiceContext,
} from "@/components/company/CompanyVoice";
import { CompanyShowcase } from "@/components/company/CompanyShowcase";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_ROLES } from "@/lib/admin/permissions";
import {
  companyAccessKeys,
  companyAccessRequest,
  LEVEL_CATALOG,
  type CompanyAudience,
  type MyCompanyAccess,
  type TeamMate,
} from "@/lib/company/access";
import { alertLabel, communityQuery, useSignalCatalog } from "@/lib/ferry/community";
import { companyOverview } from "@/lib/ferry/companyOverview";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { reviewCriteria, reviewNumber } from "@/lib/ferry/reviewCriteria";
import { routeArrivalTimeZone, routeDepartureTimeZone } from "@/lib/ferry/time";
import type { Departure } from "@/lib/ferry/types";

type Search = { c?: string; tab?: string; vessel?: string };
export const Route = createFileRoute("/espace-compagnie")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["c"] === "string" ? { c: search["c"] } : {}),
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
    ...(typeof search["vessel"] === "string" ? { vessel: search["vessel"] } : {}),
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
    description:
      "Ce qui demande votre attention, vos prochaines traversées et ce que disent les voyageurs.",
    group: "Pilotage",
    icon: Gauge,
  },
  {
    id: "team",
    label: "Mon équipe",
    short: "Équipe",
    description: "Les personnes de votre compagnie qui ont accès à cet espace, et leur niveau.",
    group: "Pilotage",
    icon: UserRound,
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
    id: "requests",
    label: "Historique des changements",
    short: "Changements",
    description:
      "Retards, nouveaux horaires, changements de navire et annulations appliqués, et leur historique.",
    group: "Traversées",
    icon: ClipboardList,
  },
  {
    id: "fleet",
    label: "Ma flotte",
    description: "Vos navires en service, leurs capacités et leur note voyageurs.",
    group: "Flotte",
    icon: Ship,
  },
  {
    id: "photos",
    label: "Photos des navires",
    short: "Photos",
    description:
      "Extérieur, ponts, cabines, restauration… Ce que vous publiez apparaît tout de suite sur la fiche du navire.",
    group: "Flotte",
    icon: Camera,
  },
  {
    id: "reviews",
    label: "Avis des voyageurs",
    short: "Avis",
    description: "Les avis publiés sur votre compagnie et vos navires, et vos réponses.",
    group: "Voyageurs",
    icon: Star,
  },
  {
    id: "signals",
    label: "Signalements en direct",
    short: "En direct",
    description: "Ce que les voyageurs signalent sur vos navires : répondre ou contester.",
    group: "Voyageurs",
    icon: Radio,
  },
  {
    id: "announce",
    label: "Annonces",
    description:
      "Prévenir les voyageurs d'une traversée : retard, changement de navire, consigne. Envoyé tout de suite.",
    group: "Communication",
    icon: Megaphone,
  },
  {
    id: "profile",
    label: "Ma fiche",
    description: "Ce que les voyageurs voient de votre compagnie : contacts et présentation.",
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
/** « 1 avis », « 3 avis » ; « 1 annonce », « 2 annonces ». */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const SOON_MS = 48 * 3_600_000;

const STATUS: Record<Departure["status"], { label: string; tone?: string }> = {
  scheduled: { label: "Prévue" },
  modified: { label: "Modifiée", tone: "warn" },
  cancelled: { label: "Annulée", tone: "bad" },
};

function Gate({
  title = "Espace compagnie",
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg p-8 text-center" role="status">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="mt-2 grid gap-2 text-sm text-muted-foreground">{children}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {action}
        <Link to="/" className="bw-action-secondary inline-flex">
          Retour au site
        </Link>
      </div>
    </div>
  );
}

function CompanySpacePage() {
  const { user, roles, loading } = useAuth();
  const staff = roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
  // L'accès est relu auprès du serveur à chaque retour sur la page et chaque minute :
  // une suspension s'applique sans attendre une nouvelle connexion.
  const access = useQuery({
    queryKey: companyAccessKeys.me(user?.id ?? ""),
    queryFn: () => companyAccessRequest<MyCompanyAccess[]>({ action: "me" }),
    enabled: Boolean(user) && !staff && !loading,
    staleTime: 0,
    refetchInterval: 60_000,
    retry: false,
  });
  if (loading) return <p className="bo-empty p-6">Chargement…</p>;
  // Personne connectée : page d'accueil professionnelle, avec les deux portes.
  if (!user) return <CompanyShowcase />;
  if (staff) return <CompanySpace allowed={null} />;
  if (access.isPending) return <p className="bo-empty p-6">Vérification de votre accès…</p>;
  if (access.isError)
    return (
      <Gate
        action={
          <button
            type="button"
            className="bw-action-primary inline-flex"
            onClick={() => void access.refetch()}
          >
            Réessayer
          </button>
        }
      >
        <p>Votre accès n'a pas pu être vérifié. {(access.error as Error).message}</p>
      </Gate>
    );
  const usable = access.data.filter((item) => item.usable);
  if (!usable.length) {
    const suspended = access.data.find((item) => item.status === "suspended");
    const closed = access.data.find((item) => item.spaceStatus === "suspended");
    // Aucun accès en cours : la page d'accueil professionnelle, avec la demande d'accès.
    if (!suspended && !closed) return <CompanyShowcase signedInEmail={user.email ?? null} />;
    return (
      <Gate>
        {suspended ? (
          <p>
            Votre accès à l'espace de {suspended.name} est suspendu. Contactez votre interlocuteur
            BledWay.
          </p>
        ) : (
          <p>L'espace de {closed!.name} est suspendu par BledWay pour le moment.</p>
        )}
      </Gate>
    );
  }
  return <CompanySpace allowed={usable} />;
}

/**
 * `allowed` : compagnies ouvertes à ce compte, confirmées par le serveur (null = équipe BledWay,
 * aperçu de toutes les compagnies). Le paramètre `c` de l'adresse n'est qu'une préférence.
 */
function CompanySpace({ allowed }: { allowed: MyCompanyAccess[] | null }) {
  useSignalCatalog();
  const { user } = useAuth();
  const { c, tab = "home", vessel: vesselParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: allCompanies = [] } = useQuery(companiesQuery);
  const companies = allowed
    ? allCompanies.filter((item) => allowed.some((access) => access.companyId === item.id))
    : allCompanies;
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const departures = useQuery(upcomingDeparturesQuery());
  const feed = useQuery(communityQuery());
  const active = allowed
    ? companies
    : companies.filter((item) => item.status === "active" && !item.is_demo);
  const company = active.find((item) => item.id === c) ?? active[0];
  const level = allowed?.find((item) => item.companyId === company?.id)?.level;
  const manager = Boolean(allowed?.find((item) => item.companyId === company?.id)?.manager);
  const team = useQuery({
    queryKey: companyAccessKeys.team(user?.id ?? "", company?.id ?? ""),
    queryFn: () => companyAccessRequest<TeamMate[]>({ action: "team", companyId: company!.id }),
    enabled: Boolean(user && company) && tab === "team",
    staleTime: 0,
    retry: false,
  });
  const queryClient = useQueryClient();
  const refused = (team.error as { status?: number } | null)?.status === 403;
  useEffect(() => {
    // Accès suspendu ou retiré entre deux écrans : on relit aussitôt l'accès du compte.
    if (refused && user)
      void queryClient.invalidateQueries({ queryKey: companyAccessKeys.me(user.id) });
  }, [refused, user, queryClient]);
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
  // Même visuel que la fiche publique du navire (photo BledWay, sinon photo libre).
  const vesselPhotos = useQueries({
    queries: fleet.map((vessel) => ({
      ...vesselPhotoQuery(vessel),
      enabled: tab === "fleet",
    })),
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
  // Niveau Opérations confirmé par le serveur ; l'aperçu de l'équipe BledWay ne soumet rien.
  const canAct = Boolean(allowed) && level === "operations";
  const [changing, setChanging] = useState<string | null>(null);
  const changingDeparture = mine.find((item) => item.id === changing);
  const activity = useCompanyActivity(
    company?.id ?? "",
    Boolean(company) && ["home", "requests", "announce", "crossings"].includes(tab),
  );
  const audience = useQuery({
    queryKey: companyAccessKeys.audience(user?.id ?? "", company?.id ?? ""),
    queryFn: () =>
      companyAccessRequest<CompanyAudience>({ action: "audience", companyId: company!.id }),
    enabled: Boolean(user && company) && ["home", "crossings"].includes(tab),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
  const followers = (departureId: string) => audience.data?.byDeparture[departureId] ?? 0;
  const inReview =
    (activity.data?.requests ?? []).filter((item) => item.status === "submitted").length +
    (activity.data?.announcements ?? []).filter((item) => item.status === "submitted").length;
  const voice: VoiceContext | null = company
    ? {
        companyId: company.id,
        companyName: company.name,
        canAct,
        when: (iso) => `${dayFmt.format(new Date(iso))} à ${hourFmt.format(new Date(iso))}`,
      }
    : null;
  // Avis sans réponse : liste « À traiter » pour tous, badge de la rubrique si on peut répondre.
  const feedback = useCompanyFeedback(
    company?.id ?? "",
    Boolean(company) && (canAct || tab === "home"),
  );
  const unanswered = (feedback.data?.reviews ?? []).filter(
    (review) =>
      !(feedback.data?.replies ?? []).some(
        (reply) =>
          reply.targetId === review.id &&
          reply.kind === "reply" &&
          !["withdrawn", "replaced"].includes(reply.status),
      ),
  ).length;
  const drafts = {
    requests: (activity.data?.requests ?? []).filter((item) => item.status === "draft").length,
    announcements: (activity.data?.announcements ?? []).filter((item) => item.status === "draft")
      .length,
  };
  const soon = mine.filter(
    (item) => item.status !== "cancelled" && Date.parse(item.departure_at) - Date.now() < SOON_MS,
  );
  const todo = [
    unanswered
      ? {
          key: "reviews",
          icon: Star,
          label: `${plural(unanswered, "avis", "avis")} sans réponse`,
          hint: canAct
            ? "Votre réponse s'affiche tout de suite sous l'avis."
            : "Le niveau Opérations permet de répondre.",
          action: canAct ? "Répondre" : "Voir",
          tab: "reviews",
        }
      : null,
    alerts.length
      ? {
          key: "signals",
          icon: Radio,
          label: `${plural(alerts.length, "signalement")} en cours sur vos navires`,
          hint: "Ce que les voyageurs voient en ce moment : répondre ou contester.",
          action: "Voir",
          tab: "signals",
        }
      : null,
    drafts.announcements
      ? {
          key: "announce",
          icon: Megaphone,
          label: `${plural(drafts.announcements, "annonce")} en brouillon`,
          hint: "Pas encore envoyée aux voyageurs.",
          action: "Reprendre",
          tab: "announce",
        }
      : null,
    drafts.requests
      ? {
          key: "requests",
          icon: ClipboardList,
          label: `${plural(drafts.requests, "changement")} en brouillon`,
          hint: "Pas encore appliqué sur la traversée.",
          action: "Reprendre",
          tab: "requests",
        }
      : null,
  ].filter((item) => item !== null);
  const desk: DeskContext | null = company
    ? {
        companyId: company.id,
        companyName: company.name,
        canAct,
        departures: mine,
        fleet: fleet.map((vessel) => ({ id: vessel.id, name: vessel.name })),
        lineOf,
        vesselName,
        zonesOf: (routeId) => ({
          departure: routeDepartureTimeZone(routeId, routes, ports),
          arrival: routeArrivalTimeZone(routeId, routes, ports),
        }),
        when: (iso) => `${dayFmt.format(new Date(iso))} à ${hourFmt.format(new Date(iso))}`,
      }
    : null;

  const crossingRows = (rows: Departure[], withAction = false) =>
    rows.length ? (
      <ul className="bo-rows">
        {rows.map((item) => (
          <li key={item.id} className={withAction ? "flex-wrap" : undefined}>
            <time dateTime={item.departure_at}>
              <b>{hourFmt.format(new Date(item.departure_at))}</b>
              {dayFmt.format(new Date(item.departure_at))}
            </time>
            <span>
              <strong>{lineOf(item.route_id)}</strong>
              <small>
                {vesselName(item.vessel_id)}
                {audience.data && followers(item.id)
                  ? ` · ${followers(item.id)} ${followers(item.id) > 1 ? "personnes suivent" : "personne suit"}`
                  : ""}
              </small>
            </span>
            <em className="bo-pill" data-tone={STATUS[item.status].tone}>
              {STATUS[item.status].label}
            </em>
            {withAction && canAct && item.status !== "cancelled" ? (
              <button
                type="button"
                className="bo-link min-h-10"
                aria-expanded={changing === item.id}
                aria-label={`Modifier ou prévenir : ${lineOf(item.route_id)}, ${dayFmt.format(new Date(item.departure_at))} à ${hourFmt.format(new Date(item.departure_at))}`}
                onClick={() => setChanging(changing === item.id ? null : item.id)}
              >
                Modifier ou prévenir
              </button>
            ) : null}
            {withAction && changing === item.id && desk && changingDeparture ? (
              <div className="w-full basis-full">
                <CrossingActionPanel
                  ctx={desk}
                  departure={changingDeparture}
                  onClose={() => setChanging(null)}
                />
              </div>
            ) : null}
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

  return (
    <BackofficeShell
      kind="company"
      brandLabel="Espace compagnie"
      brandSub={
        active.length > 1 ? (
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
        ) : (
          <span className="bo-company-pick">
            <span>Compagnie</span>
            <strong>{company?.name ?? "…"}</strong>
          </span>
        )
      }
      spaces={SPACES}
      sections={SECTIONS}
      tab={SECTIONS.some((section) => section.id === tab) ? tab : "home"}
      onNavigate={go}
      badges={{ signals: alerts.length, requests: inReview, reviews: canAct ? unanswered : 0 }}
      notice={
        allowed ? (
          <div className="bo-notice" data-tone="info" role="note">
            <strong>
              Votre accès : {level ? LEVEL_CATALOG[level].label : "Lecture"}. Données publiées sur
              BledWay.
            </strong>
            <span>
              {canAct
                ? "Ce que vous publiez part tout de suite, sous le nom de votre compagnie. BledWay peut retirer après coup ce qui enfreint les règles communes."
                : "Vous suivez les traversées, les demandes, les annonces et les avis de votre compagnie. Le niveau Opérations permet d'agir."}
            </span>
          </div>
        ) : (
          <div className="bo-notice" data-tone="info" role="note">
            <strong>Aperçu de l'équipe BledWay : toutes les compagnies.</strong>
            <span>
              Un collaborateur de compagnie ne voit que la sienne. Les accès se gèrent dans Espace
              équipe → Réseau → Compagnies.
            </span>
          </div>
        )
      }
    >
      {!company || !overview ? (
        <p className="bo-empty">Chargement de la compagnie…</p>
      ) : tab === "team" ? (
        <div className="grid gap-3.5">
          <section className="bo-card">
            <h2>
              <UserRound aria-hidden /> Accès à l'espace {company.name}
              <small>attribués par BledWay</small>
            </h2>
            {team.isPending ? (
              <p className="bo-empty">Chargement de l'équipe…</p>
            ) : team.isError ? (
              <p className="bo-empty">
                {!refused
                  ? (team.error as Error).message
                  : allowed
                    ? "Votre accès a changé. Rechargez la page."
                    : "Dans l'équipe BledWay, seuls les administrateurs voient les accès."}
              </p>
            ) : team.data.length ? (
              <ul className="bo-rows">
                {team.data.map((mate, index) => (
                  <li key={`${mate.name}-${index}`}>
                    <span>
                      <strong>
                        {mate.name}
                        {mate.you ? " (vous)" : ""}
                      </strong>
                      <small>Depuis le {dayFmt.format(new Date(mate.since))}</small>
                    </span>
                    <em
                      className="bo-pill"
                      data-tone={mate.level === "operations" ? undefined : "mute"}
                    >
                      {LEVEL_CATALOG[mate.level].label}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bo-empty">Aucun collaborateur n'a encore d'accès.</p>
            )}
            <p className="bo-lead">
              {manager
                ? "Vous êtes responsable : gérez vos collaborateurs ci-dessous."
                : "Pour ajouter ou retirer une personne, écrivez au responsable de votre compagnie ou à votre interlocuteur BledWay."}
            </p>
          </section>
          {manager && voice ? <CompanyManagerPanel ctx={voice} /> : null}
        </div>
      ) : tab === "crossings" ? (
        <section className="bo-card">
          <h2>
            <CalendarDays aria-hidden /> {mine.length} traversée{mine.length > 1 ? "s" : ""} à venir
            <small>
              <button type="button" className="bo-link" onClick={() => go("requests")}>
                Historique des changements{inReview ? ` (${inReview} en attente)` : ""}
              </button>
            </small>
          </h2>
          {canAct ? (
            <p className="bo-lead mb-2">
              Un retard, un nouvel horaire, un autre navire, une annulation ou une simple consigne ?
              Touchez « Modifier ou prévenir » sur la traversée : tout part tout de suite, et les
              voyageurs qui la suivent sont prévenus.
            </p>
          ) : null}
          {crossingRows(mine, true)}
        </section>
      ) : tab === "requests" && desk ? (
        <CompanyRequestsTab ctx={desk} />
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
            const photo = vesselPhotos[index]?.data;
            return (
              <article className="bo-card" key={vessel.id}>
                {photo ? (
                  <img
                    src={photo.url}
                    alt={vessel.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="bo-fleet__photo"
                  />
                ) : (
                  <span className="bo-fleet__photo bo-fleet__photo--empty" aria-hidden>
                    <Ship />
                  </span>
                )}
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
                {voice ? (
                  <button
                    type="button"
                    className="bo-link mt-2 inline-flex min-h-9 items-center gap-1.5"
                    onClick={() =>
                      void navigate({
                        search: {
                          ...(company ? { c: company.id } : {}),
                          tab: "photos",
                          vessel: vessel.id,
                        },
                      })
                    }
                  >
                    <Camera className="size-4" aria-hidden /> Photos du navire
                  </button>
                ) : null}
              </article>
            );
          })}
          {fleet.length ? null : <p className="bo-empty">Aucun navire en service.</p>}
        </div>
      ) : tab === "reviews" && voice ? (
        <CompanyReviewsTab ctx={voice} summary={reviewBars} />
      ) : tab === "signals" && voice ? (
        <CompanySignalsTab ctx={voice} live={signalRows} />
      ) : tab === "announce" && desk ? (
        <div className="grid gap-3.5">
          <CompanyAnnouncementsTab ctx={desk} />
        </div>
      ) : tab === "photos" && voice ? (
        <CompanyPhotosTab ctx={voice} vesselId={vesselParam ?? null} />
      ) : tab === "profile" && voice ? (
        <CompanyProfileTab
          ctx={voice}
          logo={<CompanyBadge name={company.name} logoUrl={company.logo_url} size={44} />}
          publicHref={`/?select=company&id=${company.id}`}
        />
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
          <section className="bo-card mb-3.5" aria-labelledby="bo-todo-title">
            <h2 id="bo-todo-title">
              <ListTodo aria-hidden /> À traiter
              <small className="max-sm:hidden">mis à jour chaque minute</small>
            </h2>
            {todo.length ? (
              <ul className="bo-rows">
                {todo.map((item) => (
                  <li key={item.key}>
                    <item.icon aria-hidden className="size-5 flex-none text-[var(--bo-muted)]" />
                    <span>
                      <strong>{item.label}</strong>
                      <small className="!whitespace-normal">{item.hint}</small>
                    </span>
                    <button
                      type="button"
                      className="bo-link min-h-10 flex-none"
                      onClick={() => go(item.tab)}
                    >
                      {item.action}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bo-empty flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-4" /> Rien à traiter pour le moment.
              </p>
            )}
            <h3 className="mt-3 text-sm font-semibold">
              Dans les 48 heures{" "}
              <span className="font-normal text-[var(--bo-muted)]">
                · {plural(soon.length, "traversée")}
              </span>
            </h3>
            {soon.length ? (
              crossingRows(soon, true)
            ) : (
              <p className="bo-empty">
                {departures.isPending
                  ? "Chargement des traversées…"
                  : "Aucune traversée dans les 48 prochaines heures."}
              </p>
            )}
          </section>
          <div className="bo-kpis">
            <button type="button" className="bo-kpi" onClick={() => go("crossings")}>
              <span className="bo-kpi__top">
                Traversées à venir <CalendarDays aria-hidden />
              </span>
              <strong>{departures.isPending ? "–" : overview.upcoming}</strong>
              <small>{String(overview.perWeek).replace(".", ",")} par semaine sur 8 semaines</small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("crossings")}>
              <span className="bo-kpi__top">
                Personnes qui suivent <Users aria-hidden />
              </span>
              <strong>{audience.data ? audience.data.total : "–"}</strong>
              <small>
                {audience.isError
                  ? "chiffre indisponible"
                  : !audience.data
                    ? "calcul en cours"
                    : audience.data.total
                      ? `vos traversées à venir, dont ${audience.data.travellers} qui voyage${audience.data.travellers > 1 ? "nt" : ""}`
                      : "personne ne suit encore vos traversées"}
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
              data-tone={unanswered ? "todo" : "ok"}
              onClick={() => go("reviews")}
            >
              <span className="bo-kpi__top">
                Avis sans réponse <MessageSquare aria-hidden />
              </span>
              <strong>{feedback.data ? unanswered : "–"}</strong>
              <small>{unanswered ? "une réponse rassure les voyageurs" : "Tout est à jour"}</small>
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
