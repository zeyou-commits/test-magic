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
import {
  formatDateTime,
  formatDuration,
  reliabilityLabel,
  weekdayLabels,
} from "@/lib/ferry/format";
const departureStatusLabel: Record<string, string> = {
  scheduled: "Prévu",
  modified: "Modifié",
  cancelled: "Annulé",
};

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
          <TabsTrigger value="ports">Ports</TabsTrigger>
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
  duration_minutes: 600,
  weekdays: [] as number[],
  valid_from: new Date().toISOString().slice(0, 10),
  valid_to: "",
  source_name: "",
  source_url: "",
};

function SchedulesAdmin() {
  const queryClient = useQueryClient();
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
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
                setDraft((prev) => ({ ...prev, departure_time: event.target.value }))
              }
            />
          </Field>
          <Field label="Durée (minutes)">
            <Input
              type="number"
              min={30}
              value={draft.duration_minutes}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, duration_minutes: Number(event.target.value) }))
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
                  {routeLabel(schedule.route_id)} · {schedule.departure_time.slice(0, 5)}
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
