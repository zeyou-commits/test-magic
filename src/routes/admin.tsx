import { EntityReviewsModeration } from "@/components/admin/EntityReviewsModeration";
import { WalletMediaAdmin } from "@/components/admin/WalletMediaAdmin";
import { commercialArrival } from "@/lib/admin/commercial";
import { trackingTimes } from "@/lib/ferry/tracking";
import type { Departure } from "@/lib/ferry/types";
import { CommercialPrograms } from "@/components/admin/CommercialPrograms";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { canUseAdminTab } from "@/lib/admin/permissions";
import { communityQuery } from "@/lib/ferry/community";
import { NewsAdmin, PlacesAdmin } from "@/components/admin/ContentAdmin";
import { CommunityModeration } from "@/components/panel/CommunityModeration";
import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlanningAlerts, usePlanningAlerts } from "@/components/admin/PlanningAlerts";
import { NotificationOverview } from "@/components/admin/NotificationOverview";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { TodayInbox } from "@/components/admin/TodayInbox";
import { MobileIncidentPanel } from "@/components/admin/MobileIncidentPanel";
import { UsageAdmin } from "@/components/admin/UsageAdmin";
import { PlanningBoard } from "@/components/admin/PlanningBoard";
import { SeasonImport } from "@/components/admin/SeasonImport";
import { FleetBoard } from "@/components/admin/FleetBoard";
import { AssignSettings } from "@/components/admin/AssignSettings";
import { IncidentsAdmin } from "@/components/admin/IncidentsAdmin";
import { useAdminCounts } from "@/hooks/useAdminCounts";
import { AdminWorkspace, type AdminSearchItem } from "@/components/admin/AdminWorkspace";
import { AdminDrawer, AdminListToolbar, matches } from "@/components/admin/AdminDrawer";
import { SignalsAdmin } from "@/components/admin/SignalsAdmin";
import { CompaniesAdmin } from "@/components/admin/CompaniesAdmin";
import { PushDiagnostic } from "@/components/admin/PushDiagnostic";
import { MessageCenter } from "@/components/admin/MessageComposer";
import { storeMessagePrefill, type MessagePrefill } from "@/lib/notifications/messages";
import { AdminFilterNotice } from "@/components/admin/AdminFilterNotice";
import {
  adminSearch,
  matchesDepartureScope,
  type AdminFilter,
  type DepartureScope,
} from "@/lib/admin/navigation";
import { adminNotificationQuery } from "@/lib/notifications/admin";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  portsQuery,
  routesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  adminDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  facilityLabels,
  formatDateTime,
  formatDuration,
  weekdayLabels,
} from "@/lib/ferry/format";
import { routeColor, routePalette } from "@/lib/ferry/colors";
import { portPresets } from "@/lib/ferry/portPresets";
import type { Port, Vessel } from "@/lib/ferry/types";
import {
  dateKeyInZone,
  portTimeZone,
  wallTimeInZone,
  zonedTimeToUtc,
  zoneLabel,
} from "@/lib/ferry/time";

// Libellés français des statuts et motifs (la base stocke des codes en anglais).
const reviewStatusLabel: Record<string, string> = {
  pending: "En attente",
  approved: "Validé",
  published: "Publié",
  rejected: "Refusé",
  hidden: "Masqué",
  deleted: "Supprimé",
};
const reportStatusLabel: Record<string, string> = {
  new: "Nouveau",
  in_progress: "En cours",
  resolved: "Traité",
  rejected: "Écarté",
};
const reportTargetLabel: Record<string, string> = {
  port: "Port",
  route: "Ligne",
  departure: "Départ",
  review: "Avis",
  schedule: "Calendrier",
  vessel: "Navire",
  company: "Compagnie",
};
const reportReasonLabel: Record<string, string> = {
  wrong_schedule: "Horaire inexact",
  outdated_info: "Information obsolète",
  missing_info: "Information manquante",
  vessel_immobilized: "Navire immobilisé",
  inappropriate: "Contenu inapproprié",
  other: "Autre",
};

/** Confirmation simple avant une action définitive. */
function confirmAction(message: string) {
  return typeof window === "undefined" ? false : window.confirm(message);
}

/** Ajoute des jours à une date AAAA-MM-JJ. */
function addDaysToDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const departureStatusLabel: Record<string, string> = {
  scheduled: "Prévu",
  modified: "Modifié",
  cancelled: "Annulé",
};

