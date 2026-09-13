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
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  facilityLabels,
  formatDateTime,
  formatDuration,
  reliabilityLabel,
  weekdayLabels,
} from "@/lib/ferry/format";
import { routeColor, routePalette } from "@/lib/ferry/colors";
import { portPresets } from "@/lib/ferry/portPresets";
import type { Port } from "@/lib/ferry/types";
const departureStatusLabel: Record<string, string> = {
  scheduled: "Prévu",
  modified: "Modifié",
  cancelled: "Annulé",
};

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Back-office — Batogo" },
      {
        name: "description",
        content:
          "Espace d'administration Batogo : modération des avis, signalements, calendriers et départs.",
      },
      { property: "og:title", content: "Back-office — Batogo" },
      {
        property: "og:description",
        content: "Modération des avis, signalements et gestion des départs Batogo.",
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
        <p>Cet espace est réservé à l'équipe Batogo.</p>
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
          <TabsTrigger value="ports">Ports</TabsTrigger>
          <TabsTrigger value="routes">Lignes</TabsTrigger>
          <TabsTrigger value="import">Import Excel</TabsTrigger>
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
        <TabsContent value="ports">
          <PortsAdmin />
        </TabsContent>
        <TabsContent value="routes">
          <RoutesAdmin />
        </TabsContent>
        <TabsContent value="import">
          <ImportAdmin />
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
  const { data: ports = [] } = useQuery(adminPortsQuery);
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
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
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
                  {formatDuration(departure.duration_minutes)} ·{" "}
                  {departureStatusLabel[departure.status] ?? departure.status} ·{" "}
                  {reliabilityLabel[departure.reliability]}
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
  const total = ((base + Math.round(minutes)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationBetweenTimes(departure: string, arrival: string): number | null {
  const from = timeToMinutes(departure);
  const to = timeToMinutes(arrival);
  if (from === null || to === null) return null;
  const diff = to - from;
  return diff > 0 ? diff : diff + 1440;
}

// Indique si l'arrivée théorique tombe le lendemain (ou plus tard).
function dayShift(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  return days > 0 ? ` (+${days} j)` : "";
}

function SchedulesAdmin() {
  const queryClient = useQueryClient();
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      if (!draft.route_id || !draft.company_id) throw new Error("Choisissez une ligne et une compagnie.");
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
        reliability: "verified" as const,
        last_verified_at: new Date().toISOString(),
        status: "active" as const,
      };
      const { error } = editingId
        ? await supabase.from("schedules").update(values).eq("id", editingId)
        : await supabase.from("schedules").insert(values);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      setDraft(emptyDraft);
      setEditingId(null);
      toast.success(editingId ? "Calendrier modifié." : "Calendrier ajouté.");
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
      const schedule = schedules.find((item) => item.id === scheduleId);
      if (!schedule) throw new Error("Calendrier introuvable.");
      const today = new Date();
      const rows: Array<Record<string, unknown>> = [];
      for (let offset = 0; offset < 60; offset += 1) {
        const day = new Date(today);
        day.setUTCDate(day.getUTCDate() + offset);
        const isoDate = day.toISOString().slice(0, 10);
        const weekday = ((day.getUTCDay() + 6) % 7) + 1; // 1 = lundi
        if (!schedule.weekdays.includes(weekday)) continue;
        if (isoDate < schedule.valid_from) continue;
        if (schedule.valid_to && isoDate > schedule.valid_to) continue;
        const departureAt = new Date(`${isoDate}T${schedule.departure_time}Z`);
        rows.push({
          route_id: schedule.route_id,
          company_id: schedule.company_id,
          vessel_id: schedule.default_vessel_id,
          schedule_id: schedule.id,
          departure_at: departureAt.toISOString(),
          arrival_at: new Date(
            departureAt.getTime() + schedule.duration_minutes * 60000,
          ).toISOString(),
          duration_minutes: schedule.duration_minutes,
          status: "scheduled",
          reliability: schedule.reliability,
          source_name: schedule.source_name,
          source_url: schedule.source_url,
          last_verified_at: new Date().toISOString(),
        });
      }
      const { error: deleteError } = await supabase
        .from("departures")
        .delete()
        .eq("schedule_id", schedule.id)
        .gte("departure_at", new Date().toISOString());
      if (deleteError) throw new Error(deleteError.message);
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("departures").insert(rows as never);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(`${count} départ(s) généré(s).`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleDay = (day: number) =>
    setDraft((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((value) => value !== day)
        : [...prev.weekdays, day],
    }));

  return (
    <>
      <Panel>
        <h2 className="text-sm font-semibold">
          {editingId ? "Modifier le calendrier" : "Nouveau calendrier de traversées"}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Ligne">
            <NativeSelect
              value={draft.route_id}
              onChange={(value) => setDraft((prev) => ({ ...prev, route_id: value }))}
              options={routes.map((route) => ({ value: route.id, label: routeLabel(route.id) }))}
            />
          </Field>
          <Field label="Compagnie">
            <NativeSelect
              value={draft.company_id}
              onChange={(value) => setDraft((prev) => ({ ...prev, company_id: value }))}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
            />
          </Field>
          <Field label="Navire (facultatif)">
            <NativeSelect
              value={draft.default_vessel_id}
              onChange={(value) => setDraft((prev) => ({ ...prev, default_vessel_id: value }))}
              options={vessels.map((vessel) => ({ value: vessel.id, label: vessel.name }))}
            />
          </Field>
          <Field label="Heure de départ">
            <Input
              type="time"
              value={draft.departure_time}
              onChange={(event) =>
                setDraft((prev) => {
                  const departure_time = event.target.value;
                  const duration = durationBetweenTimes(departure_time, prev.arrival_time);
                  return {
                    ...prev,
                    departure_time,
                    duration_minutes: duration ?? prev.duration_minutes,
                  };
                })
              }
            />
          </Field>
          <Field label="Heure d'arrivée théorique">
            <Input
              type="time"
              value={draft.arrival_time}
              onChange={(event) =>
                setDraft((prev) => {
                  const arrival_time = event.target.value;
                  const duration = durationBetweenTimes(prev.departure_time, arrival_time);
                  return {
                    ...prev,
                    arrival_time,
                    duration_minutes: duration ?? prev.duration_minutes,
                  };
                })
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
                      addMinutesToTime(prev.departure_time, duration_minutes) || prev.arrival_time,
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
              onChange={(event) => setDraft((prev) => ({ ...prev, valid_to: event.target.value }))}
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
        <div className="mt-4 flex gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {editingId ? "Enregistrer les modifications" : "Ajouter le calendrier"}
          </Button>
          {editingId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
              }}
            >
              Annuler
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Calendriers existants</h2>
        <ul className="divide-y divide-border">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {routeLabel(schedule.route_id)} · départ {schedule.departure_time.slice(0, 5)} →
                  arrivée théorique{" "}
                  {addMinutesToTime(
                    schedule.departure_time.slice(0, 5),
                    schedule.duration_minutes,
                  )}
                  {dayShift(
                    (timeToMinutes(schedule.departure_time.slice(0, 5)) ?? 0) +
                      schedule.duration_minutes,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {schedule.weekdays
                    .map((day) => weekdayLabels[day - 1] ?? "")
                    .filter(Boolean)
                    .join(", ")}{" "}
                  · {formatDuration(schedule.duration_minutes)} ·{" "}
                  {reliabilityLabel[schedule.reliability]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(schedule.id);
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
                  onClick={() => generate.mutate(schedule.id)}
                >
                  Générer les départs
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(schedule.id)}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
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
  // Après un import, un port sans aucune ligne active n'apporte rien à la carte.
  const idlePorts = ports.filter(
    (port) =>
      port.status === "active" &&
      !activeRoutes.some(
        (route) => route.departure_port_id === port.id || route.arrival_port_id === port.id,
      ),
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
        `Saison archivée : ${count} départ(s) retiré(s), calendriers suspendus. Vous pouvez importer la nouvelle saison.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
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

      <Panel>
        <h2 className="text-sm font-semibold">Nouvelle saison</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Prépare la base avant d'importer un calendrier complet : les départs à partir de la date
          choisie sont retirés et les calendriers récurrents sont suspendus. Les ports, lignes,
          compagnies, navires et avis sont conservés.
        </p>
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
            Suspendre aussi les lignes (à réactiver au fil des imports)
          </label>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>{affectedDepartures.length} départ(s) à venir seront supprimés.</li>
          <li>{activeSchedules.length} calendrier(s) actif(s) seront suspendus.</li>
          {suspendRoutes ? <li>{activeRoutes.length} ligne(s) active(s) seront suspendues.</li> : null}
        </ul>
        {confirming ? (
          <div className="mt-3 rounded-lg border border-destructive/60 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              Cette opération est définitive pour les départs concernés. Confirmer l'archivage de la
              saison en cours ?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={newSeason.isPending}
                onClick={() => newSeason.mutate()}
              >
                Oui, archiver et repartir de zéro
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              Préparer une nouvelle saison
            </Button>
          </div>
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

function PortsAdmin() {
  const queryClient = useQueryClient();
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
  };

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
    onSuccess: (count) => {
      invalidateAll();
      setPendingClose(null);
      toast.success(
        count > 0
          ? `Port fermé temporairement. ${count} ligne(s) suspendue(s).`
          : "Port fermé temporairement.",
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
                et {schedulesOf(activeRoutesOf(pendingClose.id).map((r) => r.id), "active").length}{" "}
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

      <Panel>
        <h2 className="text-sm font-semibold">
          {editingId ? "Modifier le port" : "Nouveau port"}
        </h2>
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
            <NativeSelect value={draft.status} onChange={set("status")} options={portStatusOptions} />
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
        </div>
        <div className="mt-3">
          <Field label="À savoir (embarquement, accès, fermeture…)">
            <Input
              value={draft.notes}
              onChange={(event) => set("notes")(event.target.value)}
            />
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
          {editingId ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              Annuler
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Ports existants ({ports.length})</h2>
        <ul className="divide-y divide-border">
          {ports.map((port) => (
            <li key={port.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {port.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {port.country_name}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {portStatusLabel[port.status] ?? port.status} · {port.latitude.toFixed(3)},{" "}
                  {port.longitude.toFixed(3)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
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
                      status: port.status,
                    });
                  }}
                >
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

function RoutesAdmin() {
  const queryClient = useQueryClient();
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
  };

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
        await supabase.from("route_operators").delete().eq("route_id", routeId);
        if (draft.company_ids.length > 0) {
          const { error } = await supabase
            .from("route_operators")
            .insert(draft.company_ids.map((company_id) => ({ route_id: routeId as string, company_id })));
          if (error) throw new Error(error.message);
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
      <Panel>
        <h2 className="text-sm font-semibold">
          {editingId ? "Modifier la ligne" : "Nouvelle ligne maritime"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Le départ comme l'arrivée peuvent être en Algérie ou en Europe.
        </p>
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
              onChange={(event) => setDraft((prev) => ({ ...prev, distance_km: event.target.value }))}
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
                  draft.color ||
                  routeColor(null, port(draft.departure_port_id)?.slug ?? "ferrydz")
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
          <p className="text-xs font-medium text-muted-foreground">Compagnies qui exploitent la ligne</p>
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
            {editingId ? "Enregistrer les modifications" : "Ajouter la ligne"}
          </Button>
          {editingId ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              Annuler
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Lignes existantes ({routes.length})</h2>
        <ul className="divide-y divide-border">
          {routes.map((route) => (
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
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
                  }}
                >
                  Modifier
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(route.id)}>
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

// ---------------------------------------------------------------- Import Excel

// Chaque ligne du fichier devient une ligne modifiable avant validation finale.
interface ImportDraftRow {
  key: string;
  line: number;
  date: string;
  departure_time: string;
  arrival_time: string;
  departure_port_id: string;
  arrival_port_id: string;
  company_id: string;
  vessel_id: string;
  status: "scheduled" | "modified" | "cancelled";
  rawLabel: string;
  raw_company: string;
  raw_vessel: string;
  duration_hint: number;
}

const importColumns = [
  ["date", "Date du départ, au format AAAA-MM-JJ (ex. 2026-10-05)"],
  ["heure", "Heure de départ, format HH:MM sur 24 h (ex. 18:30)"],
  ["heure_arrivee", "Heure d'arrivée théorique, format HH:MM (le lendemain est déduit tout seul)"],
  ["port_depart", "Nom exact du port de départ (ex. Alger)"],
  ["port_arrivee", "Nom exact du port d'arrivée (ex. Marseille)"],
  ["compagnie", "Nom exact de la compagnie (ex. Algérie Ferries)"],
  ["navire", "Facultatif — nom exact du navire"],
  [
    "duree_minutes",
    "Facultatif — durée en minutes ; utilisée si l'heure d'arrivée est absente",
  ],
  ["statut", "Facultatif — prevu, modifie ou annule (par défaut : prevu)"],
];

const importStatusMap: Record<string, "scheduled" | "modified" | "cancelled"> = {
  prevu: "scheduled",
  "prévu": "scheduled",
  scheduled: "scheduled",
  modifie: "modified",
  "modifié": "modified",
  modified: "modified",
  annule: "cancelled",
  "annulé": "cancelled",
  cancelled: "cancelled",
};

const importStatusOptions = [
  { value: "scheduled", label: "Prévu" },
  { value: "modified", label: "Modifié" },
  { value: "cancelled", label: "Annulé" },
];

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function ImportAdmin() {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [rows, setRows] = useState<ImportDraftRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);

  const portOptions = ports.map((port) => ({ value: port.id, label: port.name }));
  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: company.name,
  }));
  const vesselOptions = vessels.map((vessel) => ({ value: vessel.id, label: vessel.name }));

  const findPort = (value: unknown) => {
    const needle = normalize(value);
    if (!needle) return undefined;
    return ports.find(
      (port) =>
        normalize(port.name) === needle ||
        normalize(port.slug) === needle ||
        normalize(port.city) === needle,
    );
  };

  // Contrôle d'une ligne : renvoie soit une erreur lisible, soit les valeurs à enregistrer.
  const check = (row: ImportDraftRow): { error: string } | { values: Record<string, unknown> } => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return { error: "Date invalide (AAAA-MM-JJ)." };
    if (timeToMinutes(row.departure_time) === null) return { error: "Heure de départ invalide." };
    if (timeToMinutes(row.arrival_time) === null)
      return { error: "Heure d'arrivée théorique invalide." };
    if (!row.departure_port_id) return { error: "Port de départ à choisir." };
    if (!row.arrival_port_id) return { error: "Port d'arrivée à choisir." };
    if (row.departure_port_id === row.arrival_port_id)
      return { error: "Les deux ports doivent être différents." };
    if (!row.company_id) return { error: "Compagnie à choisir." };
    const route = routes.find(
      (item) =>
        item.departure_port_id === row.departure_port_id &&
        item.arrival_port_id === row.arrival_port_id,
    );
    if (!route)
      return {
        error: "Aucune ligne existante entre ces deux ports : créez-la dans l'onglet « Lignes ».",
      };
    const duration = durationBetweenTimes(row.departure_time, row.arrival_time);
    if (!duration) return { error: "Durée théorique impossible à calculer." };
    const departureAt = new Date(`${row.date}T${row.departure_time.padStart(5, "0")}:00Z`);
    if (Number.isNaN(departureAt.getTime())) return { error: "Date et heure illisibles." };
    return {
      values: {
        route_id: route.id,
        company_id: row.company_id,
        vessel_id: row.vessel_id || null,
        departure_at: departureAt.toISOString(),
        arrival_at: new Date(departureAt.getTime() + duration * 60000).toISOString(),
        duration_minutes: duration,
        status: row.status,
        reliability: "verified",
        source_name: fileName ? `Import Excel — ${fileName}` : "Import Excel",
        last_verified_at: new Date().toISOString(),
      },
    };
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error("Le fichier ne contient aucune feuille.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });
      const parsed: ImportDraftRow[] = raw.map((entry, index) => {
        const get = (key: string) => {
          const found = Object.keys(entry).find((column) => normalize(column) === key);
          return found ? entry[found] : undefined;
        };
        const date = String(get("date") ?? "").trim();
        const departureTime = String(get("heure") ?? "").trim().slice(0, 5);
        const from = findPort(get("port_depart"));
        const to = findPort(get("port_arrivee"));
        const companyNeedle = normalize(get("compagnie"));
        const company = companies.find(
          (item) => normalize(item.name) === companyNeedle || normalize(item.slug) === companyNeedle,
        );
        const vesselNeedle = normalize(get("navire"));
        const vessel = vesselNeedle
          ? vessels.find(
              (item) =>
                normalize(item.name) === vesselNeedle || normalize(item.slug) === vesselNeedle,
            )
          : undefined;
        const route =
          from && to
            ? routes.find(
                (item) =>
                  item.departure_port_id === from.id && item.arrival_port_id === to.id,
              )
            : undefined;
        const durationRaw = Number(get("duree_minutes"));
        const fallbackDuration =
          Number.isFinite(durationRaw) && durationRaw > 0
            ? Math.round(durationRaw)
            : route?.typical_duration_minutes ?? 0;
        const arrivalFromFile = String(get("heure_arrivee") ?? "").trim().slice(0, 5);
        const arrivalTime =
          timeToMinutes(arrivalFromFile) !== null
            ? arrivalFromFile
            : fallbackDuration
              ? addMinutesToTime(departureTime, fallbackDuration)
              : "";
        return {
          key: `${index}-${date}-${departureTime}`,
          line: index + 2,
          date,
          departure_time: departureTime,
          arrival_time: arrivalTime,
          departure_port_id: from?.id ?? "",
          arrival_port_id: to?.id ?? "",
          company_id: company?.id ?? "",
          vessel_id: vessel?.id ?? "",
          status: importStatusMap[normalize(get("statut")) || "prevu"] ?? "scheduled",
          rawLabel: `${String(get("port_depart") ?? "?")} → ${String(get("port_arrivee") ?? "?")}`,
          raw_company: String(get("compagnie") ?? "").trim(),
          raw_vessel: String(get("navire") ?? "").trim(),
          duration_hint: fallbackDuration,
        };
      });
      setRows(parsed);
      if (parsed.length === 0) toast.error("Aucune ligne trouvée dans le fichier.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fichier illisible.");
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const patch = (key: string, changes: Partial<ImportDraftRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const checked = rows.map((row) => ({ row, result: check(row) }));
  const validValues = checked
    .map((item) => ("values" in item.result ? item.result.values : null))
    .filter((values): values is Record<string, unknown> => values !== null);
  const invalidCount = checked.length - validValues.length;

  // Éléments absents de la base que l'on sait créer sans invention de données.
  const missingCompanies = [
    ...new Set(rows.filter((row) => !row.company_id && row.raw_company).map((row) => row.raw_company)),
  ];
  const missingVessels = [
    ...new Set(rows.filter((row) => !row.vessel_id && row.raw_vessel).map((row) => row.raw_vessel)),
  ];
  const missingRoutePairs = [
    ...new Map(
      rows
        .filter(
          (row) =>
            row.departure_port_id &&
            row.arrival_port_id &&
            row.departure_port_id !== row.arrival_port_id &&
            !routes.some(
              (item) =>
                item.departure_port_id === row.departure_port_id &&
                item.arrival_port_id === row.arrival_port_id,
            ),
        )
        .map((row) => [`${row.departure_port_id}-${row.arrival_port_id}`, row] as const),
    ).values(),
  ];
  const missingPortRows = rows.filter((row) => !row.departure_port_id || !row.arrival_port_id);
  const missingTotal = missingCompanies.length + missingVessels.length + missingRoutePairs.length;

  const portById = (id: string) => ports.find((port) => port.id === id);
  const uniqueSlug = (base: string, taken: string[]) => {
    const root = slugify(base) || "element";
    let candidate = root;
    let index = 2;
    while (taken.includes(candidate)) {
      candidate = `${root}-${index}`;
      index += 1;
    }
    return candidate;
  };

  // Crée compagnies, navires et lignes manquants, puis rattache les lignes du fichier.
  const autoCreate = useMutation({
    mutationFn: async () => {
      const companyIdByName = new Map<string, string>();
      const takenCompanySlugs = companies.map((item) => item.slug);
      for (const name of missingCompanies) {
        const slug = uniqueSlug(name, takenCompanySlugs);
        takenCompanySlugs.push(slug);
        const { data, error } = await supabase
          .from("companies")
          .insert({ slug, name, status: "active" } as never)
          .select("id")
          .single();
        if (error) throw new Error(`Compagnie « ${name} » : ${error.message}`);
        companyIdByName.set(normalize(name), (data as { id: string }).id);
      }

      const resolveCompany = (row: ImportDraftRow) =>
        row.company_id || companyIdByName.get(normalize(row.raw_company)) || null;

      const vesselIdByName = new Map<string, string>();
      const takenVesselSlugs = vessels.map((item) => item.slug);
      for (const name of missingVessels) {
        const owner = rows.find((row) => row.raw_vessel === name);
        const slug = uniqueSlug(name, takenVesselSlugs);
        takenVesselSlugs.push(slug);
        const { data, error } = await supabase
          .from("vessels")
          .insert({
            slug,
            name,
            company_id: owner ? resolveCompany(owner) : null,
            status: "active",
          } as never)
          .select("id")
          .single();
        if (error) throw new Error(`Navire « ${name} » : ${error.message}`);
        vesselIdByName.set(normalize(name), (data as { id: string }).id);
      }

      const takenRouteSlugs = routes.map((item) => item.slug);
      let createdRoutes = 0;
      for (const row of missingRoutePairs) {
        const from = portById(row.departure_port_id);
        const to = portById(row.arrival_port_id);
        if (!from || !to) continue;
        const slug = uniqueSlug(`${from.name}-${to.name}`, takenRouteSlugs);
        takenRouteSlugs.push(slug);
        const duration =
          durationBetweenTimes(row.departure_time, row.arrival_time) || row.duration_hint || null;
        const { data, error } = await supabase
          .from("routes")
          .insert({
            slug,
            departure_port_id: from.id,
            arrival_port_id: to.id,
            typical_duration_minutes: duration,
            status: "active",
          } as never)
          .select("id")
          .single();
        if (error) throw new Error(`Ligne ${from.name} → ${to.name} : ${error.message}`);
        createdRoutes += 1;
        const companyId = resolveCompany(row);
        if (companyId) {
          await supabase
            .from("route_operators")
            .insert({ route_id: (data as { id: string }).id, company_id: companyId } as never);
        }
      }

      return {
        companies: companyIdByName,
        vessels: vesselIdByName,
        createdRoutes,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["vessels"] });
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          company_id: row.company_id || result.companies.get(normalize(row.raw_company)) || "",
          vessel_id: row.vessel_id || result.vessels.get(normalize(row.raw_vessel)) || "",
        })),
      );
      const parts = [
        result.createdRoutes ? `${result.createdRoutes} ligne(s)` : null,
        result.companies.size ? `${result.companies.size} compagnie(s)` : null,
        result.vessels.size ? `${result.vessels.size} navire(s)` : null,
      ].filter(Boolean);
      toast.success(parts.length ? `Créé : ${parts.join(", ")}.` : "Rien à créer.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Ports du fichier encore fermés ou en brouillon : leurs lignes ne s'affichent pas sur la carte.
  const blockedPorts = [
    ...new Map(
      rows
        .flatMap((row) => [row.departure_port_id, row.arrival_port_id])
        .filter(Boolean)
        .map((id) => portById(id))
        .filter((port): port is NonNullable<typeof port> => !!port && port.status !== "active")
        .map((port) => [port.id, port] as const),
    ).values(),
  ];

  const activatePort = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ports").update({ status: "active" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ports"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Port ouvert : ses lignes réapparaissent sur la carte.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importRows = useMutation({
    mutationFn: async () => {
      if (invalidCount > 0)
        throw new Error("Corrigez d'abord les lignes signalées avant de valider l'import.");
      if (validValues.length === 0) throw new Error("Aucune ligne à importer.");
      // Anti-doublon : on ignore les départs déjà présents (même ligne, même horaire).
      const routeIds = [...new Set(validValues.map((values) => values["route_id"] as string))];
      const dates = validValues.map((values) => values["departure_at"] as string).sort();
      const existing = await supabase
        .from("departures")
        .select("route_id, departure_at")
        .in("route_id", routeIds)
        .gte("departure_at", dates[0]!)
        .lte("departure_at", dates[dates.length - 1]!);
      if (existing.error) throw new Error(existing.error.message);
      const known = new Set(
        (existing.data ?? []).map(
          (item) => `${item.route_id}|${new Date(item.departure_at).toISOString()}`,
        ),
      );
      const fresh = validValues.filter(
        (values) =>
          !known.has(`${values["route_id"] as string}|${values["departure_at"] as string}`),
      );
      const skipped = validValues.length - fresh.length;
      if (fresh.length > 0) {
        const { error } = await supabase.from("departures").insert(fresh as never);
        if (error) throw new Error(error.message);
      }
      // Une ligne suspendue (nouvelle saison) redevient active dès qu'elle reçoit des départs,
      // sinon la carte resterait vide après l'import.
      const toReactivate = routes
        .filter((route) => routeIds.includes(route.id) && route.status !== "active")
        .map((route) => route.id);
      if (toReactivate.length > 0) {
        const { error } = await supabase
          .from("routes")
          .update({ status: "active" })
          .in("id", toReactivate);
        if (error) throw new Error(error.message);
      }
      return { count: fresh.length, skipped, reactivated: toReactivate.length };
    },
    onSuccess: ({ count, skipped, reactivated }) => {
      queryClient.invalidateQueries({ queryKey: ["departures"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["ports"] });
      toast.success(
        `${count} départ(s) importé(s)${skipped ? ` — ${skipped} doublon(s) ignoré(s)` : ""}${
          reactivated ? ` — ${reactivated} ligne(s) réactivée(s) sur la carte` : ""
        }.`,
      );
      setRows([]);
      setFileName("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      importColumns.map(([key]) => key as string),
      [
        "2026-10-05",
        "18:30",
        "05:30",
        "Alger",
        "Marseille",
        "Algérie Ferries",
        "",
        "660",
        "prevu",
      ],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "departs");
    XLSX.writeFile(workbook, "modele-departs-ferrydz.xlsx");
  };

  return (
    <>
      <Panel>
        <h2 className="text-sm font-semibold">Format attendu du fichier</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Un fichier .xlsx ou .csv, première feuille utilisée, première ligne = les en-têtes ci-dessous
          (dans n'importe quel ordre, accents et majuscules indifférents). Les heures sont
          interprétées en UTC.
        </p>
        <ul className="mt-3 space-y-1 text-xs">
          {importColumns.map(([key, help]) => (
            <li key={key}>
              <code className="rounded bg-secondary px-1.5 py-0.5 font-semibold">{key}</code>{" "}
              <span className="text-muted-foreground">{help}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          La ligne (port de départ → port d'arrivée) doit déjà exister dans l'onglet « Lignes ».
        </p>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            Télécharger un modèle Excel
          </Button>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Importer des départs</h2>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="mt-3 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void parseFile(file);
          }}
        />
        {parsing ? <p className="mt-2 text-sm text-muted-foreground">Lecture du fichier…</p> : null}
      </Panel>

      {rows.length > 0 ? (
        <Panel>
          <h2 className="text-sm font-semibold">Vérifier et corriger avant validation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {fileName} — {validValues.length} ligne(s) prête(s)
            {invalidCount > 0 ? `, ${invalidCount} à corriger` : ""}. Vous pouvez tout modifier ici :
            rien n'est enregistré avant la validation finale.
          </p>
          {missingTotal > 0 ? (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-semibold">Éléments absents de la base</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {missingRoutePairs.length ? (
                  <li>
                    {missingRoutePairs.length} ligne(s) à créer :{" "}
                    {missingRoutePairs
                      .map(
                        (row) =>
                          `${portById(row.departure_port_id)?.name ?? "?"} → ${portById(row.arrival_port_id)?.name ?? "?"}`,
                      )
                      .join(", ")}
                  </li>
                ) : null}
                {missingCompanies.length ? (
                  <li>{missingCompanies.length} compagnie(s) : {missingCompanies.join(", ")}</li>
                ) : null}
                {missingVessels.length ? (
                  <li>{missingVessels.length} navire(s) : {missingVessels.join(", ")}</li>
                ) : null}
              </ul>
              <div className="mt-2">
                <Button
                  size="sm"
                  disabled={autoCreate.isPending}
                  onClick={() => autoCreate.mutate()}
                >
                  Créer automatiquement ces éléments
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Les lignes reprennent la durée du fichier ; compagnies et navires sont créés avec
                leur nom, à compléter ensuite dans leurs onglets.
              </p>
            </div>
          ) : null}
          {missingPortRows.length > 0 ? (
            <p className="mt-3 text-xs text-destructive">
              {missingPortRows.length} ligne(s) ont un port inconnu : un port ne peut pas être créé
              automatiquement (coordonnées nécessaires). Ajoutez-le dans l'onglet « Ports », puis
              choisissez-le ci-dessous.
            </p>
          ) : null}
          {blockedPorts.length > 0 ? (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-semibold">
                Ports fermés ou en brouillon : leurs lignes resteront invisibles sur la carte
              </p>
              <ul className="mt-2 space-y-2">
                {blockedPorts.map((port) => (
                  <li key={port.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {port.name} —{" "}
                      {port.status === "inactive" ? "temporairement fermé" : "brouillon"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activatePort.isPending}
                      onClick={() => activatePort.mutate(port.id)}
                    >
                      Ouvrir ce port
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="mt-3 space-y-3">
            {checked.map(({ row, result }) => {
              const error = "error" in result ? result.error : null;
              const total =
                (timeToMinutes(row.departure_time) ?? 0) +
                (durationBetweenTimes(row.departure_time, row.arrival_time) ?? 0);
              return (
                <li
                  key={row.key}
                  className={`rounded-lg border p-3 ${
                    error ? "border-destructive/60 bg-destructive/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Ligne {row.line} · {row.rawLabel}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
                    >
                      Retirer
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Date">
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(event) => patch(row.key, { date: event.target.value })}
                      />
                    </Field>
                    <Field label="Heure de départ">
                      <Input
                        type="time"
                        value={row.departure_time}
                        onChange={(event) =>
                          patch(row.key, { departure_time: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={`Arrivée théorique${dayShift(total)}`}>
                      <Input
                        type="time"
                        value={row.arrival_time}
                        onChange={(event) => patch(row.key, { arrival_time: event.target.value })}
                      />
                    </Field>
                    <Field label="Statut">
                      <NativeSelect
                        value={row.status}
                        onChange={(value) =>
                          patch(row.key, { status: value as ImportDraftRow["status"] })
                        }
                        options={importStatusOptions}
                      />
                    </Field>
                    <Field label="Port de départ">
                      <NativeSelect
                        value={row.departure_port_id}
                        onChange={(value) => patch(row.key, { departure_port_id: value })}
                        options={portOptions}
                      />
                    </Field>
                    <Field label="Port d'arrivée">
                      <NativeSelect
                        value={row.arrival_port_id}
                        onChange={(value) => patch(row.key, { arrival_port_id: value })}
                        options={portOptions}
                      />
                    </Field>
                    <Field label="Compagnie">
                      <NativeSelect
                        value={row.company_id}
                        onChange={(value) => patch(row.key, { company_id: value })}
                        options={companyOptions}
                      />
                    </Field>
                    <Field label="Navire (facultatif)">
                      <NativeSelect
                        value={row.vessel_id}
                        onChange={(value) => patch(row.key, { vessel_id: value })}
                        options={vesselOptions}
                      />
                    </Field>
                  </div>
                  {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              disabled={importRows.isPending || invalidCount > 0 || validValues.length === 0}
              onClick={() => importRows.mutate()}
            >
              Valider l'import de {validValues.length} départ(s)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRows([]);
                setFileName("");
              }}
            >
              Annuler
            </Button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
