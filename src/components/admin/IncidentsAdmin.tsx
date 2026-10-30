import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminPortsQuery, adminRoutesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { formatDateTime } from "@/lib/ferry/format";
import { planningDeparturesQuery } from "@/lib/admin/planning";
import {
  departuresToReview,
  incidentsDb as db,
  type IncidentImpact,
  type IncidentStatus,
  type VesselIncident,
} from "@/lib/ferry/incidents";
import type { MessagePrefill } from "@/lib/notifications/messages";

const SQL_HINT =
  "Exécutez d'abord le script SQL « contacts_incidents_entraide » (supabase/migrations/20261111120000_contacts_incidents_entraide.sql).";
const statusLabel: Record<IncidentStatus, string> = {
  reported: "Signalé (équipe seule)",
  verifying: "En cours de vérification (public)",
  confirmed: "Immobilisé selon la source (public)",
  resolved: "Alerte levée",
  rejected: "Écarté",
};
const impactLabel: Record<IncidentImpact, string> = {
  confirmed: "Touché selon la source",
  possible: "Susceptible d'être touché",
  none: "Sans conséquence connue",
};

type ReportRow = { id: string; target_id: string; message: string | null; created_at: string };
type EventRow = {
  id: number;
  status: IncidentStatus;
  source_name: string | null;
  created_at: string;
};

/**
 * Navires immobilisés : source, vérification, statut et départs touchés, un par un.
 * Un signalement voyageur arrive ici sans jamais devenir public seul. Les messages sont préparés
 * dans le centre de messages, où l'équipe voit les destinataires avant d'envoyer.
 */
