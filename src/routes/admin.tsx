import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration, weekdayLabels } from "@/lib/ferry/format";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Back-office — FerryDZ" },
      {
        name: "description",
        content:
          "Espace d'administration FerryDZ : modération des avis, signalements, calendriers et départs.",
      },
      { property: "og:title", content: "Back-office — FerryDZ" },
      {
        property: "og:description",
        content: "Modération des avis, signalements et gestion des départs FerryDZ.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();

  if (loading) {
    return <CenteredNote>Chargement…</CenteredNote>;
  }

  if (!user) {
    return (
      <CenteredNote>
        <p>Connectez-vous pour accéder au back-office.</p>
        <Button asChild className="mt-3">
          <Link to="/auth">Se connecter</Link>
        </Button>
      </CenteredNote>
    );
  }

  if (!isAdmin) {
    return (
      <CenteredNote>
        <p>Cet espace est réservé à l'équipe FerryDZ.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/">Retour à la carte</Link>
        </Button>
      </CenteredNote>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Back-office</h1>
          <p className="text-sm text-muted-foreground">
            Modération et mise à jour des informations publiées.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Voir la carte</Link>
        </Button>
      </div>

      <Tabs defaultValue="reviews" className="mt-6">
        <TabsList>
          <TabsTrigger value="reviews">Avis</TabsTrigger>
          <TabsTrigger value="reports">Signalements</TabsTrigger>
          <TabsTrigger value="departures">Départs</TabsTrigger>
          <TabsTrigger value="schedules">Calendriers</TabsTrigger>
          <TabsTrigger value="data">Données</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <ReviewsModeration />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsModeration />
        </TabsContent>
        <TabsContent value="departures">
          <DeparturesAdmin />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesAdmin />
        </TabsContent>
        <TabsContent value="data">
          <DataAdmin />
        </TabsContent>
      </Tabs>
    </div>
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
  return <div className="mt-4 rounded-xl border border-border bg-card p-4">{children}</div>;
}

function ReviewsModeration() {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("port_reviews")
        .select("*")
        .in("status", ["pending", "approved", "hidden", "rejected"])
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
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    {review.status}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.comment ?? "(sans commentaire)"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => update.mutate({ id: review.id, status: "published" })}
                >
                  Publier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update.mutate({ id: review.id, status: "hidden" })}
                >
                  Masquer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: review.id, status: "rejected" })}
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

function ReportsModeration() {
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
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
                  {report.target_type} · {report.reason}
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    {report.status}
                  </span>
                </p>
                {report.message ? (
                  <p className="mt-1 text-sm text-muted-foreground">{report.message}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => update.mutate({ id: report.id, status: "resolved" })}
                >
                  Traité
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
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

function DeparturesAdmin() {
  const queryClient = useQueryClient();
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery(60));
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);

  const update = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: { status?: "scheduled" | "cancelled"; reliability?: "verified" };
    }) => {
      const { error } = await supabase
        .from("departures")
        .update({ ...values, last_verified_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      toast.success("Départ mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <Panel>
      <ul className="divide-y divide-border">
        {departures.map((departure) => {
          const route = routes.find((item) => item.id === departure.route_id);
          const company = companies.find((item) => item.id === departure.company_id);
          return (
            <li key={departure.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{formatDateTime(departure.departure_at)}</p>
                <p className="text-xs text-muted-foreground">
                  {route
                    ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
                    : "—"}
                  {company ? ` · ${company.name}` : ""} ·{" "}
                  {formatDuration(departure.duration_minutes)} · {departure.status} ·{" "}
                  {departure.reliability}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({ id: departure.id, values: { reliability: "verified" } })
                  }
                >
                  Marquer vérifié
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update.mutate({
                      id: departure.id,
                      values: {
                        status: departure.status === "cancelled" ? "scheduled" : "cancelled",
                      },
                    })
                  }
                >
                  {departure.status === "cancelled" ? "Rétablir" : "Annuler"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SchedulesAdmin() {
  const queryClient = useQueryClient();
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const update = useMutation({
    mutationFn: async ({ id, time }: { id: string; time: string }) => {
      const { error } = await supabase
        .from("schedules")
        .update({
          departure_time: time,
          reliability: "verified",
          last_verified_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Calendrier mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <Panel>
      <ul className="divide-y divide-border">
        {schedules.map((schedule) => {
          const route = routes.find((item) => item.id === schedule.route_id);
          return (
            <li key={schedule.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {route
                    ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {schedule.weekdays
                    .map((day) => weekdayLabels[day - 1] ?? "")
                    .filter(Boolean)
                    .join(", ")}{" "}
                  · {formatDuration(schedule.duration_minutes)} · {schedule.reliability}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={editing[schedule.id] ?? schedule.departure_time.slice(0, 5)}
                  onChange={(event) =>
                    setEditing((prev) => ({ ...prev, [schedule.id]: event.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() =>
                    update.mutate({
                      id: schedule.id,
                      time: `${editing[schedule.id] ?? schedule.departure_time.slice(0, 5)}:00`,
                    })
                  }
                >
                  Enregistrer
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DataAdmin() {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Counter label="Ports" value={ports.length} />
        <Counter label="Lignes" value={routes.length} />
        <Counter label="Compagnies" value={companies.length} />
        <Counter label="Navires" value={vessels.length} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Les fiches marquées « démonstration » servent d'exemples et doivent être remplacées par
        des informations vérifiées avant publication.
      </p>
    </Panel>
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
