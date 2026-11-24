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
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  WifiOff,
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
import { AdminRequestError } from "@/lib/admin/request";
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
import { tr, lazyDateFormat } from "@/lib/i18n";

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

const dayFmt = lazyDateFormat({
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const hourFmt = lazyDateFormat({
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

/**
 * L'écran d'attente ou de blocage de l'espace compagnie : une carte claire, la 504 qui dit ce qui
 * se passe, une suite possible. `tone` : « error » (service coupé), « locked » (accès suspendu).
 */
function Gate({
  title = "Espace compagnie",
  children,
  action,
  tone = "locked",
  footnote,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "error" | "locked";
  footnote?: ReactNode;
}) {
  const Icon = tone === "error" ? WifiOff : Lock;
  return (
    <div className="bw-gate" role="status" data-tone={tone}>
      <div className="bw-gate__card">
        <div className="bw-gate__art" aria-hidden>
          <span className="bw-gate__halo" />
          <img src="/cabas/persos/voiture_504.webp" alt="" width={96} height={96} />
          <span className="bw-gate__badge">
            <Icon size={18} strokeWidth={2.4} />
          </span>
        </div>
        <p className="bw-gate__kicker">
          <Building2 size={13} aria-hidden />{tr("ui.pageEspaceCompagnie.espaceCompagnie")}
        </p>
        <h1 className="bw-gate__title">{title}</h1>
        <div className="bw-gate__body">{children}</div>
        <div className="bw-gate__acts">
          {action}
          <Link to="/" className="bw-gate__b2">
            {tr("ui.pageEspaceCompagnie.retourAuSite")}
          </Link>
        </div>
        {footnote ? <p className="bw-gate__foot">{footnote}</p> : null}
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
    // Une coupure passagère du serveur se rattrape seule (2 essais) ; un refus net, non.
    retry: (count, error) =>
      count < 2 && (!(error instanceof AdminRequestError) || error.status >= 500),
    retryDelay: (count) => 800 * (count + 1),
  });
  if (loading) return <p className="bo-empty p-6">{tr("ui.pageEspaceCompagnie.chargement")}</p>;
  // Personne connectée : page d'accueil professionnelle, avec les deux portes.
  if (!user) return <CompanyShowcase />;
  if (staff) return <CompanySpace allowed={null} />;
  if (access.isPending) return <p className="bo-empty p-6">{tr("ui.pageEspaceCompagnie.verificationDeVotreAcces")}</p>;
  if (access.isError) {
    const code = access.error instanceof AdminRequestError ? access.error.code : undefined;
    return (
      <Gate
        tone="error"
        title={tr("ui.pageEspaceCompagnie.connexionAVotreEspaceInterrompue")}
        action={
          <button
            type="button"
            className="bw-gate__b1"
            disabled={access.isFetching}
            onClick={() => void access.refetch()}
          >
            {access.isFetching ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={16} aria-hidden />
            )}
            {access.isFetching ? tr("ui.pageEspaceCompagnie.nouvelEssai") : tr("ui.pageEspaceCompagnie.reessayer")}
          </button>
        }
        footnote={
          <>
            {tr("ui.pageEspaceCompagnie.leProblemeContinueEcrivezA")}
            {code ? (
              <>
                {" "}
                {tr("ui.pageEspaceCompagnie.enIndiquantLeCode")}<code>{code}</code>
              </>
            ) : null}
            .
          </>
        }
      >
        <p>
          {tr("ui.pageEspaceCompagnie.nousNAvonsPasPu")}
        </p>
        <ul className="bw-gate__list">
          <li>
            <ShieldCheck size={15} aria-hidden />{tr("ui.pageEspaceCompagnie.votreAccesEtVosDonnees")}
          </li>
          <li>
            <RefreshCw size={15} aria-hidden />{tr("ui.pageEspaceCompagnie.unNouvelEssaiSuffitLe")}
          </li>
        </ul>
      </Gate>
    );
  }
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
            {tr("ui.pageEspaceCompagnie.votreAccesALEspace")}{suspended.name}{tr("ui.pageEspaceCompagnie.estSuspenduContactezVotreInterlocuteur")}
          </p>
        ) : (
          <p>{tr("ui.pageEspaceCompagnie.lEspaceDe")}{closed!.name}{tr("ui.pageEspaceCompagnie.estSuspenduParBledwayPour")}</p>
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
                {tr("ui.pageEspaceCompagnie.modifierOuPrevenir")}
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
        {departures.isPending ? tr("ui.pageEspaceCompagnie.chargementDesTraversees") : tr("ui.pageEspaceCompagnie.aucuneTraverseeAVenirPubliee")}
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
                {value.count}{tr("ui.pageEspaceCompagnie.note")}{value.count > 1 ? "s" : ""}
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
      {reviews.isPending ? tr("ui.pageEspaceCompagnie.chargementDesNotes") : tr("ui.pageEspaceCompagnie.pasEncoreDeNotePubliee")}
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
            {1 + alert.confirmations}{tr("ui.pageEspaceCompagnie.voyageur")}{alert.confirmations ? "s" : ""}
          </em>
        </li>
      ))}
    </ul>
  ) : (
    <p className="bo-empty">{tr("ui.pageEspaceCompagnie.aucunSignalementEnCoursSur")}</p>
  );

  return (
    <BackofficeShell
      kind="company"
      brandLabel="Espace compagnie"
      brandSub={
        active.length > 1 ? (
          <label className="bo-company-pick">
            <span>{tr("ui.pageEspaceCompagnie.compagnieAffichee")}</span>
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
            <span>{tr("ui.pageEspaceCompagnie.compagnie")}</span>
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
              {tr("ui.pageEspaceCompagnie.votreAcces")}{level ? LEVEL_CATALOG[level].label : tr("ui.pageEspaceCompagnie.lecture")}{tr("ui.pageEspaceCompagnie.donneesPublieesSurBledway")}
            </strong>
            <span>
              {canAct
                ? tr("ui.pageEspaceCompagnie.ceQueVousPubliezPart")
                : tr("ui.pageEspaceCompagnie.vousSuivezLesTraverseesLes")}
            </span>
          </div>
        ) : (
          <div className="bo-notice" data-tone="info" role="note">
            <strong>{tr("ui.pageEspaceCompagnie.apercuDeLEquipeBledway")}</strong>
            <span>
              {tr("ui.pageEspaceCompagnie.unCollaborateurDeCompagnieNe")}
            </span>
          </div>
        )
      }
    >
      {!company || !overview ? (
        <p className="bo-empty">{tr("ui.pageEspaceCompagnie.chargementDeLaCompagnie")}</p>
      ) : tab === "team" ? (
        <div className="grid gap-3.5">
          <section className="bo-card">
            <h2>
              <UserRound aria-hidden />{tr("ui.pageEspaceCompagnie.accesALEspace")}{company.name}
              <small>{tr("ui.pageEspaceCompagnie.attribuesParBledway")}</small>
            </h2>
            {team.isPending ? (
              <p className="bo-empty">{tr("ui.pageEspaceCompagnie.chargementDeLEquipe")}</p>
            ) : team.isError ? (
              <p className="bo-empty">
                {!refused
                  ? (team.error as Error).message
                  : allowed
                    ? tr("ui.pageEspaceCompagnie.votreAccesAChangeRechargez")
                    : tr("ui.pageEspaceCompagnie.dansLEquipeBledwaySeuls")}
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
                      <small>{tr("ui.pageEspaceCompagnie.depuisLe")}{dayFmt.format(new Date(mate.since))}</small>
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
              <p className="bo-empty">{tr("ui.pageEspaceCompagnie.aucunCollaborateurNAEncore")}</p>
            )}
            <p className="bo-lead">
              {manager
                ? tr("ui.pageEspaceCompagnie.vousEtesResponsableGerezVos")
                : tr("ui.pageEspaceCompagnie.pourAjouterOuRetirerUne")}
            </p>
          </section>
          {manager && voice ? <CompanyManagerPanel ctx={voice} /> : null}
        </div>
      ) : tab === "crossings" ? (
        <section className="bo-card">
          <h2>
            <CalendarDays aria-hidden /> {mine.length}{tr("ui.pageEspaceCompagnie.traversee")}{mine.length > 1 ? "s" : ""}{tr("ui.pageEspaceCompagnie.aVenir")}
            <small>
              <button type="button" className="bo-link" onClick={() => go("requests")}>
                {tr("ui.pageEspaceCompagnie.historiqueDesChangements")}{inReview ? ` (${inReview} en attente)` : ""}
              </button>
            </small>
          </h2>
          {canAct ? (
            <p className="bo-lead mb-2">
              {tr("ui.pageEspaceCompagnie.unRetardUnNouvelHoraire")}
            </p>
          ) : null}
          {crossingRows(mine, true)}
        </section>
      ) : tab === "requests" && desk ? (
        <CompanyRequestsTab ctx={desk} />
      ) : tab === "lines" ? (
        <section className="bo-card">
          <h2>
            <RouteIcon aria-hidden /> {overview.lines.length}{tr("ui.pageEspaceCompagnie.ligne")}
            {overview.lines.length > 1 ? "s" : ""}
            <small>{tr("ui.pageEspaceCompagnie.frequenceCalculeeSur8Semaines")}</small>
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
                        : tr("ui.pageEspaceCompagnie.aucunDepartPublie")}
                    </small>
                  </span>
                  <em className="bo-pill" data-tone={line.perWeek ? undefined : "mute"}>
                    {String(line.perWeek).replace(".", ",")}{tr("ui.pageEspaceCompagnie.semaine")}
                  </em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bo-empty">{tr("ui.pageEspaceCompagnie.aucuneLigneRattacheeACette")}</p>
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
                    {note?.count ? `${reviewNumber(note.average ?? 0)}/5` : tr("ui.pageEspaceCompagnie.pasDeNote")}
                  </small>
                </h2>
                <dl className="bo-facts">
                  <div>
                    <dt>{tr("ui.pageEspaceCompagnie.miseEnService")}</dt>
                    <dd>{vessel.build_year ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tr("ui.pageEspaceCompagnie.passagers")}</dt>
                    <dd>{vessel.passenger_capacity ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tr("ui.pageEspaceCompagnie.vehicules")}</dt>
                    <dd>{vessel.car_capacity ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tr("ui.pageEspaceCompagnie.suiviEnMer")}</dt>
                    <dd>{vessel.mmsi ? tr("ui.pageEspaceCompagnie.actif") : tr("ui.pageEspaceCompagnie.nonRelie")}</dd>
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
                    <Camera className="size-4" aria-hidden />{tr("ui.pageEspaceCompagnie.photosDuNavire")}
                  </button>
                ) : null}
              </article>
            );
          })}
          {fleet.length ? null : <p className="bo-empty">{tr("ui.pageEspaceCompagnie.aucunNavireEnService")}</p>}
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
                    : tr("ui.pageEspaceCompagnie.aucunDepartPublieAVenir")}
                </p>
              </div>
            </div>
            <div className="bo-hello__actions">
              <button type="button" onClick={() => go("crossings")}>
                <CalendarDays aria-hidden />{tr("ui.pageEspaceCompagnie.mesTraversees")}
              </button>
              <button type="button" onClick={() => go("announce")}>
                <Megaphone aria-hidden />{tr("ui.pageEspaceCompagnie.prevenirMesPassagers")}
              </button>
            </div>
          </div>
          <section className="bo-card mb-3.5" aria-labelledby="bo-todo-title">
            <h2 id="bo-todo-title">
              <ListTodo aria-hidden />{tr("ui.pageEspaceCompagnie.aTraiter")}
              <small className="max-sm:hidden">{tr("ui.pageEspaceCompagnie.misAJourChaqueMinute")}</small>
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
                <CheckCircle2 aria-hidden className="size-4" />{tr("ui.pageEspaceCompagnie.rienATraiterPourLe")}
              </p>
            )}
            <h3 className="mt-3 text-sm font-semibold">
              {tr("ui.pageEspaceCompagnie.dansLes48Heures")}{" "}
              <span className="font-normal text-[var(--bo-muted)]">
                · {plural(soon.length, "traversée")}
              </span>
            </h3>
            {soon.length ? (
              crossingRows(soon, true)
            ) : (
              <p className="bo-empty">
                {departures.isPending
                  ? tr("ui.pageEspaceCompagnie.chargementDesTraversees")
                  : tr("ui.pageEspaceCompagnie.aucuneTraverseeDansLes48")}
              </p>
            )}
          </section>
          <div className="bo-kpis">
            <button type="button" className="bo-kpi" onClick={() => go("crossings")}>
              <span className="bo-kpi__top">
                {tr("ui.pageEspaceCompagnie.traverseesAVenir")}<CalendarDays aria-hidden />
              </span>
              <strong>{departures.isPending ? "–" : overview.upcoming}</strong>
              <small>{String(overview.perWeek).replace(".", ",")}{tr("ui.pageEspaceCompagnie.parSemaineSur8Semaines")}</small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("crossings")}>
              <span className="bo-kpi__top">
                {tr("ui.pageEspaceCompagnie.personnesQuiSuivent")}<Users aria-hidden />
              </span>
              <strong>{audience.data ? audience.data.total : "–"}</strong>
              <small>
                {audience.isError
                  ? tr("ui.pageEspaceCompagnie.chiffreIndisponible")
                  : !audience.data
                    ? tr("ui.pageEspaceCompagnie.calculEnCours")
                    : audience.data.total
                      ? `vos traversées à venir, dont ${audience.data.travellers} qui voyage${audience.data.travellers > 1 ? "nt" : ""}`
                      : tr("ui.pageEspaceCompagnie.personneNeSuitEncoreVos")}
              </small>
            </button>
            <button type="button" className="bo-kpi" onClick={() => go("reviews")}>
              <span className="bo-kpi__top">
                {tr("ui.pageEspaceCompagnie.noteDesVoyageurs")}<Star aria-hidden />
              </span>
              <strong>
                {reviews.data?.count ? reviewNumber(reviews.data.average ?? 0) : "–"}
                {reviews.data?.count ? <i>/5</i> : null}
              </strong>
              <small>
                {reviews.data?.count
                  ? `${reviews.data.count} avis publié${reviews.data.count > 1 ? "s" : ""}`
                  : tr("ui.pageEspaceCompagnie.pasEncoreDAvisPublie")}
              </small>
            </button>
            <button
              type="button"
              className="bo-kpi"
              data-tone={unanswered ? "todo" : "ok"}
              onClick={() => go("reviews")}
            >
              <span className="bo-kpi__top">
                {tr("ui.pageEspaceCompagnie.avisSansReponse")}<MessageSquare aria-hidden />
              </span>
              <strong>{feedback.data ? unanswered : "–"}</strong>
              <small>{unanswered ? tr("ui.pageEspaceCompagnie.uneReponseRassureLesVoyageurs") : tr("ui.pageEspaceCompagnie.toutEstAJour")}</small>
            </button>
            <button
              type="button"
              className="bo-kpi"
              data-tone={alerts.length ? "todo" : "ok"}
              onClick={() => go("signals")}
            >
              <span className="bo-kpi__top">
                {tr("ui.pageEspaceCompagnie.signalementsEnCours")}<MessageSquare aria-hidden />
              </span>
              <strong>{alerts.length}</strong>
              <small>{alerts.length ? tr("ui.pageEspaceCompagnie.surVosNavires") : tr("ui.pageEspaceCompagnie.rienEnCeMoment")}</small>
            </button>
          </div>
          <div className="bo-grid2">
            <section className="bo-card">
              <h2>
                <CalendarDays aria-hidden />{tr("ui.pageEspaceCompagnie.prochainesTraversees")}
                <small>
                  <button type="button" className="bo-link" onClick={() => go("crossings")}>
                    {tr("ui.pageEspaceCompagnie.toutVoir")}
                  </button>
                </small>
              </h2>
              {crossingRows(mine.slice(0, 6))}
            </section>
            <div className="bo-stack">
              <section className="bo-card">
                <h2>
                  <Star aria-hidden />{tr("ui.pageEspaceCompagnie.ceQueDisentLesVoyageurs")}
                </h2>
                {reviewBars}
              </section>
              <section className="bo-card">
                <h2>
                  <Radio aria-hidden />{tr("ui.pageEspaceCompagnie.signaleEnCeMoment")}
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