export const Route = createFileRoute("/admin")({
  validateSearch: adminSearch,
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Back-office — BledWay" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Espace d'administration BledWay : modération des avis, signalements, calendriers et départs.",
      },
      { property: "og:title", content: "Back-office — BledWay" },
      {
        property: "og:description",
        content: "Modération des avis, signalements et gestion des départs BledWay.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { roles, loading, user } = useAuth();

  if (loading) {
    return <CenteredNote>Chargement…</CenteredNote>;
  }

  if (!user) {
    return (
      <CenteredNote>
        <p>Connectez-vous pour accéder au back-office.</p>
        <Button asChild className="mt-3">
          <a href="/auth?next=%2Fadmin">Se connecter</a>
        </Button>
      </CenteredNote>
    );
  }

  if (!roles.some((role) => ["admin", "editor", "moderator"].includes(role))) {
    return (
      <CenteredNote>
        <p>Cet espace est réservé à l'équipe BledWay.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/">Retour à la carte</Link>
        </Button>
      </CenteredNote>
    );
  }

  return <AdminTabs />;
}

function CountBadge({
  value,
  tone = "warn",
}: {
  value: number | undefined;
  tone?: "warn" | "muted";
}) {
  if (!value) return null;
  return (
    <span
      className={`ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        tone === "warn" ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function AdminTabs() {
  const { user, roles, isAdmin } = useAuth();
  const community = useQuery(communityQuery(undefined, undefined, true, user?.id));
  const {
    tab: requestedTab = "overview",
    filter,
    company,
    route: commercialRoute,
    item,
    date: planningDate,
  } = Route.useSearch();
  const tab = canUseAdminTab(roles, requestedTab)
    ? requestedTab
    : roles.includes("editor")
      ? "departures"
      : "reviews";
  const navigate = Route.useNavigate();
  const navigateTo = (id: string, nextFilter?: AdminFilter) => {
    if (!canUseAdminTab(roles, id)) return;
    void navigate({ search: adminSearch({ tab: id, filter: nextFilter }), resetScroll: false });
  };
  const clearFilter = () => navigateTo(tab);
  const queryClient = useQueryClient();
  const notificationOverview = useQuery(adminNotificationQuery(isAdmin ? user?.id : undefined));
  const { data: counts } = useAdminCounts();
  // Recherche du menu (Ctrl+K) : rubriques et fiches (ports, navires, compagnies).
  const { data: searchPorts = [] } = useQuery(portsQuery);
  const { data: searchVessels = [] } = useQuery(vesselsQuery);
  const { data: searchCompanies = [] } = useQuery(companiesQuery);
  const { data: searchRoutes = [] } = useQuery(routesQuery);
  const searchItems: AdminSearchItem[] = [
    ...searchPorts.map((port) => ({
      tab: "ports",
      id: port.id,
      label: port.name,
      hint: `Port · ${port.country_name}`,
    })),
    ...searchVessels.map((vessel) => ({
      tab: "vessels",
      id: vessel.id,
      label: vessel.name,
      hint: `Navire${vessel.mmsi ? ` · MMSI ${vessel.mmsi}` : ""}`,
    })),
    ...searchRoutes.map((route) => {
      const name = (id: string) => searchPorts.find((port) => port.id === id)?.name ?? "?";
      return {
        tab: "routes",
        id: route.id,
        label: `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}`,
        hint: "Liaison",
      };
    }),
    ...searchCompanies.map((company) => ({
      tab: "companies",
      id: company.id,
      label: company.name,
      hint: "Compagnie",
    })),
  ];
  const openItem = (id: string, itemId: string) => {
    if (!canUseAdminTab(roles, id)) return;
    void navigate({ search: adminSearch({ tab: id, item: itemId }), resetScroll: false });
  };
  const openPlanning = (date?: string, nextFilter?: "unassigned" | "issues") => {
    if (!canUseAdminTab(roles, "planning")) return;
    void navigate({ search: adminSearch({ tab: "planning", date, filter: nextFilter }) });
  };
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success") {
          void queryClient.invalidateQueries({ queryKey: ["admin", "notification-overview"] });
          void queryClient.invalidateQueries({ queryKey: ["admin", "counts"] });
        }
      }),
    [queryClient],
  );
  const badges = {
    notifications:
      notificationOverview.data?.campaigns.filter((campaign) =>
        ["pending", "approved"].includes(campaign.status),
      ).length ?? 0,
    reviews: counts?.reviews ?? 0,
    reports: counts?.reports ?? 0,
    community: (community.data?.reviews.filter((review) => review.status === "pending").length ?? 0) + (counts?.anomalies ?? 0),
  };
  return (
    <Tabs value={tab} onValueChange={navigateTo}>
      <AdminWorkspace
        tab={tab}
        onNavigate={navigateTo}
        badges={badges}
        canAccess={(id) => canUseAdminTab(roles, id)}
        searchItems={searchItems}
        onOpenItem={openItem}
      >
        <TabsContent value="commercial">
          <CommercialPrograms
            companyId={company}
            routeId={commercialRoute}
            onContext={(companyId, routeId) =>
              void navigate({
                search: adminSearch({ tab: "commercial", company: companyId, route: routeId }),
                resetScroll: false,
              })
            }
            onNetwork={() => navigateTo("routes")}
            renderSchedules={(companyId, routeId) => (
              <SchedulesAdmin
                key={`${companyId}:${routeId}`}
                companyId={companyId}
                routeId={routeId}
              />
            )}
            renderDepartures={(companyId, routeId) => (
              <DeparturesAdmin
                key={`${companyId}:${routeId}`}
                scope={undefined}
                onClearFilter={() => {}}
                companyId={companyId}
                routeId={routeId}
              />
            )}
            renderVessels={(_companyId, ids) => <VesselsAdmin vesselIds={ids} />}
          />
        </TabsContent>
        <TabsContent value="users">
          <UsersAdmin />
        </TabsContent>
        <TabsContent value="overview">
          {canUseAdminTab(roles, "planning") && (
            <MobileIncidentPanel
              onNavigate={navigateTo}
              renderEditor={(id, onDone) => <AlertDepartureEditor departureId={id} onDone={onDone} />}
            />
          )}
          {canUseAdminTab(roles, "planning") && (
            <TodayInbox
              onOpenPlanning={openPlanning}
              onOpenVessel={(id) => openItem("vessels", id)}
              onImport={() => navigateTo("import")}
            />
          )}
          {notificationOverview.error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              Le centre de notifications n’est pas disponible pour le moment.
            </p>
          )}
        </TabsContent>
        <TabsContent value="health">
          <TodayInbox
            view="health"
            onOpenPlanning={openPlanning}
            onOpenVessel={(id) => openItem("vessels", id)}
            onImport={() => navigateTo("import")}
          />
        </TabsContent>
        <TabsContent value="usage">
          <UsageAdmin />
        </TabsContent>
        <TabsContent value="reviews">
          <EntityReviewsModeration pendingOnly={filter === "pending"} />
          <ReviewsModeration pendingOnly={filter === "pending"} onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="community">
          <CommunityModeration />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsModeration newOnly={filter === "new"} onClearFilter={clearFilter} />
        </TabsContent>
        <TabsContent value="alerts">
          <PlanningAlerts
            renderEditor={(id, onDone) => <AlertDepartureEditor departureId={id} onDone={onDone} />}
          />
        </TabsContent>
        <TabsContent value="notifications">
          <MessageCenter />
          <div className="mt-5">
            <PushDiagnostic />
          </div>
          <NotificationOverview />
        </TabsContent>
        <TabsContent value="flash">
          <NewsAdmin />
        </TabsContent>
        <TabsContent value="signals">
          <SignalsAdmin />
        </TabsContent>
        <TabsContent value="places">
          <PlacesAdmin />
        </TabsContent>
        <TabsContent value="walletMedia">
          <WalletMediaAdmin />
        </TabsContent>
        <TabsContent value="companies">
          <CompaniesAdmin itemId={tab === "companies" ? item : undefined} />
        </TabsContent>
        <TabsContent value="planning">
          <MobileIncidentPanel
            onNavigate={navigateTo}
            renderEditor={(id, onDone) => <AlertDepartureEditor departureId={id} onDone={onDone} />}
          />
          <div className="bw-admin-desktop-only">
          <PlanningBoard
            key={`${planningDate ?? ""}:${filter ?? ""}`}
            initialDate={planningDate}
            initialFilter={filter === "unassigned" || filter === "issues" ? filter : undefined}
            renderEditor={(id, onDone) => <AlertDepartureEditor departureId={id} onDone={onDone} />}
          />
          </div>
        </TabsContent>
        <TabsContent value="assign">
          <AssignSettings />
        </TabsContent>
        <TabsContent value="incidents">
          <IncidentsAdmin />
        </TabsContent>
        <TabsContent value="departures">
          <DeparturesAdmin
            scope={filter === "today" || filter === "unassigned" ? filter : undefined}
            onClearFilter={clearFilter}
          />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesAdmin />
        </TabsContent>
        <TabsContent value="ports">
          <PortsAdmin itemId={tab === "ports" ? item : undefined} />
        </TabsContent>
        <TabsContent value="routes">
          <RoutesAdmin itemId={tab === "routes" ? item : undefined} />
        </TabsContent>
        <TabsContent value="vessels">
          <FleetBoard
            key={tab === "vessels" ? (item ?? "") : ""}
            initialVesselId={tab === "vessels" ? item : undefined}
            renderEditor={(vessel) => <VesselEditor vessel={vessel} />}
            onOpenCompany={(id) => openItem("companies", id)}
          />
        </TabsContent>
        <TabsContent value="import">
          <SeasonImport />
        </TabsContent>
        <TabsContent value="data">
          <DataAdmin />
        </TabsContent>
      </AdminWorkspace>
    </Tabs>
  );
}

function AlertDepartureEditor({
  departureId,
  onDone,
}: {
  departureId: string;
  onDone: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "departure-edit", departureId],
    queryFn: async () => {
      const { data: dep, error } = await supabase
        .from("departures")
        .select("id, departure_at, duration_minutes, vessel_id, status, company_id, route_id")
        .eq("id", departureId)
        .single();
      if (error) throw new Error(error.message);
      const [{ data: route }, { data: vessels }] = await Promise.all([
        supabase.from("routes").select("departure_port_id").eq("id", dep.route_id).single(),
        supabase.from("vessels").select("id,name,company_id").order("name"),
      ]);
      const { data: port } = route
        ? await supabase.from("ports").select("*").eq("id", route.departure_port_id).single()
        : { data: null };
      return { dep, port, vessels: vessels ?? [] };
    },
  });
  if (isLoading || !data) return <p className="mt-2 text-xs">Chargement…</p>;
  const tz = portTimeZone((data.port ?? undefined) as Port | undefined);
  return (
    <DepartureEditor
      departure={data.dep}
      timeZone={tz}
      vessels={data.vessels.filter((v) => !v.company_id || v.company_id === data.dep.company_id)}
      onDone={onDone}
    />
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center text-sm text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bw-admin-surface bw-admin-editor mt-4 overflow-x-auto p-4 sm:p-5">
      {children}
    </div>
  );
}

function ReviewsModeration({
  pendingOnly,
  onClearFilter,
}: {
  pendingOnly: boolean;
  onClearFilter: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin", "reviews", pendingOnly],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("port_reviews")
        .select("*")
        .in(
          "status",
          pendingOnly ? ["pending"] : ["pending", "approved", "published", "hidden", "rejected"],
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("port_reviews")
        .update({
          status: status as "published" | "rejected" | "hidden",
          moderated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["port_reviews"] });
      toast.success("Avis mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <Panel>
      {pendingOnly && (
        <AdminFilterNotice label="Avis ports en attente de modération" onClear={onClearFilter} />
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun avis à traiter.</p>
      ) : (
        <ul className="divide-y divide-border">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {portName(review.port_id)}
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {reviewStatusLabel[review.status] ?? review.status}
                  </span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.comment ?? "(sans commentaire)"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending || review.status === "published"}
                  onClick={() => update.mutate({ id: review.id, status: "published" })}
                >
                  Publier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending || review.status === "hidden"}
                  onClick={() => update.mutate({ id: review.id, status: "hidden" })}
                >
                  Masquer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending || review.status === "rejected"}
                  onClick={() => {
                    if (confirmAction("Refuser cet avis ? Il ne sera pas publié."))
                      update.mutate({ id: review.id, status: "rejected" });
                  }}
                >
                  Refuser
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReportsModeration({
  newOnly,
  onClearFilter,
}: {
  newOnly: boolean;
  onClearFilter: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin", "reports", newOnly],
    queryFn: async () => {
      let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
      if (newOnly) query = query.eq("status", "new");
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "resolved" | "rejected" }) => {
      const { error } = await supabase
        .from("reports")
        .update({ status, handled_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast.success("Signalement mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel>
      {newOnly && (
        <AdminFilterNotice label="Nouveaux signalements à traiter" onClear={onClearFilter} />
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun signalement.</p>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {reportTargetLabel[report.target_type] ?? report.target_type} ·{" "}
                  {reportReasonLabel[report.reason] ?? report.reason}
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {reportStatusLabel[report.status] ?? report.status}
                  </span>
                </p>
                {report.message ? (
                  <p className="mt-1 text-sm text-muted-foreground">{report.message}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: report.id, status: "resolved" })}
                >
                  Marquer traité
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: report.id, status: "rejected" })}
                >
                  Écarter
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Après une modification qui touche des voyageurs : confirmation + bouton « Prévenir les voyageurs ». */
function useWarnTravellers() {
  const navigate = Route.useNavigate();
  return (message: string, prefill: MessagePrefill, description?: string) =>
    toast.success(message, {
      duration: 15_000,
      description: description ?? "Les voyageurs concernés ne sont pas encore prévenus.",
      action: {
        label: "Prévenir les voyageurs",
        onClick: () => {
          storeMessagePrefill(prefill);
          void navigate({ search: adminSearch({ tab: "notifications" }), resetScroll: false });
        },
      },
    });
}

function DepartureEditor({
  departure,
  timeZone,
  vessels,
  onDone,
}: {
  departure: {
    id: string;
    departure_at: string;
    duration_minutes: number | null;
    presentation_minutes?: number | null;
    vessel_id: string | null;
    status: string;
  };
  timeZone: string;
  vessels: { id: string; name: string }[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const [date, setDate] = useState(dateKeyInZone(departure.departure_at, timeZone));
  const [time, setTime] = useState(wallTimeInZone(departure.departure_at, timeZone).slice(0, 5));
  const [hours, setHours] = useState(String(Math.floor((departure.duration_minutes ?? 0) / 60)));
  const [mins, setMins] = useState(String((departure.duration_minutes ?? 0) % 60));
  const [presentationHours, setPresentationHours] = useState(departure.presentation_minutes == null ? "" : String(departure.presentation_minutes / 60));
  const [vesselId, setVesselId] = useState(departure.vessel_id ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const start = zonedTimeToUtc(date, time, timeZone);
      const duration = Number(hours) * 60 + Number(mins);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Durée invalide.");
      const presentationMinutes = presentationHours.trim() ? Math.round(Number(presentationHours) * 60) : null;
      if (presentationMinutes !== null && (!Number.isFinite(presentationMinutes) || presentationMinutes < 30 || presentationMinutes > 720)) throw new Error("La présentation doit être comprise entre 30 minutes et 12 heures.");
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from("departures")
        .update({
          departure_at: start.toISOString(),
          duration_minutes: duration,
          presentation_minutes: presentationMinutes,
          arrival_at: new Date(start.getTime() + duration * 60_000).toISOString(),
          vessel_id: vesselId || null,
          status: departure.status === "cancelled" ? "cancelled" : "modified",
        })
        .eq("id", departure.id)
        .select("duration_minutes")
        .single();
      if (error) throw new Error(error.message);
      if (data.duration_minutes !== duration)
        toast.warning(
          "Durée hors de la plage de la ligne : la durée standard a été appliquée. Pour la changer, modifiez la durée de la ligne.",
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "planning-alerts"] });
      // Horaire ou navire changé : on propose tout de suite de prévenir ceux qui suivent ce départ.
      const oldDate = dateKeyInZone(departure.departure_at, timeZone);
      const oldTime = wallTimeInZone(departure.departure_at, timeZone).slice(0, 5);
      const moved = oldDate !== date || oldTime !== time;
      const vesselChanged = (departure.vessel_id ?? "") !== vesselId;
      const oldDay = new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone,
      }).format(new Date(departure.departure_at));
      toast.success("Départ modifié.", {
        ...(moved || vesselChanged
          ? {
              duration: 15_000,
              description: "Les voyageurs qui suivent ce départ ne sont pas encore prévenus.",
              action: {
                label: "Prévenir les voyageurs",
                onClick: () => {
                  storeMessagePrefill({
                    audience: { kind: "departure", departureId: departure.id, who: "everyone" },
                    template: moved ? "reschedule" : "free",
                    fields: { oldTime: oldDate === date ? oldTime : `${oldDay} à ${oldTime}` },
                  });
                  void navigate({
                    search: adminSearch({ tab: "notifications" }),
                    resetScroll: false,
                  });
                },
              },
            }
          : {}),
      });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-md border border-border p-2">
      <label className="text-xs">
        Date
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="text-xs">
        Heure ({zoneLabel(timeZone)})
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="text-xs">
        Durée h
        <Input
          className="w-16"
          type="number"
          min={0}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </label>
      <label className="text-xs">
        min
        <Input
          className="w-16"
          type="number"
          min={0}
          max={59}
          value={mins}
          onChange={(e) => setMins(e.target.value)}
        />
      </label>
      <label className="text-xs">
        Présentation au port (h avant départ)
        <Input className="w-28" type="number" min={0.5} max={12} step={0.5} placeholder="Défaut : 4 h" value={presentationHours} onChange={(e) => setPresentationHours(e.target.value)} />
        <small className="block max-w-44 text-muted-foreground">Renseigner seulement si la compagnie publie une consigne. Vide = repère indicatif de 4 h.</small>
      </label>
      <label className="text-xs">
        Navire
        <select
          className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
        >
          <option value="">—</option>
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Enregistrer
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Fermer
      </Button>
    </div>
  );
}

function DeparturesAdmin({
  scope,
  onClearFilter,
  companyId,
  routeId,
}: {
  companyId?: string;
  routeId?: string;
  scope: DepartureScope | undefined;
  onClearFilter: () => void;
}) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"upcoming" | "recent" | "all">("upcoming");
  const [dateFilter, setDateFilter] = useState("");
  const {
    data: periodDepartures = [],
    isLoading: loadingDeps,
    error: departuresError,
    refetch,
  } = useQuery(adminDeparturesQuery(scope ? "upcoming" : period));
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery({
    queryKey: ["admin", "vessels-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vessels")
        .select("id,name,company_id")
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [companyFilter, setCompanyFilter] = useState(companyId ?? "");
  const [routeFilter, setRouteFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const warnTravellers = useWarnTravellers();

  const update = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: { status?: "scheduled" | "cancelled" };
    }) => {
      const { error } = await supabase
        .from("departures")
        .update(values)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      if (variables.values.status === "cancelled")
        warnTravellers("Départ annulé.", {
          audience: { kind: "departure", departureId: variables.id, who: "everyone" },
          template: "cancel",
        });
      else toast.success("Départ mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const now = new Date();
  const routeOptions = routes
    .filter((route) => !routeId || route.id === routeId)
    .map((route) => ({
      id: route.id,
      label: `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const shown = periodDepartures.filter((departure) => {
    if (companyId && departure.company_id !== companyId) return false;
    if (routeId && departure.route_id !== routeId) return false;
    if (!matchesDepartureScope(departure, scope, now)) return false;
    if (companyFilter && departure.company_id !== companyFilter) return false;
    if (routeFilter && departure.route_id !== routeFilter) return false;
    const route = routes.find((item) => item.id === departure.route_id);
    if (
      search &&
      !matches(
        search,
        route ? portName(route.departure_port_id) : "",
        route ? portName(route.arrival_port_id) : "",
        vessels.find((vessel) => vessel.id === departure.vessel_id)?.name,
        companies.find((company) => company.id === departure.company_id)?.name,
      )
    )
      return false;
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    return !dateFilter || dateKeyInZone(departure.departure_at, zone) === dateFilter;
  });

  return (
    <Panel>
      {scope && (
        <AdminFilterNotice
          label={
            scope === "unassigned"
              ? "Départs à venir sans navire · hors annulations"
              : "Départs aujourd’hui"
          }
          onClear={onClearFilter}
        />
      )}
      {departuresError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Impossible de charger les départs.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Réessayer
          </button>
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="bw-admin-toolbar__search max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Port, navire ou compagnie…"
            aria-label="Chercher un départ"
          />
        </label>
        <select
          aria-label="Filtrer par liaison"
          className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
          value={routeFilter}
          onChange={(e) => setRouteFilter(e.target.value)}
        >
          <option value="">Toutes les lignes</option>
          {routeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground" htmlFor="dep-company">
          Compagnie
        </label>
        <select
          id="dep-company"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        >
          <option value="">Toutes</option>
          {companies
            .filter((c) => !companyId || c.id === companyId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <label className="ml-2 text-sm text-muted-foreground" htmlFor="dep-period">
          Période
        </label>
        <select
          id="dep-period"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={period}
          disabled={!!scope}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
        >
          <option value="upcoming">Aujourd'hui et à venir</option>
          <option value="recent">7 derniers jours et à venir</option>
          <option value="all">Tout l'historique</option>
        </select>
        <input
          type="date"
          aria-label="Filtrer par date"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            if (e.target.value && e.target.value < new Date().toISOString().slice(0, 10))
              setPeriod("all");
          }}
        />
        <span className="text-xs text-muted-foreground">
          {loadingDeps ? "Chargement…" : `${shown.length} départ(s)`}
        </span>
      </div>
      {!loadingDeps && !departuresError && shown.length === 0 && (
        <p role="status" className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">
          Aucun départ ne correspond aux filtres.{" "}
          {scope === "unassigned" &&
            !companyFilter &&
            !dateFilter &&
            "Tous les départs à venir ont un navire affecté."}
        </p>
      )}
      <ul className="divide-y divide-border">
        {shown.map((departure) => {
          const arrival = trackingTimes(departure as Departure).arrival.iso;
          const route = routes.find((item) => item.id === departure.route_id);
          const company = companies.find((item) => item.id === departure.company_id);
          const tz = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
          const vessel = vessels.find((v) => v.id === departure.vessel_id);
          return (
            <li
              key={departure.id}
              className="flex flex-wrap items-center gap-3 py-3"
              data-departure-id={departure.id}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatDateTime(departure.departure_at, tz)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({zoneLabel(tz)})
                  </span>
                </p>
                {arrival && (
                  <p className="text-xs font-medium">
                    Arrivée :{" "}
                    {formatDateTime(
                      arrival,
                      portTimeZone(ports.find((p) => p.id === route?.arrival_port_id)),
                    )}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {route
                    ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
                    : "—"}
                  {company ? ` · ${company.name}` : ""}
                  {vessel ? ` · ${vessel.name}` : " · Navire à affecter"} ·{" "}
                  {formatDuration(departure.duration_minutes)} ·{" "}
                  {departureStatusLabel[departure.status] ?? departure.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(departure.id)}>
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => {
                    const cancelling = departure.status !== "cancelled";
                    if (
                      cancelling &&
                      !confirmAction(
                        "Marquer ce départ comme annulé ? Il sera affiché « Annulé » sur le site.",
                      )
                    )
                      return;
                    update.mutate({
                      id: departure.id,
                      values: { status: cancelling ? "cancelled" : "scheduled" },
                    });
                  }}
                >
                  {departure.status === "cancelled" ? "Rétablir le départ" : "Annuler le départ"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {(() => {
        // Édition d'un départ dans le panneau latéral (la liste reste visible).
        const departure = periodDepartures.find((item) => item.id === editing);
        if (!departure) return null;
        const route = routes.find((item) => item.id === departure.route_id);
        const company = companies.find((item) => item.id === departure.company_id);
        const tz = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
        return (
          <AdminDrawer
            open
            onOpenChange={(next) => !next && setEditing(null)}
            title={
              route
                ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
                : "Départ"
            }
            description={`${formatDateTime(departure.departure_at, tz)} (${zoneLabel(tz)})${company ? ` · ${company.name}` : ""}`}
          >
            <DepartureEditor
              departure={departure}
              timeZone={tz}
              vessels={vessels.filter(
                (v) => !company || !v.company_id || v.company_id === company.id,
              )}
              onDone={() => setEditing(null)}
            />
          </AdminDrawer>
        );
      })()}
    </Panel>
  );
}

const emptyDraft = {
  route_id: "",
  company_id: "",
  default_vessel_id: "",
  departure_time: "08:00",
  arrival_time: "18:00",
  duration_minutes: 600,
  weekdays: [] as number[],
  valid_from: new Date().toISOString().slice(0, 10),
  valid_to: "",
  source_name: "",
  source_url: "",
};

// Heures théoriques : la durée et l'heure d'arrivée restent cohérentes entre elles.
function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function addMinutesToTime(time: string, minutes: number): string {
  const base = timeToMinutes(time);
  if (base === null || !Number.isFinite(minutes)) return "";
  const total = (((base + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Indique si l'arrivée théorique tombe le lendemain (ou plus tard).
function dayShift(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  return days > 0 ? ` (+${days} j)` : "";
}

// Conversion de deux heures d'une même journée pour les anciens imports.
function durationBetweenTimes(departure: string, arrival: string): number | null {
  const from = timeToMinutes(departure),
    to = timeToMinutes(arrival);
  if (from === null || to === null) return null;
  const diff = to - from;
  return diff > 0 ? diff : diff + 1440;
}

function SchedulesAdmin({ companyId, routeId }: { companyId?: string; routeId?: string } = {}) {
  const queryClient = useQueryClient();
  const { data: allSchedules = [] } = useQuery(schedulesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const schedules = allSchedules.filter(
    (schedule) =>
      (!companyId || schedule.company_id === companyId) &&
      (!routeId || schedule.route_id === routeId),
  );
  const scopedDraft = { ...emptyDraft, company_id: companyId ?? "", route_id: routeId ?? "" };
  const [draft, setDraft] = useState(scopedDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const warnTravellers = useWarnTravellers();
  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setDraft(scopedDraft);
  };

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const routeLabel = (id: string) => {
    const route = routes.find((item) => item.id === id);
    if (!route) return "—";
    return `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["schedules"] });
    queryClient.invalidateQueries({ queryKey: ["departures"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.route_id || !draft.company_id)
        throw new Error("Choisissez une ligne et une compagnie.");
      if (draft.weekdays.length === 0) throw new Error("Choisissez au moins un jour.");
      const values = {
        route_id: draft.route_id,
        company_id: draft.company_id,
        default_vessel_id: draft.default_vessel_id || null,
        departure_time: `${draft.departure_time}:00`,
        duration_minutes: Number(draft.duration_minutes),
        weekdays: draft.weekdays.slice().sort((a, b) => a - b),
        valid_from: draft.valid_from,
        valid_to: draft.valid_to || null,
        source_name: draft.source_name || null,
        source_url: draft.source_url || null,
        reliability: "to_verify" as const,
        last_verified_at: null,
        status: "active" as const,
      };
      const { error } = editingId
        ? await supabase.from("schedules").update(values).eq("id", editingId)
        : await supabase.from("schedules").insert(values);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      const routeId = draft.route_id;
      setDraft(scopedDraft);
      setEditingId(null);
      setFormOpen(false);
      if (editingId)
        warnTravellers(
          "Calendrier modifié.",
          { audience: { kind: "route", routeId }, template: "reschedule" },
          "Les voyageurs de cette ligne ne sont pas encore prévenus.",
        );
      else toast.success("Calendrier ajouté.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Calendrier supprimé.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Génère les départs des 60 prochains jours à partir d'un calendrier.
  const generate = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: number | null; error: { message: string } | null }>
      )("bw_generate_schedule_missing", { _schedule: scheduleId });
      if (error)
        throw new Error("Génération impossible : vérifiez la migration commerciale et vos droits.");
      return data ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(
        `${count} nouveau(x) départ(s) ajouté(s), sans modifier les départs existants.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const draftRoute = routes.find((r) => r.id === draft.route_id);
  const fromZone = portTimeZone(ports.find((p) => p.id === draftRoute?.departure_port_id));
  const toZone = portTimeZone(ports.find((p) => p.id === draftRoute?.arrival_port_id));
  const previewArrival = commercialArrival(
    draft.valid_from,
    draft.departure_time,
    Number(draft.duration_minutes),
    fromZone,
  );
  const schedulePreview = (schedule: (typeof allSchedules)[number]) => {
    const line = routes.find((r) => r.id === schedule.route_id);
    const departureZone = portTimeZone(ports.find((p) => p.id === line?.departure_port_id));
    const arrivalZone = portTimeZone(ports.find((p) => p.id === line?.arrival_port_id));
    const iso = commercialArrival(
      schedule.valid_from,
      schedule.departure_time.slice(0, 5),
      schedule.duration_minutes,
      departureZone,
    );
    return iso ? `${formatDateTime(iso, arrivalZone)} · ${zoneLabel(arrivalZone)}` : "À confirmer";
  };
  const toggleDay = (day: number) =>
    setDraft((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((value) => value !== day)
        : [...prev.weekdays, day],
    }));

  return (
    <>
      <AdminDrawer
        open={formOpen}
        onOpenChange={(next) => !next && closeForm()}
        title={editingId ? "Modifier le calendrier" : "Nouveau calendrier de traversées"}
        description="Liaison, jours, horaires, période de validité et source officielle."
      >
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ligne">
              <NativeSelect
                value={draft.route_id}
                onChange={(value) => setDraft((prev) => ({ ...prev, route_id: value }))}
                options={routes
                  .filter((r) => !routeId || r.id === routeId)
                  .map((route) => ({ value: route.id, label: routeLabel(route.id) }))}
              />
            </Field>
            <Field label="Compagnie">
              <NativeSelect
                value={draft.company_id}
                onChange={(value) => setDraft((prev) => ({ ...prev, company_id: value }))}
                options={companies
                  .filter((c) => !companyId || c.id === companyId)
                  .map((company) => ({ value: company.id, label: company.name }))}
              />
            </Field>
            <Field label="Navire (facultatif)">
              <NativeSelect
                value={draft.default_vessel_id}
                onChange={(value) => setDraft((prev) => ({ ...prev, default_vessel_id: value }))}
                options={vessels
                  .filter(
                    (v) => !draft.company_id || !v.company_id || v.company_id === draft.company_id,
                  )
                  .map((vessel) => ({ value: vessel.id, label: vessel.name }))}
              />
            </Field>
            <Field label="Heure de départ">
              <Input
                type="time"
                value={draft.departure_time}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, departure_time: event.target.value }))
                }
              />
            </Field>
            <Field label="Arrivée calculée · heure du port d’arrivée">
              <Input
                readOnly
                value={
                  previewArrival
                    ? `${formatDateTime(previewArrival, toZone)} (${zoneLabel(toZone)})`
                    : "À renseigner"
                }
              />
            </Field>
            <Field label="Durée (minutes)">
              <Input
                type="number"
                min={30}
                value={draft.duration_minutes}
                onChange={(event) =>
                  setDraft((prev) => {
                    const duration_minutes = Number(event.target.value);
                    return {
                      ...prev,
                      duration_minutes,
                      arrival_time:
                        addMinutesToTime(prev.departure_time, duration_minutes) ||
                        prev.arrival_time,
                    };
                  })
                }
              />
            </Field>
            <Field label="Valide du">
              <Input
                type="date"
                value={draft.valid_from}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, valid_from: event.target.value }))
                }
              />
            </Field>
            <Field label="Valide jusqu'au (facultatif)">
              <Input
                type="date"
                value={draft.valid_to}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, valid_to: event.target.value }))
                }
              />
            </Field>
            <Field label="Source de l'information">
              <Input
                value={draft.source_name}
                placeholder="Site officiel de la compagnie"
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, source_name: event.target.value }))
                }
              />
            </Field>
            <Field label="Lien de la source">
              <Input
                value={draft.source_url}
                placeholder="https://…"
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, source_url: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Jours de départ</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {weekdayLabels.map((label, index) => {
                const day = index + 1;
                const active = draft.weekdays.includes(day);
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleDay(day)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            L’arrivée affichée est un aperçu au début de validité. Les nouveaux départs seront
            calculés dans les fuseaux des ports à leur date. Les départs déjà publiés se modifient
            dans Départs / arrivées.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {editingId ? "Enregistrer les modifications" : "Ajouter le calendrier"}
            </Button>
            <Button size="sm" variant="ghost" onClick={closeForm}>
              Annuler
            </Button>
          </div>
        </div>
      </AdminDrawer>

      <Panel>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Calendriers existants ({schedules.length})</h2>
          <button
            type="button"
            className="bw-admin-toolbar__create"
            onClick={() => {
              setEditingId(null);
              setDraft(scopedDraft);
              setFormOpen(true);
            }}
          >
            + Nouveau calendrier
          </button>
        </div>
        <ul className="divide-y divide-border">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {routeLabel(schedule.route_id)} · départ {schedule.departure_time.slice(0, 5)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Du {schedule.valid_from}
                  {schedule.valid_to ? ` au ${schedule.valid_to}` : " · fin à préciser"} · Aperçu
                  d’arrivée au début de validité : {schedulePreview(schedule)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {schedule.weekdays
                    .map((day) => weekdayLabels[day - 1] ?? "")
                    .filter(Boolean)
                    .join(", ")}{" "}
                  · {formatDuration(schedule.duration_minutes)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(schedule.id);
                    setFormOpen(true);
                    setDraft({
                      route_id: schedule.route_id,
                      company_id: schedule.company_id,
                      default_vessel_id: schedule.default_vessel_id ?? "",
                      departure_time: schedule.departure_time.slice(0, 5),
                      arrival_time: addMinutesToTime(
                        schedule.departure_time.slice(0, 5),
                        schedule.duration_minutes,
                      ),
                      duration_minutes: schedule.duration_minutes,
                      weekdays: schedule.weekdays,
                      valid_from: schedule.valid_from,
                      valid_to: schedule.valid_to ?? "",
                      source_name: schedule.source_name ?? "",
                      source_url: schedule.source_url ?? "",
                    });
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generate.isPending}
                  onClick={() => {
                    if (
                      confirmAction(
                        "Ajouter les départs manquants sur 60 jours, à partir du début de validité ou d’aujourd’hui ? Les départs existants, corrections et annulations sont conservés.",
                      )
                    )
                      generate.mutate(schedule.id);
                  }}
                >
                  Ajouter les départs manquants
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirmAction("Supprimer définitivement ce calendrier ?"))
                      remove.mutate(schedule.id);
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/** Suivi en direct : identifiant MMSI de chaque navire et état de la dernière position reçue. */
function VesselsAdmin({
  vesselIds,
  itemId,
}: { vesselIds?: string[]; itemId?: string | undefined } = {}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(itemId ?? null);
  useEffect(() => {
    if (itemId) setOpenId(itemId);
  }, [itemId]);
  const { data: allVessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: positions = [] } = useQuery({
    queryKey: ["admin", "vessel_positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vessel_positions").select("*");
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 60_000,
  });
  const [vesselSearch, setVesselSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const scopedVessels = allVessels.filter((v) => !vesselIds || vesselIds.includes(v.id));
  const normalizedVesselSearch = vesselSearch.trim().toLocaleLowerCase("fr");
  const vessels = scopedVessels.filter((vessel) => {
    const companyName =
      companies.find((item) => item.id === vessel.company_id)?.name ?? "Sans compagnie";
    const matchesCompany =
      companyFilter === "all" ||
      (companyFilter === "none" ? !vessel.company_id : vessel.company_id === companyFilter);
    const haystack =
      `${vessel.name} ${companyName} ${vessel.mmsi ?? ""} ${vessel.imo ?? ""}`.toLocaleLowerCase(
        "fr",
      );
    return matchesCompany && (!normalizedVesselSearch || haystack.includes(normalizedVesselSearch));
  });
  const groupedVessels = new Map<string, typeof vessels>();
  for (const vessel of vessels) {
    const key = vessel.company_id ?? "none";
    groupedVessels.set(key, [...(groupedVessels.get(key) ?? []), vessel]);
  }
  const orderedGroups = [...groupedVessels.entries()].sort((a, b) => {
    const nameA =
      a[0] === "none" ? "Sans compagnie" : (companies.find((item) => item.id === a[0])?.name ?? "");
    const nameB =
      b[0] === "none" ? "Sans compagnie" : (companies.find((item) => item.id === b[0])?.name ?? "");
    return nameA.localeCompare(nameB, "fr");
  });
  const positionByMmsi = new Map(positions.map((position) => [position.mmsi, position]));
  const openVessel = allVessels.find((vessel) => vessel.id === openId);

  return (
    <Panel>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Aide : MMSI, IMO et photo
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>MMSI</strong> (9 chiffres) : active le suivi en direct. Le site suit un navire de
          6 h avant son départ jusqu'à son arrivée et ne redemande sa position qu'au bout de 20
          minutes. <strong>IMO</strong> (7 chiffres) : ajoute le lien « Voir sur VesselFinder » dans
          la fiche. <strong>Photo</strong> : collez une URL ou téléversez un fichier image (JPG,
          PNG, WebP ou AVIF, 10 Mo max). Le téléversement remplace l’URL ; sans photo personnalisée,
          le site cherche une photo libre sur Wikimedia Commons.
        </p>
      </details>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Input
          value={vesselSearch}
          onChange={(event) => setVesselSearch(event.target.value)}
          placeholder="Rechercher un navire, MMSI, IMO ou compagnie…"
          aria-label="Rechercher dans la flotte"
        />
        <select
          value={companyFilter}
          onChange={(event) => setCompanyFilter(event.target.value)}
          aria-label="Filtrer par compagnie"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Toutes les compagnies</option>
          <option value="none">Sans compagnie</option>
          {companies
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "fr"))
            .map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
        </select>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {vessels.length} navire{vessels.length > 1 ? "s" : ""} affiché
        {vessels.length > 1 ? "s" : ""} sur {scopedVessels.length} · {orderedGroups.length} groupe
        {orderedGroups.length > 1 ? "s" : ""}
      </p>
      <div className="mt-3 space-y-5">
        {orderedGroups.map(([companyId, groupVessels]) => (
          <section key={companyId} className="overflow-hidden rounded-xl border border-border">
            <h3 className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2 text-sm font-semibold">
              <span>
                {companyId === "none"
                  ? "Sans compagnie"
                  : (companies.find((item) => item.id === companyId)?.name ?? "Compagnie inconnue")}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {groupVessels.length}
              </span>
            </h3>
            <ul className="bw-admin-list px-2 py-1">
              {groupVessels.map((vessel) => {
                const position = vessel.mmsi ? positionByMmsi.get(vessel.mmsi) : undefined;
                return (
                  <li key={vessel.id}>
                    <button
                      type="button"
                      className="bw-admin-list__main"
                      onClick={() => setOpenId(vessel.id)}
                    >
                      {vessel.photo_url ? (
                        <img
                          src={vessel.photo_url}
                          alt=""
                          width={56}
                          height={40}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-10 w-14 shrink-0 rounded-md border object-cover"
                        />
                      ) : (
                        <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                          sans photo
                        </span>
                      )}
                      <span className="min-w-0">
                        <strong>{vessel.name}</strong>
                        <small>
                          {vessel.mmsi
                            ? `MMSI ${vessel.mmsi}`
                            : "Pas de MMSI : suivi en direct inactif"}
                          {position?.reported_at
                            ? ` · position du ${new Date(position.reported_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </small>
                      </span>
                      {position?.last_error ? (
                        <span className="bw-admin-chip" data-tone="warn">
                          Erreur de suivi
                        </span>
                      ) : null}
                      {!vessel.mmsi ? <span className="bw-admin-chip">Sans MMSI</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {vessels.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {scopedVessels.length
              ? "Aucun navire ne correspond à cette recherche."
              : "Aucun navire enregistré."}
          </p>
        ) : null}
      </div>
      {openVessel ? (
        <AdminDrawer
          open
          onOpenChange={(next) => !next && setOpenId(null)}
          title={openVessel.name}
          description="Suivi en direct (MMSI), lien VesselFinder (IMO), photo et caractéristiques."
        >
          <VesselEditor vessel={openVessel} />
        </AdminDrawer>
      ) : null}
    </Panel>
  );
}


/** Fiche complète d'un navire (dans le panneau latéral) : suivi en direct, photo, caractéristiques. */
export function VesselEditor({ vessel }: { vessel: Vessel }) {
  const queryClient = useQueryClient();
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: positions = [] } = useQuery({
    queryKey: ["admin", "vessel_positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vessel_positions").select("*");
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 60_000,
  });
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: nextDeps = [] } = useQuery({
    queryKey: ["admin", "vessel_next_departures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departures")
        .select("vessel_id, route_id, departure_at")
        .not("vessel_id", "is", null)
        .neq("status", "cancelled")
        .gte("departure_at", new Date(Date.now() - 36 * 3600_000).toISOString())
        .order("departure_at")
        .limit(1000);
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const portLabel = (id: string) => ports.find((p) => p.id === id)?.name ?? "—";
  // Brouillons de saisie, par navire : { mmsi, imo, photo }.
  const [drafts, setDrafts] = useState<
    Record<string, { mmsi?: string; imo?: string; photo?: string; photoFile?: File | null }>
  >({});
  const setDraft = (
    id: string,
    patch: { mmsi?: string; imo?: string; photo?: string; photoFile?: File | null },
  ) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const save = useMutation({
    mutationFn: async ({
      id,
      mmsi,
      imo,
      photo_url,
      photoFile,
    }: {
      id: string;
      mmsi: number | null;
      imo: number | null;
      photo_url: string | null;
      photoFile: File | null;
    }) => {
      let finalPhotoUrl = photo_url;
      if (photoFile) {
        const extension = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = id + "/" + Date.now() + "." + extension.replace(/[^a-z0-9]/g, "");
        const { error: uploadError } = await supabase.storage
          .from("vessel-photos")
          .upload(path, photoFile, { contentType: photoFile.type });
        if (uploadError)
          throw new Error("Téléversement de la photo impossible : " + uploadError.message);
        const { data: publicUrl } = supabase.storage.from("vessel-photos").getPublicUrl(path);
        finalPhotoUrl = publicUrl.publicUrl;
      }
      const { error } = await supabase
        .from("vessels")
        .update({ mmsi, imo, photo_url: finalPhotoUrl })
        .eq("id", id);
      if (error)
        throw new Error(
          error.message.includes("unique")
            ? "Ce MMSI est déjà utilisé par un autre navire."
            : "Enregistrement impossible. Vérifiez le MMSI (9 chiffres) et l'IMO (7 chiffres).",
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vessels"] });
      queryClient.invalidateQueries({ queryKey: ["vessel-photo"] });
      toast.success("Navire enregistré.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const positionByMmsi = new Map(positions.map((position) => [position.mmsi, position]));
  const draft = drafts[vessel.id] ?? {};
  const mmsi = draft.mmsi ?? (vessel.mmsi ? String(vessel.mmsi) : "");
  const imo = draft.imo ?? (vessel.imo ? String(vessel.imo) : "");
  const photo = draft.photo ?? vessel.photo_url ?? "";
  const photoFile = draft.photoFile ?? null;
  const mmsiOk = mmsi === "" || /^\d{9}$/.test(mmsi);
  const imoOk = imo === "" || /^\d{7}$/.test(imo);
  const photoOk = photo === "" || /^https:\/\//i.test(photo);
  const changed =
    photoFile !== null ||
    mmsi !== (vessel.mmsi ? String(vessel.mmsi) : "") ||
    imo !== (vessel.imo ? String(vessel.imo) : "") ||
    photo !== (vessel.photo_url ?? "");
  const position = vessel.mmsi ? positionByMmsi.get(vessel.mmsi) : undefined;
  const company = companies.find((item) => item.id === vessel.company_id);
  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {photo && photoOk ? (
            <img
              src={photo}
              alt={vessel.name}
              width={80}
              height={56}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-14 w-20 rounded-lg border object-cover"
            />
          ) : null}
          <p className="text-sm font-medium">{vessel.name}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {company?.name ?? "Sans compagnie"}
          {position?.reported_at
            ? ` · dernière position le ${new Date(position.reported_at).toLocaleString("fr-FR")}`
            : vessel.mmsi
              ? " · pas encore de position"
              : ""}
          {position?.last_error ? ` · erreur : ${position.last_error}` : ""}
        </p>
        {(() => {
          const dep = nextDeps.find((d) => d.vessel_id === vessel.id);
          const route = dep ? routes.find((r) => r.id === dep.route_id) : undefined;
          const declared = position as
            { destination?: string | null; eta?: string | null } | undefined;
          const link = vessel.imo
            ? `https://www.vesselfinder.com/?imo=${vessel.imo}`
            : vessel.mmsi
              ? `https://www.vesselfinder.com/?mmsi=${vessel.mmsi}`
              : null;
          return (
            <div className="mt-1 grid gap-0.5 text-xs">
              <p>
                <span className="text-muted-foreground">Prévu BledWay : </span>
                {route && dep
                  ? `${portLabel(route.departure_port_id)} → ${portLabel(route.arrival_port_id)} · ${new Date(dep.departure_at).toLocaleString("fr-FR")}`
                  : "aucun départ à venir"}
              </p>
              <p>
                <span className="text-muted-foreground">Déclaré par le navire : </span>
                {declared?.destination
                  ? `« ${declared.destination} »${declared.eta ? ` · arrivée estimée ${declared.eta}` : ""}`
                  : "pas encore reçu"}
              </p>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline underline-offset-2"
                >
                  Suivre sur VesselFinder ↗
                </a>
              ) : null}
            </div>
          );
        })()}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="grid gap-1 text-xs font-medium">
          MMSI
          <Input
            inputMode="numeric"
            maxLength={9}
            placeholder="MMSI"
            aria-label={`MMSI de ${vessel.name}`}
            aria-invalid={!mmsiOk}
            value={mmsi}
            onChange={(event) =>
              setDraft(vessel.id, { mmsi: event.target.value.replace(/\D/g, "") })
            }
            className="w-32"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          IMO
          <Input
            inputMode="numeric"
            maxLength={7}
            placeholder="IMO"
            aria-label={`IMO de ${vessel.name}`}
            aria-invalid={!imoOk}
            value={imo}
            onChange={(event) =>
              setDraft(vessel.id, { imo: event.target.value.replace(/\D/g, "") })
            }
            className="w-28"
          />
        </label>
        <div className="grid min-w-56 flex-1 gap-1">
          <Input
            type="url"
            placeholder="URL de la photo (https://…)"
            aria-label={"URL de la photo de " + vessel.name}
            aria-invalid={!photoOk}
            value={photo}
            onChange={(event) =>
              setDraft(vessel.id, { photo: event.target.value.trim(), photoFile: null })
            }
            className="w-full"
            disabled={Boolean(photoFile)}
          />
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>Ou téléverser une image {photoFile ? "— " + photoFile.name : ""}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              aria-label={"Téléverser une photo de " + vessel.name}
              className="block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 10 * 1024 * 1024) {
                  toast.error("La photo doit faire 10 Mo maximum.");
                  event.target.value = "";
                  return;
                }
                if (
                  file &&
                  !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
                ) {
                  toast.error("Format accepté : JPG, PNG, WebP ou AVIF.");
                  event.target.value = "";
                  return;
                }
                setDraft(vessel.id, { photoFile: file, ...(file ? { photo: "" } : {}) });
              }}
            />
          </label>
          {photoFile ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft(vessel.id, { photoFile: null, photo: vessel.photo_url ?? "" })
              }
            >
              Annuler le téléversement
            </Button>
          ) : null}
        </div>
        <Button
          size="sm"
          disabled={!mmsiOk || !imoOk || (!photoFile && !photoOk) || !changed || save.isPending}
          onClick={() =>
            save.mutate({
              id: vessel.id,
              mmsi: mmsi === "" ? null : Number(mmsi),
              imo: imo === "" ? null : Number(imo),
              photo_url: photo === "" ? null : photo,
              photoFile,
            })
          }
        >
          Enregistrer
        </Button>
      </div>
      <VesselSpecsEditor vessel={vessel as unknown as VesselSpecsRow} />
      <VesselDeleteButton id={vessel.id} name={vessel.name} />
    </div>
  );
}
/** Suppression d'un navire : on détache d'abord tout ce qui le référence, puis on l'efface. */
function VesselDeleteButton({ id, name }: { id: string; name: string }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => {
      const count = async (
        table: "departures" | "schedules" | "schedule_exceptions",
        col: string,
      ) => {
        const { count, error } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq(col as never, id as never);
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const [deps, scheds, excs] = await Promise.all([
        count("departures", "vessel_id"),
        count("schedules", "default_vessel_id"),
        count("schedule_exceptions", "new_vessel_id"),
      ]);
      const linked = deps + scheds + excs;
      const message = linked
        ? `« ${name} » est encore rattaché à ${deps} traversée(s), ${scheds} programme(s) et ${excs} exception(s).\n\nCes éléments seront conservés mais passeront en « Navire à affecter ». Supprimer définitivement le navire ?`
        : `Supprimer définitivement « ${name} » ? Aucun élément ne lui est rattaché.`;
      if (!window.confirm(message)) return false;
      if (deps) {
        const { error } = await supabase
          .from("departures")
          .update({ vessel_id: null })
          .eq("vessel_id", id);
        if (error) throw new Error("Détachement des traversées impossible : " + error.message);
      }
      if (scheds) {
        const { error } = await supabase
          .from("schedules")
          .update({ default_vessel_id: null })
          .eq("default_vessel_id", id);
        if (error) throw new Error("Détachement des programmes impossible : " + error.message);
      }
      if (excs) {
        const { error } = await supabase
          .from("schedule_exceptions")
          .update({ new_vessel_id: null })
          .eq("new_vessel_id", id);
        if (error) throw new Error("Détachement des exceptions impossible : " + error.message);
      }
      const { data, error } = await supabase.from("vessels").delete().eq("id", id).select("id");
      if (error) throw new Error("Suppression impossible : " + error.message);
      if (!data?.length) throw new Error("Suppression refusée par la base (droits insuffisants).");
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      queryClient.invalidateQueries();
      toast.success(`« ${name} » a été supprimé.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="flex justify-end">
      <Button
        size="sm"
        variant="destructive"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        {remove.isPending ? "Suppression…" : "Supprimer le navire"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId();
  const control =
    isValidElement(children) && (children.type === NativeSelect || children.type === Input)
      ? cloneElement(children as React.ReactElement<{ "aria-labelledby"?: string }>, {
          "aria-labelledby": labelId,
        })
      : children;
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span id={labelId}>{label}</span>
      {control}
    </label>
  );
}

function NativeSelect({
  "aria-labelledby": labelledBy,
  value,
  onChange,
  options,
}: {
  "aria-labelledby"?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      aria-labelledby={labelledBy}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
    >
      <option value="">— Choisir —</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function DataAdmin() {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());

  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [suspendRoutes, setSuspendRoutes] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [fileReady, setFileReady] = useState(false);

  const activeSchedules = schedules.filter((item) => item.status === "active");
  const activeRoutes = routes.filter((item) => item.status === "active");
  const affectedDepartures = departures.filter(
    (item) => item.departure_at >= `${fromDate}T00:00:00`,
  );
  // Après un import, un port n'apporte rien à la carte s'il n'a aucune ligne active
  // OU si aucune de ses lignes ne reçoit de départ dans la nouvelle saison.
  const idlePorts = ports
    .filter((port) => port.status === "active")
    .map((port) => {
      const portRoutes = activeRoutes.filter(
        (route) => route.departure_port_id === port.id || route.arrival_port_id === port.id,
      );
      const routeIds = new Set(portRoutes.map((route) => route.id));
      const hasDeparture = departures.some(
        (departure) => routeIds.has(departure.route_id) && departure.status !== "cancelled",
      );
      const hasSchedule = activeSchedules.some((schedule) => routeIds.has(schedule.route_id));
      return {
        port,
        reason:
          portRoutes.length === 0
            ? "aucune ligne active"
            : !hasDeparture && !hasSchedule
              ? "aucun départ ni calendrier dans la nouvelle saison"
              : null,
      };
    })
    .filter(
      (item): item is { port: (typeof ports)[number]; reason: string } => item.reason !== null,
    );

  const closePort = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ports").update({ status: "inactive" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ports"] });
      toast.success("Port fermé temporairement.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const newSeason = useMutation({
    mutationFn: async () => {
      const startIso = new Date(`${fromDate}T00:00:00Z`).toISOString();
      if (Number.isNaN(new Date(startIso).getTime())) throw new Error("Date de début invalide.");

      const removed = await supabase
        .from("departures")
        .delete()
        .gte("departure_at", startIso)
        .select("id");
      if (removed.error) throw new Error(removed.error.message);

      if (activeSchedules.length > 0) {
        const suspended = await supabase
          .from("schedules")
          .update({ status: "inactive" })
          .eq("status", "active");
        if (suspended.error) throw new Error(suspended.error.message);
      }

      if (suspendRoutes && activeRoutes.length > 0) {
        const suspendedRoutes = await supabase
          .from("routes")
          .update({ status: "inactive" })
          .eq("status", "active");
        if (suspendedRoutes.error) throw new Error(suspendedRoutes.error.message);
      }

      return removed.data?.length ?? 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      setConfirming(false);
      toast.success(
        `Saison vidée : ${count} départ(s) supprimé(s), calendriers suspendus. Vous pouvez importer la nouvelle saison.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Contrôle qualité : incohérences de durée à vérifier avant publication.
  const portLabel = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const durationIssues = [
    ...activeRoutes.flatMap((route) => {
      const reverse = activeRoutes.find(
        (item) =>
          item.departure_port_id === route.arrival_port_id &&
          item.arrival_port_id === route.departure_port_id,
      );
      const a = route.typical_duration_minutes;
      const b = reverse?.typical_duration_minutes;
      if (!reverse || !a || !b || route.id > reverse.id) return [];
      const gap = Math.abs(a - b) / Math.max(a, b);
      return gap > 0.3
        ? [
            `${portLabel(route.departure_port_id)} ⇄ ${portLabel(route.arrival_port_id)} : ${Math.round(a / 60)} h dans un sens, ${Math.round(b / 60)} h dans l'autre.`,
          ]
        : [];
    }),
    ...activeRoutes.flatMap((route) => {
      const typical = route.typical_duration_minutes;
      if (!typical) return [];
      const odd = departures.filter(
        (departure) =>
          departure.route_id === route.id &&
          departure.duration_minutes &&
          Math.abs(departure.duration_minutes - typical) / typical > 0.3,
      );
      return odd.length
        ? [
            `${portLabel(route.departure_port_id)} → ${portLabel(route.arrival_port_id)} : durée typique ${Math.round(typical / 60)} h, mais ${odd.length} départ(s) avec une durée très différente.`,
          ]
        : [];
    }),
  ];

  return (
    <>
      <Panel>
        <h2 className="text-sm font-semibold">Contrôle qualité des durées</h2>
        {durationIssues.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Aucune incohérence de durée détectée.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Ces écarts de plus de 30 % sont visibles par le public et nuisent à la confiance.
              Vérifiez la durée de la ligne (onglet « Lignes ») ou les heures du fichier importé.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs">
              {durationIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Counter label="Ports" value={ports.length} />
          <Counter label="Lignes" value={routes.length} />
          <Counter label="Compagnies" value={companies.length} />
          <Counter label="Navires" value={vessels.length} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Les fiches signalées « à confirmer » servent d'exemples et doivent être remplacées par des
          informations vérifiées avant publication.
        </p>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Préparer une nouvelle saison</h2>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            <strong>1.</strong> Ayez sous la main le fichier Excel de la nouvelle saison (onglet «
            Import Excel » pour le modèle).
          </li>
          <li>
            <strong>2.</strong> Videz la saison en cours ci-dessous : les départs à partir de la
            date choisie sont <strong>supprimés définitivement</strong> et les calendriers
            récurrents suspendus. Ports, lignes, compagnies, navires et avis sont conservés.
          </li>
          <li>
            <strong>3.</strong> Importez le fichier : les lignes qui reçoivent des départs
            redeviennent automatiquement visibles sur la carte.
          </li>
          <li>
            <strong>4.</strong> Revenez ici pour fermer les ports qui ne desservent plus aucune
            ligne.
          </li>
        </ol>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Début de la nouvelle saison">
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setConfirming(false);
              }}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={suspendRoutes}
              onChange={(event) => setSuspendRoutes(event.target.checked)}
            />
            Suspendre aussi les lignes (réactivées à l'import)
          </label>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>{affectedDepartures.length} départ(s) à venir seront supprimés.</li>
          <li>{activeSchedules.length} calendrier(s) actif(s) seront suspendus.</li>
          {suspendRoutes ? (
            <li>{activeRoutes.length} ligne(s) active(s) seront suspendues.</li>
          ) : null}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={fileReady}
            onChange={(event) => {
              setFileReady(event.target.checked);
              setConfirming(false);
            }}
          />
          Je confirme que le fichier de la nouvelle saison est prêt à être importé.
        </label>
        {confirming ? (
          <div className="mt-3 rounded-lg border border-destructive/60 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              Les départs concernés seront supprimés définitivement (ils ne sont pas archivés).
              Conservez le fichier Excel de la saison en cours. Confirmer ?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={newSeason.isPending}
                onClick={() => newSeason.mutate()}
              >
                Oui, supprimer les départs et repartir de zéro
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!fileReady}
              onClick={() => setConfirming(true)}
            >
              Vider la saison en cours
            </Button>
            {!fileReady ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Cochez la case ci-dessus pour éviter de vider la carte sans données de remplacement.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Ports sans traversée</h2>
        {idlePorts.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Tous les ports ouverts desservent au moins une ligne avec des départs.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Ces ports restent visibles sur la carte alors qu'ils n'ont plus de traversée
              programmée. Vous pouvez les fermer temporairement, le temps de recevoir leurs
              horaires.
            </p>
            <ul className="mt-3 space-y-2">
              {idlePorts.map(({ port, reason }) => (
                <li key={port.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {port.name}
                    {port.country_name ? ` · ${port.country_name}` : ""}
                    <span className="text-muted-foreground"> — {reason}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={closePort.isPending}
                    onClick={() => {
                      if (
                        confirmAction(
                          `Fermer temporairement le port de ${port.name} ? Il apparaîtra « fermé » sur la carte.`,
                        )
                      )
                        closePort.mutate(port.id);
                    }}
                  >
                    Fermer temporairement
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

// Pays desservis (façade méditerranéenne européenne + Maghreb).
const countryOptions = [
  { value: "DZ", label: "Algérie" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Espagne" },
  { value: "IT", label: "Italie" },
  { value: "PT", label: "Portugal" },
  { value: "MT", label: "Malte" },
  { value: "GR", label: "Grèce" },
  { value: "TN", label: "Tunisie" },
  { value: "MA", label: "Maroc" },
  { value: "TR", label: "Turquie" },
];

const portStatusOptions = [
  { value: "active", label: "Ouvert (visible)" },
  { value: "inactive", label: "Temporairement fermé" },
  { value: "draft", label: "Brouillon (non publié)" },
];

const portStatusLabel: Record<string, string> = {
  active: "Ouvert",
  inactive: "Temporairement fermé",
  draft: "Brouillon",
};

const labelAnchorOptions = [
  { value: "left", label: "À gauche du point" },
  { value: "right", label: "À droite du point" },
  { value: "top", label: "Au-dessus du point" },
  { value: "bottom", label: "Sous le point" },
];

const emptyPortDraft = {
  name: "",
  city: "",
  country_code: "IT",
  latitude: "",
  longitude: "",
  label_anchor: "left",
  label_offset_x: "-14",
  label_offset_y: "0",
  notes: "",
  info_source: "",
  info_source_url: "",
  photo_url: "",
  status: "active",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function PortsAdmin({ itemId }: { itemId?: string | undefined } = {}) {
  const queryClient = useQueryClient();
  const warnTravellers = useWarnTravellers();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const [draft, setDraft] = useState(emptyPortDraft);
  const [facilities, setFacilities] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [pendingClose, setPendingClose] = useState<Port | null>(null);
  const [pendingReopen, setPendingReopen] = useState<Port | null>(null);

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const activeRoutesOf = (portId: string) =>
    routes.filter(
      (route) =>
        route.status === "active" &&
        (route.departure_port_id === portId || route.arrival_port_id === portId),
    );
  const suspendedRoutesOf = (portId: string) =>
    routes.filter(
      (route) =>
        route.status === "inactive" &&
        (route.departure_port_id === portId || route.arrival_port_id === portId),
    );
  const schedulesOf = (routeIds: string[], status: string) =>
    schedules.filter((item) => routeIds.includes(item.route_id) && item.status === status);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ports"] });

  const set = (key: keyof typeof emptyPortDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setDraft(emptyPortDraft);
    setFacilities({});
    setEditingId(null);
    setFormOpen(false);
  };
  const startNew = () => {
    setDraft(emptyPortDraft);
    setFacilities({});
    setEditingId(null);
    setPresetName("");
    setFormOpen(true);
  };
  const startEdit = (port: Port) => {
    setEditingId(port.id);
    setFacilities((port.facilities ?? {}) as Record<string, string>);
    setDraft({
      name: port.name,
      city: port.city ?? "",
      country_code: port.country_code,
      latitude: String(port.latitude),
      longitude: String(port.longitude),
      label_anchor: port.label_anchor,
      label_offset_x: String(port.label_offset_x),
      label_offset_y: String(port.label_offset_y),
      notes: port.notes ?? "",
      info_source: port.info_source ?? "",
      info_source_url: port.info_source_url ?? "",
      photo_url: port.photo_url ?? "",
      status: port.status,
    });
    setFormOpen(true);
  };
  // Fiche demandée depuis la recherche du menu.
  useEffect(() => {
    const port = itemId ? ports.find((item) => item.id === itemId) : undefined;
    if (port) startEdit(port);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, ports.length]);

  const save = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      const latitude = Number(draft.latitude);
      const longitude = Number(draft.longitude);
      if (!name) throw new Error("Indiquez le nom du port.");
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
        throw new Error("Latitude invalide (entre -90 et 90).");
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
        throw new Error("Longitude invalide (entre -180 et 180).");
      const country = countryOptions.find((item) => item.value === draft.country_code);
      if (!country) throw new Error("Choisissez un pays.");
      const values = {
        slug: slugify(name),
        name,
        city: draft.city.trim() || null,
        country_code: country.value,
        country_name: country.label,
        latitude,
        longitude,
        label_anchor: draft.label_anchor as "left" | "right" | "top" | "bottom",
        label_offset_x: Number(draft.label_offset_x) || 0,
        label_offset_y: Number(draft.label_offset_y) || 0,
        status: draft.status as "active" | "inactive" | "draft",
        notes: draft.notes.trim() || null,
        photo_url: draft.photo_url.trim() || null,
        // Services du port : seules les lignes renseignées sont conservées.
        facilities: Object.fromEntries(
          Object.entries(facilities)
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => value !== ""),
        ),
        info_source: draft.info_source.trim() || null,
        info_source_url: draft.info_source_url.trim() || null,
        info_verified_at: draft.info_source.trim() ? new Date().toISOString() : null,
      };
      const { error } = editingId
        ? await supabase.from("ports").update(values).eq("id", editingId)
        : await supabase.from("ports").insert({ ...values, is_demo: false });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? "Port mis à jour." : "Port ajouté.");
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("ports")
        .update({ status: status as "active" | "inactive" | "draft" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Statut du port mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Fermeture temporaire : le port reste visible en gris, mais ses lignes et
  // calendriers sont suspendus et disparaissent de la carte.
  const closePort = useMutation({
    mutationFn: async (port: Port) => {
      const routeIds = activeRoutesOf(port.id).map((route) => route.id);
      const { error } = await supabase
        .from("ports")
        .update({ status: "inactive" })
        .eq("id", port.id);
      if (error) throw new Error(error.message);
      if (routeIds.length > 0) {
        const routeUpdate = await supabase
          .from("routes")
          .update({ status: "inactive" })
          .in("id", routeIds);
        if (routeUpdate.error) throw new Error(routeUpdate.error.message);
        const scheduleUpdate = await supabase
          .from("schedules")
          .update({ status: "inactive" })
          .in("route_id", routeIds)
          .eq("status", "active");
        if (scheduleUpdate.error) throw new Error(scheduleUpdate.error.message);
      }
      return routeIds.length;
    },
    onSuccess: (count, port) => {
      invalidateAll();
      setPendingClose(null);
      warnTravellers(
        count > 0
          ? `Port fermé temporairement. ${count} ligne(s) suspendue(s).`
          : "Port fermé temporairement.",
        { audience: { kind: "port", portId: port.id }, template: "port_closed" },
        "Les voyageurs des traversées de ce port ne sont pas encore prévenus.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reopenPort = useMutation({
    mutationFn: async ({ port, restore }: { port: Port; restore: boolean }) => {
      const { error } = await supabase.from("ports").update({ status: "active" }).eq("id", port.id);
      if (error) throw new Error(error.message);
      if (!restore) return 0;
      const restorable = suspendedRoutesOf(port.id).filter((route) => {
        const other =
          route.departure_port_id === port.id ? route.arrival_port_id : route.departure_port_id;
        const otherPort = ports.find((item) => item.id === other);
        return otherPort?.status === "active" || other === port.id;
      });
      const routeIds = restorable.map((route) => route.id);
      if (routeIds.length > 0) {
        const routeUpdate = await supabase
          .from("routes")
          .update({ status: "active" })
          .in("id", routeIds);
        if (routeUpdate.error) throw new Error(routeUpdate.error.message);
        const scheduleUpdate = await supabase
          .from("schedules")
          .update({ status: "active" })
          .in("route_id", routeIds)
          .eq("status", "inactive");
        if (scheduleUpdate.error) throw new Error(scheduleUpdate.error.message);
      }
      return routeIds.length;
    },
    onSuccess: (count) => {
      invalidateAll();
      setPendingReopen(null);
      toast.success(
        count > 0 ? `Port réouvert et ${count} ligne(s) réactivée(s).` : "Port réouvert.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["ports"] });
    queryClient.invalidateQueries({ queryKey: ["routes"] });
    queryClient.invalidateQueries({ queryKey: ["schedules"] });
  }

  const applyPreset = (name: string) => {
    setPresetName(name);
    const preset = portPresets.find((item) => item.name === name);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      name: preset.name,
      city: preset.city,
      country_code: preset.country_code,
      latitude: String(preset.latitude),
      longitude: String(preset.longitude),
    }));
  };

  return (
    <>
      {pendingClose ? (
        <Panel>
          <h2 className="text-sm font-semibold text-destructive">
            Fermer temporairement {pendingClose.name} ?
          </h2>
          {activeRoutesOf(pendingClose.id).length > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Ce port est utilisé par {activeRoutesOf(pendingClose.id).length} ligne(s) active(s)
                et{" "}
                {
                  schedulesOf(
                    activeRoutesOf(pendingClose.id).map((r) => r.id),
                    "active",
                  ).length
                }{" "}
                calendrier(s) actif(s). Après validation, ces lignes ne s'afficheront plus sur la
                carte et leurs calendriers seront suspendus.
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {activeRoutesOf(pendingClose.id).map((route) => (
                  <li key={route.id}>
                    {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune ligne active ne dépend de ce port.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={closePort.isPending}
              onClick={() => closePort.mutate(pendingClose)}
            >
              Confirmer la fermeture
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingClose(null)}>
              Annuler
            </Button>
          </div>
        </Panel>
      ) : null}

      {pendingReopen ? (
        <Panel>
          <h2 className="text-sm font-semibold">Réouvrir {pendingReopen.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {suspendedRoutesOf(pendingReopen.id).length > 0
              ? `${suspendedRoutesOf(pendingReopen.id).length} ligne(s) suspendue(s) peuvent être réactivées avec leurs calendriers.`
              : "Aucune ligne suspendue n'est associée à ce port."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={reopenPort.isPending}
              onClick={() => reopenPort.mutate({ port: pendingReopen, restore: true })}
            >
              Réouvrir et réactiver les lignes précédentes
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reopenPort.isPending}
              onClick={() => reopenPort.mutate({ port: pendingReopen, restore: false })}
            >
              Réouvrir seulement
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingReopen(null)}>
              Annuler
            </Button>
          </div>
        </Panel>
      ) : null}

      <AdminDrawer
        open={formOpen}
        onOpenChange={(next) => !next && reset()}
        title={editingId ? `Modifier ${draft.name || "le port"}` : "Nouveau port"}
        description="Position sur la carte, informations pratiques et services."
      >
        <div className="mt-3">
          <Field label="Pré-sélection d'un grand port (Algérie et Europe)">
            <NativeSelect
              value={presetName}
              onChange={applyPreset}
              options={portPresets.map((preset) => ({
                value: preset.name,
                label: `${preset.name} — ${
                  countryOptions.find((c) => c.value === preset.country_code)?.label ??
                  preset.country_code
                }`,
              }))}
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nom du port">
            <Input
              value={draft.name}
              placeholder="Gênes"
              onChange={(event) => set("name")(event.target.value)}
            />
          </Field>
          <Field label="Ville (facultatif)">
            <Input
              value={draft.city}
              placeholder="Gênes"
              onChange={(event) => set("city")(event.target.value)}
            />
          </Field>
          <Field label="Pays">
            <NativeSelect
              value={draft.country_code}
              onChange={set("country_code")}
              options={countryOptions}
            />
          </Field>
          <Field label="Statut">
            <NativeSelect
              value={draft.status}
              onChange={set("status")}
              options={portStatusOptions}
            />
          </Field>
          <Field label="Latitude (GPS réelle)">
            <Input
              value={draft.latitude}
              placeholder="44.4106"
              onChange={(event) => set("latitude")(event.target.value)}
            />
          </Field>
          <Field label="Longitude (GPS réelle)">
            <Input
              value={draft.longitude}
              placeholder="8.9264"
              onChange={(event) => set("longitude")(event.target.value)}
            />
          </Field>
          <Field label="Position du nom sur la carte">
            <NativeSelect
              value={draft.label_anchor}
              onChange={set("label_anchor")}
              options={labelAnchorOptions}
            />
          </Field>
          <Field label="Décalage du nom (X / Y en pixels)">
            <div className="flex gap-2">
              <Input
                value={draft.label_offset_x}
                onChange={(event) => set("label_offset_x")(event.target.value)}
              />
              <Input
                value={draft.label_offset_y}
                onChange={(event) => set("label_offset_y")(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Source de l'information">
            <Input
              value={draft.info_source}
              placeholder="Autorité portuaire"
              onChange={(event) => set("info_source")(event.target.value)}
            />
          </Field>
          <Field label="Lien de la source">
            <Input
              value={draft.info_source_url}
              placeholder="https://…"
              onChange={(event) => set("info_source_url")(event.target.value)}
            />
          </Field>
          <Field label="Photo du port (lien https ou fichier, facultatif)">
            <Input
              value={draft.photo_url}
              placeholder="https://… (sinon photo libre Wikimedia Commons)"
              onChange={(event) => set("photo_url")(event.target.value)}
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              aria-label="Téléverser une photo du port"
              className="mt-2 block w-full text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
                const path = `ports/${Date.now()}.${extension.replace(/[^a-z0-9]/g, "")}`;
                void supabase.storage
                  .from("vessel-photos")
                  .upload(path, file, { contentType: file.type })
                  .then(({ error }) => {
                    if (error) {
                      toast.error("Téléversement de la photo impossible : " + error.message);
                      return;
                    }
                    set("photo_url")(
                      supabase.storage.from("vessel-photos").getPublicUrl(path).data.publicUrl,
                    );
                    toast.success("Photo prête : enregistrez la fiche du port.");
                  });
              }}
            />
            {draft.photo_url ? (
              <img
                src={draft.photo_url}
                alt="Aperçu de la photo du port"
                className="mt-2 h-24 rounded-lg object-cover"
              />
            ) : null}
          </Field>
        </div>
        <div className="mt-3">
          <Field label="À savoir (embarquement, accès, fermeture…)">
            <Input value={draft.notes} onChange={(event) => set("notes")(event.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Services du port (laissez vide pour ne pas afficher)
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {Object.entries(facilityLabels).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  value={facilities[key] ?? ""}
                  placeholder="Ex. : disponible, à l'étage, payant…"
                  onChange={(event) =>
                    setFacilities((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                />
              </Field>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {editingId ? "Enregistrer les modifications" : "Ajouter le port"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Annuler
          </Button>
        </div>
      </AdminDrawer>

      <Panel>
        <AdminListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Chercher un port"
          count={
            ports.filter((port) => matches(search, port.name, port.country_name, port.city)).length
          }
          total={ports.length}
          onCreate={startNew}
          createLabel="Nouveau port"
        />
        <ul className="divide-y divide-border">
          {ports
            .filter((port) => matches(search, port.name, port.country_name, port.city))
            .map((port) => (
              <li key={port.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {port.name}{" "}
                    <span className="font-normal text-muted-foreground">· {port.country_name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {portStatusLabel[port.status] ?? port.status} · {port.latitude.toFixed(3)},{" "}
                    {port.longitude.toFixed(3)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(port)}>
                    Modifier
                  </Button>
                  {port.status === "inactive" ? (
                    <Button size="sm" variant="outline" onClick={() => setPendingReopen(port)}>
                      Réouvrir
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setPendingClose(port)}>
                      Fermer temporairement
                    </Button>
                  )}
                  {port.status === "draft" ? (
                    <Button
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: port.id, status: "active" })}
                    >
                      Publier
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Un port fermé temporairement reste visible sur la carte avec la mention « Temporairement
          fermé ». Un brouillon n'apparaît pas côté public.
        </p>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Lignes

const emptyRouteDraft = {
  departure_port_id: "",
  arrival_port_id: "",
  typical_duration_minutes: "",
  distance_km: "",
  color: "",
  status: "active",
  notes: "",
  company_ids: [] as string[],
};

const routeStatusOptions = [
  { value: "active", label: "Active (visible)" },
  { value: "inactive", label: "Suspendue" },
  { value: "draft", label: "Brouillon" },
];

const routeStatusLabel: Record<string, string> = {
  active: "Active",
  inactive: "Suspendue",
  draft: "Brouillon",
};

function RoutesAdmin({ itemId }: { itemId?: string | undefined } = {}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const [draft, setDraft] = useState(emptyRouteDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const port = (id: string) => ports.find((item) => item.id === id);
  const portName = (id: string) => port(id)?.name ?? "—";
  const portOptions = ports.map((item) => ({
    value: item.id,
    label: `${item.name} (${item.country_name})${item.status === "active" ? "" : " — fermé"}`,
  }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["routes"] });
    queryClient.invalidateQueries({ queryKey: ["schedules"] });
  };

  const reset = () => {
    setDraft(emptyRouteDraft);
    setEditingId(null);
    setFormOpen(false);
  };
  const startNew = () => {
    setDraft(emptyRouteDraft);
    setEditingId(null);
    setFormOpen(true);
  };
  const startEdit = (route: (typeof routes)[number]) => {
    setEditingId(route.id);
    setDraft({
      departure_port_id: route.departure_port_id,
      arrival_port_id: route.arrival_port_id,
      typical_duration_minutes: String(route.typical_duration_minutes ?? ""),
      distance_km: String(route.distance_km ?? ""),
      color: route.color ?? "",
      status: route.status,
      notes: route.notes ?? "",
      company_ids: route.company_ids,
    });
    setFormOpen(true);
  };
  // Fiche demandée depuis la recherche du menu.
  useEffect(() => {
    const route = itemId ? routes.find((item) => item.id === itemId) : undefined;
    if (route) startEdit(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, routes.length]);

  const save = useMutation({
    mutationFn: async () => {
      const from = port(draft.departure_port_id);
      const to = port(draft.arrival_port_id);
      if (!from || !to) throw new Error("Choisissez un port de départ et un port d'arrivée.");
      if (from.id === to.id) throw new Error("Les deux ports doivent être différents.");
      const duration = Number(draft.typical_duration_minutes);
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("Indiquez la durée de la traversée en minutes.");
      const values = {
        slug: `${from.slug}-${to.slug}`,
        departure_port_id: from.id,
        arrival_port_id: to.id,
        typical_duration_minutes: Math.round(duration),
        distance_km: draft.distance_km ? Math.round(Number(draft.distance_km)) : null,
        color: draft.color.trim() || null,
        status: draft.status as "active" | "inactive" | "draft",
        notes: draft.notes.trim() || null,
      };
      let routeId = editingId;
      if (editingId) {
        const { error } = await supabase.from("routes").update(values).eq("id", editingId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("routes")
          .insert({ ...values, is_demo: false })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        routeId = data.id;
      }
      if (routeId) {
        const { data: operators, error: operatorsError } = await supabase
          .from("route_operators")
          .select("company_id")
          .eq("route_id", routeId);
        if (operatorsError) throw operatorsError;
        const removed = (operators ?? [])
          .map((o) => o.company_id)
          .filter((id) => !draft.company_ids.includes(id));
        if (removed.length) {
          const result = await supabase
            .from("route_operators")
            .delete()
            .eq("route_id", routeId)
            .in("company_id", removed);
          if (result.error) throw result.error;
        }
        if (draft.company_ids.length) {
          const result = await supabase.from("route_operators").upsert(
            draft.company_ids.map((company_id) => ({ route_id: routeId as string, company_id })),
            { onConflict: "route_id,company_id", ignoreDuplicates: true },
          );
          if (result.error) throw result.error;
        }
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? "Ligne mise à jour." : "Ligne ajoutée.");
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routes").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ligne supprimée.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleCompany = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      company_ids: prev.company_ids.includes(id)
        ? prev.company_ids.filter((value) => value !== id)
        : [...prev.company_ids, id],
    }));

  return (
    <>
      <AdminDrawer
        open={formOpen}
        onOpenChange={(next) => !next && reset()}
        title={editingId ? "Modifier la liaison" : "Nouvelle liaison"}
        description="Le départ comme l'arrivée peuvent être en Algérie ou en Europe."
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Port de départ">
            <NativeSelect
              value={draft.departure_port_id}
              onChange={(value) => setDraft((prev) => ({ ...prev, departure_port_id: value }))}
              options={portOptions}
            />
          </Field>
          <Field label="Port d'arrivée">
            <NativeSelect
              value={draft.arrival_port_id}
              onChange={(value) => setDraft((prev) => ({ ...prev, arrival_port_id: value }))}
              options={portOptions}
            />
          </Field>
          <Field label="Durée de la traversée (minutes)">
            <Input
              type="number"
              min={30}
              placeholder="660"
              value={draft.typical_duration_minutes}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, typical_duration_minutes: event.target.value }))
              }
            />
          </Field>
          <Field label="Distance (km, facultatif)">
            <Input
              type="number"
              value={draft.distance_km}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, distance_km: event.target.value }))
              }
            />
          </Field>
          <Field label="Statut">
            <NativeSelect
              value={draft.status}
              onChange={(value) => setDraft((prev) => ({ ...prev, status: value }))}
              options={routeStatusOptions}
            />
          </Field>
          <Field label="Couleur de la ligne sur la carte">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Couleur de la ligne"
                value={
                  draft.color || routeColor(null, port(draft.departure_port_id)?.slug ?? "batogo")
                }
                onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
              />
              <div className="flex flex-wrap gap-1">
                {routePalette.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Couleur ${value}`}
                    onClick={() => setDraft((prev) => ({ ...prev, color: value }))}
                    className="h-6 w-6 rounded-full border border-border"
                    style={{ background: value }}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft((prev) => ({ ...prev, color: "" }))}
                >
                  Automatique
                </Button>
              </div>
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Compagnies qui exploitent la ligne
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {companies.map((company) => (
              <Button
                key={company.id}
                type="button"
                size="sm"
                variant={draft.company_ids.includes(company.id) ? "default" : "outline"}
                onClick={() => toggleCompany(company.id)}
              >
                {company.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Field label="Notes (facultatif)">
            <Input
              value={draft.notes}
              onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {editingId ? "Enregistrer les modifications" : "Ajouter la liaison"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Annuler
          </Button>
        </div>
      </AdminDrawer>

      <Panel>
        <AdminListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Chercher une ligne (port de départ ou d'arrivée)"
          count={
            routes.filter((route) =>
              matches(search, portName(route.departure_port_id), portName(route.arrival_port_id)),
            ).length
          }
          total={routes.length}
          onCreate={startNew}
          createLabel="Nouvelle liaison"
        />
        <ul className="divide-y divide-border">
          {routes
            .filter((route) =>
              matches(search, portName(route.departure_port_id), portName(route.arrival_port_id)),
            )
            .map((route) => (
              <li key={route.id} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className="h-3 w-6 shrink-0 rounded-full"
                  style={{
                    background: routeColor(route.color, port(route.departure_port_id)?.slug ?? ""),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(route.typical_duration_minutes)} ·{" "}
                    {routeStatusLabel[route.status] ?? route.status}
                    {route.color ? " · couleur personnalisée" : " · couleur automatique"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(route)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        confirmAction(
                          "Supprimer définitivement cette ligne ? Ses calendriers et départs peuvent être perdus.",
                        )
                      )
                        remove.mutate(route.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      </Panel>
    </>
  );
}

type VesselSpecsRow = {
  id: string;
  name: string;
  build_year?: number | null;
  length_meters?: number | null;
  passenger_capacity?: number | null;
  car_capacity?: number | null;
  freight_lane_meters?: number | null;
  speed_knots?: number | null;
};
const SPEC_FIELDS = [
  ["build_year", "Année"],
  ["length_meters", "Longueur (m)"],
  ["passenger_capacity", "Passagers"],
  ["car_capacity", "Voitures"],
  ["freight_lane_meters", "Fret (ml)"],
  ["speed_knots", "Vitesse (nœuds)"],
] as const;

function VesselSpecsEditor({ vessel }: { vessel: VesselSpecsRow }) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(
    SPEC_FIELDS.map(([k]) => [k, vessel[k] == null ? "" : String(vessel[k])]),
  ) as Record<string, string>;
  const [values, setValues] = useState(initial);
  const changed = SPEC_FIELDS.some(([k]) => values[k] !== initial[k]);
  const valid = SPEC_FIELDS.every(([k]) => !values[k] || /^\d+([.,]\d+)?$/.test(values[k]!));
  const save = useMutation({
    mutationFn: async () => {
      const patch = Object.fromEntries(
        SPEC_FIELDS.map(([k]) => [k, !values[k] ? null : Number(values[k]!.replace(",", "."))]),
      ) as Record<string, number | null>;
      const { error } = await supabase
        .from("vessels")
        .update(patch as never)
        .eq("id", vessel.id);
      if (error) throw new Error("Enregistrement des caractéristiques impossible.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vessels"] });
      toast.success("Caractéristiques enregistrées.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      {SPEC_FIELDS.map(([k, label]) => (
        <label key={k} className="grid gap-0.5 text-[10px] text-muted-foreground">
          {label}
          <Input
            inputMode="decimal"
            aria-label={`${label} de ${vessel.name}`}
            value={values[k]}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value.trim() }))}
            className="h-8 w-24 text-xs"
          />
        </label>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={!changed || !valid || save.isPending}
        onClick={() => save.mutate()}
      >
        Enregistrer les caractéristiques
      </Button>
    </div>
  );
}