export function IncidentsAdmin({ onPrepare }: { onPrepare: (prefill: MessagePrefill) => void }) {
  const client = useQueryClient();
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const incidents = useQuery({
    queryKey: ["admin", "incidents"],
    queryFn: async () => {
      const { data, error } = await db
        .from("bw_vessel_incidents")
        .select("*, bw_incident_departures(departure_id, impact)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(SQL_HINT);
      return (data ?? []) as VesselIncident[];
    },
    retry: false,
  });
  const reports = useQuery({
    queryKey: ["admin", "incident-reports"],
    queryFn: async () => {
      const { data, error } = await db
        .from("reports")
        .select("id, target_id, message, created_at")
        .eq("target_type", "vessel")
        .eq("status", "new")
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as ReportRow[];
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [newVessel, setNewVessel] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin"] });
    void client.invalidateQueries({ queryKey: ["vessel-incidents"] });
  };
  const nameOf = (id: string) => vessels.find((v) => v.id === id)?.name ?? "Navire";
  const create = useMutation({
    mutationFn: async ({ vesselId, report }: { vesselId: string; report?: ReportRow }) => {
      const { data, error } = await db
        .from("bw_vessel_incidents")
        .insert({ vessel_id: vesselId, report_id: report?.id ?? null })
        .select("id")
        .single();
      if (error)
        throw new Error(
          error.code === "23505" ? "Un dossier est déjà ouvert pour ce navire." : SQL_HINT,
        );
      if (report) await db.from("reports").update({ status: "in_progress" }).eq("id", report.id);
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      refresh();
      setOpenId(id);
      setNewVessel("");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("reports").update({ status: "rejected" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const open = incidents.data?.find((i) => i.id === openId);
  const active = (incidents.data ?? []).filter((i) =>
    ["reported", "verifying", "confirmed"].includes(i.status),
  );
  const closed = (incidents.data ?? []).filter((i) => !active.includes(i));

  return (
    <div className="grid max-w-4xl gap-5">
      {incidents.error ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {incidents.error.message}
        </p>
      ) : null}

      {(reports.data?.length ?? 0) > 0 && (
        <section className="bw-admin-surface p-4">
          <h2 className="text-sm font-semibold">Signalements de voyageurs à vérifier</h2>
          <p className="text-xs text-muted-foreground">
            Rien n'est public tant que vous ne l'avez pas validé.
          </p>
          <ul className="mt-2 divide-y divide-border">
            {reports.data!.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-52 flex-1">
                  <strong>{nameOf(report.target_id)}</strong>
                  {report.message ? ` : ${report.message}` : ""}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleString("fr-FR")}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dismiss.isPending}
                  onClick={() => dismiss.mutate(report.id)}
                >
                  Écarter
                </Button>
                <Button
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => create.mutate({ vesselId: report.target_id, report })}
                >
                  Ouvrir un dossier
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bw-admin-surface flex flex-wrap items-end gap-2 p-4">
        <label className="grid min-w-60 flex-1 gap-1 text-sm font-medium">
          Nouveau dossier
          <select
            value={newVessel}
            onChange={(e) => setNewVessel(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="">Choisir un navire</option>
            {vessels
              .filter((v) => v.status === "active")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        <Button
          disabled={!newVessel || create.isPending}
          onClick={() => create.mutate({ vesselId: newVessel })}
        >
          Ouvrir le dossier
        </Button>
      </section>

      <IncidentList
        title="Dossiers ouverts"
        empty="Aucun navire immobilisé."
        items={active}
        nameOf={nameOf}
        onOpen={setOpenId}
      />
      {closed.length > 0 && (
        <IncidentList
          title="Dossiers clos"
          empty=""
          items={closed}
          nameOf={nameOf}
          onOpen={setOpenId}
        />
      )}

      {open ? (
        <IncidentDrawer
          key={open.id}
          incident={open}
          vesselName={nameOf(open.vessel_id)}
          onClose={() => setOpenId(null)}
          onSaved={refresh}
          onPrepare={onPrepare}
        />
      ) : null}
    </div>
  );
}

function IncidentList({
  title,
  empty,
  items,
  nameOf,
  onOpen,
}: {
  title: string;
  empty: string;
  items: VesselIncident[];
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="bw-admin-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {items.length ? (
        <ul className="mt-2 divide-y divide-border">
          {items.map((incident) => (
            <li key={incident.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-52 flex-1">
                <strong>{nameOf(incident.vessel_id)}</strong>
                <span className="block text-xs text-muted-foreground">
                  {statusLabel[incident.status]}
                  {incident.source_name ? ` · ${incident.source_name}` : ""} ·{" "}
                  {incident.bw_incident_departures.filter((d) => d.impact !== "none").length}{" "}
                  départ(s) touché(s) ou à surveiller
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => onOpen(incident.id)}>
                Ouvrir
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function IncidentDrawer({
  incident,
  vesselName,
  onClose,
  onSaved,
  onPrepare,
}: {
  incident: VesselIncident;
  vesselName: string;
  onClose: () => void;
  onSaved: () => void;
  onPrepare: (prefill: MessagePrefill) => void;
}) {
  const { data: planning = [] } = useQuery(planningDeparturesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const events = useQuery({
    queryKey: ["admin", "incident-events", incident.id],
    queryFn: async () => {
      const { data } = await db
        .from("bw_incident_events")
        .select("id, status, source_name, created_at")
        .eq("incident_id", incident.id)
        .order("id", { ascending: false });
      return (data ?? []) as EventRow[];
    },
  });
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [sourceName, setSourceName] = useState(incident.source_name);
  const [sourceUrl, setSourceUrl] = useState(incident.source_url ?? "");
  const [note, setNote] = useState(incident.public_note);
  const [verified, setVerified] = useState(incident.verified_at?.slice(0, 16) ?? "");
  const [impacts, setImpacts] = useState<Record<string, IncidentImpact>>(() =>
    Object.fromEntries(incident.bw_incident_departures.map((d) => [d.departure_id, d.impact])),
  );
  const list = departuresToReview(planning, incident.vessel_id);
  const label = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    const name = (id?: string) => ports.find((p) => p.id === id)?.name ?? "?";
    return route ? `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}` : "Liaison";
  };
  const zone = (routeId: string) =>
    portTimeZone(
      ports.find((p) => p.id === routes.find((r) => r.id === routeId)?.departure_port_id),
    );
  const touched = list.filter((d) => (impacts[d.id] ?? "possible") !== "none");

  const save = useMutation({
    mutationFn: async () => {
      if (status === "confirmed" && (!sourceName.trim() || !verified))
        throw new Error(
          "« Immobilisé selon source » demande une source et une date de vérification.",
        );
      if (sourceUrl && !/^https:\/\//i.test(sourceUrl))
        throw new Error("Le lien de la source doit commencer par https://");
      const { error } = await db
        .from("bw_vessel_incidents")
        .update({
          status,
          source_name: sourceName.trim(),
          source_url: sourceUrl.trim() || null,
          public_note: note.trim(),
          verified_at: verified ? new Date(verified).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", incident.id);
      if (error) throw new Error(error.message);
      const rows = list.map((d) => ({
        incident_id: incident.id,
        departure_id: d.id,
        impact: impacts[d.id] ?? "possible",
        updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const saved = await db.from("bw_incident_departures").upsert(rows);
        if (saved.error) throw new Error(saved.error.message);
      }
    },
    onSuccess: () => {
      toast.success(
        "Dossier enregistré. Aucun message n'est parti : préparez-les ci-dessous si besoin.",
      );
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={vesselName}
      description="Source, vérification, départs concernés et messages à préparer."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 text-sm">
        <section className="grid gap-3">
          <label className="grid gap-1 font-medium">
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IncidentStatus)}
              className="h-10 rounded-md border border-input bg-background px-2"
            >
              {(Object.keys(statusLabel) as IncidentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-medium">
            Source (affichée : « immobilisé selon … »)
            <Input
              value={sourceName}
              maxLength={120}
              placeholder="Ex. Corsica Linea, communiqué"
              onChange={(e) => setSourceName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium">
            Lien de la source
            <Input
              value={sourceUrl}
              placeholder="https://…"
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium">
            Vérifié le
            <Input
              type="datetime-local"
              value={verified}
              onChange={(e) => setVerified(e.target.value)}
            />
          </label>
          <label className="grid gap-1 font-medium">
            Précision publique (facultatif)
            <textarea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-16 rounded-md border border-input bg-background p-2 font-normal"
            />
          </label>
        </section>

        <section>
          <h3 className="font-semibold">Départs des 14 prochains jours</h3>
          <p className="text-xs text-muted-foreground">
            Qualifiez-les un par un : un navire immobilisé n'annule rien automatiquement.
          </p>
          {list.length ? (
            <ul className="mt-2 grid gap-2">
              {list.map((d) => (
                <li key={d.id} className="grid gap-1 rounded-lg border border-border p-2">
                  <span className="text-xs font-semibold">
                    {label(d.route_id)} · {formatDateTime(d.departure_at, zone(d.route_id))}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Effet sur ${label(d.route_id)}`}
                      value={impacts[d.id] ?? "possible"}
                      onChange={(e) =>
                        setImpacts({ ...impacts, [d.id]: e.target.value as IncidentImpact })
                      }
                      className="h-9 min-w-44 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {(Object.keys(impactLabel) as IncidentImpact[]).map((i) => (
                        <option key={i} value={i}>
                          {impactLabel[i]}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(impacts[d.id] ?? "possible") === "none"}
                      onClick={() =>
                        onPrepare({
                          audience: { kind: "departure", departureId: d.id, who: "everyone" },
                          template: "free",
                          fields: {},
                        })
                      }
                    >
                      Préparer le message
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Aucun départ à venir sur ce navire.
            </p>
          )}
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
            <p>
              {touched.length} départ(s) à prévenir. Chaque bouton ouvre le centre de messages :
              vous y voyez les destinataires (voyageurs et proches) et rien ne part sans votre
              validation.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() =>
                onPrepare({
                  audience: { kind: "vessel", vesselId: incident.vessel_id },
                  template: "free",
                  fields: {},
                })
              }
            >
              Préparer l'information aux personnes qui suivent le navire
            </Button>
          </div>
        </section>

        <section>
          <h3 className="font-semibold">Historique</h3>
          <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
            {(events.data ?? []).map((event) => (
              <li key={event.id}>
                {new Date(event.created_at).toLocaleString("fr-FR")} : {statusLabel[event.status]}
                {event.source_name ? ` (${event.source_name})` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminDrawer>
  );
}
