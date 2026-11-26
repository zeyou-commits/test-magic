import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Check, ExternalLink, Pencil, ShieldCheck, X } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { AdminFilterNotice } from "./AdminFilterNotice";

// Fonction et colonnes du script « signalements_erreurs_detail », absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export const reportStatusLabel: Record<string, string> = {
  new: "Nouveau",
  in_progress: "En cours",
  resolved: "Traité",
  rejected: "Écarté",
};
export const reportTargetLabel: Record<string, string> = {
  port: "Port",
  route: "Ligne",
  departure: "Départ",
  review: "Avis",
  schedule: "Calendrier",
  vessel: "Navire",
  company: "Compagnie",
};
export const reportReasonLabel: Record<string, string> = {
  wrong_schedule: "Horaire inexact",
  outdated_info: "Information obsolète",
  missing_info: "Information manquante",
  vessel_immobilized: "Navire immobilisé",
  incident_feedback: "Alerte navire inexacte ou dépassée",
  inappropriate: "Contenu inapproprié",
  other: "Autre",
};
const departureStatusLabel: Record<string, string> = {
  scheduled: "Prévu",
  confirmed: "Confirmé",
  delayed: "Retardé",
  cancelled: "Annulé",
  departed: "Parti",
  arrived: "Arrivé",
  postponed: "Reporté",
};

/** Réponses toutes faites : ce que l'équipe a décidé, gardé avec le signalement. */
const RESOLVED_NOTES = ["Horaire corrigé", "Navire corrigé", "Départ annulé ou reporté", "Fiche complétée"];
const REJECTED_NOTES = ["Test", "Information déjà juste", "Doublon", "Hors sujet", "Impossible à vérifier"];

export type StaffReport = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  message: string | null;
  status: string;
  context: {
    page?: string;
    shown?: Record<string, string | number | null>;
  } | null;
  resolution_note: string | null;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  same_target: number;
  reporter: {
    id: string;
    pseudo: string | null;
    name: string | null;
    email: string | null;
    since: string;
    staff: boolean;
    reports: number;
    rejected: number;
    resolved: number;
  } | null;
  target: {
    label?: string;
    slug?: string;
    status?: string;
    departure_at?: string;
    arrival_at?: string;
    duration_minutes?: number | null;
    vessel?: string | null;
    company?: string | null;
    route_id?: string;
    port_country?: string | null;
    source_name?: string | null;
    source_url?: string | null;
    last_verified_at?: string | null;
    delay_minutes?: number | null;
  } | null;
};

type Filter = "new" | "done" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "new", label: "À traiter" },
  { id: "done", label: "Déjà traités" },
  { id: "all", label: "Tout" },
];

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
};
const paris = (iso: string) => formatDateTime(iso, "Europe/Paris");

/** Page publique de la fiche signalée (ce que le voyageur voyait). */
function publicLink(report: StaffReport) {
  const { target_type: type, target_id: id, target } = report;
  if (type === "departure") return `/?select=departure&id=${id}`;
  if (type === "port" && target?.slug) return `/ports/${target.slug}`;
  if (type === "route" && target?.slug) return `/lignes/${target.slug}`;
  if (type === "vessel") return `/?select=vessel&id=${id}`;
  if (type === "company") return `/?select=company&id=${id}`;
  return null;
}

/** Onglet de l'admin où corriger la fiche. */
const EDIT_TAB: Record<string, string> = {
  port: "ports",
  route: "routes",
  vessel: "vessels",
  company: "companies",
};

/**
 * Admin → Erreurs signalées : chaque signalement dit QUI l'envoie, QUOI exactement (la fiche telle
 * qu'elle est, ce que le voyageur voyait, son message) et ce que l'équipe a DÉCIDÉ.
 */
export function ReportsModeration({
  newOnly,
  onClearFilter,
  onOpenItem,
  renderDepartureEditor,
}: {
  newOnly: boolean;
  onClearFilter: () => void;
  /** Ouvre la fiche dans l'onglet d'admin qui la corrige. */
  onOpenItem: (tab: string, id: string) => void;
  renderDepartureEditor: (id: string, onDone: () => void) => ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("new");
  const current: Filter = newOnly ? "new" : filter;
  const query = useQuery({
    queryKey: ["admin", "reports", "staff"],
    queryFn: async (): Promise<StaffReport[]> => {
      const { data, error } = await supabase.rpc("bw_reports_staff", { p_status: null });
      if (error) throw new Error(error.message);
      return (data ?? []) as StaffReport[];
    },
  });
  const reports = (query.data ?? []).filter((report) =>
    current === "all"
      ? true
      : current === "new"
        ? report.status === "new" || report.status === "in_progress"
        : report.status === "resolved" || report.status === "rejected",
  );
  const counts = {
    new: (query.data ?? []).filter((r) => r.status === "new" || r.status === "in_progress").length,
  };

  return (
    <div className="bw-admin-surface bw-admin-editor mt-4 p-4 sm:p-5">
      {newOnly ? (
        <AdminFilterNotice label="Nouveaux signalements à traiter" onClear={onClearFilter} />
      ) : (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Afficher">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={current === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${current === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-white"}`}
            >
              {item.label}
              {item.id === "new" && counts.new ? ` (${counts.new})` : ""}
            </button>
          ))}
        </div>
      )}
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-red-700">
          Signalements indisponibles : {(query.error as Error).message}
        </p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {current === "new" ? "Rien à traiter : tous les signalements ont une décision." : "Aucun signalement."}
        </p>
      ) : (
        <ul className="grid gap-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onOpenItem={onOpenItem}
              renderDepartureEditor={renderDepartureEditor}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function ReportCard({
  report,
  onOpenItem,
  renderDepartureEditor,
}: {
  report: StaffReport;
  onOpenItem: (tab: string, id: string) => void;
  renderDepartureEditor: (id: string, onDone: () => void) => ReactNode;
}) {
  const client = useQueryClient();
  const [deciding, setDeciding] = useState<"resolved" | "rejected" | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const target = report.target;
  const open = report.status === "new" || report.status === "in_progress";
  const zone = portTimeZone({ country_code: target?.port_country ?? "FR" });
  const reporter = report.reporter;
  const link = publicLink(report);
  const shown = report.context?.shown ?? null;

  const decide = useMutation({
    mutationFn: async (status: "resolved" | "rejected" | "new") => {
      const { error } = await supabase
        .from("reports")
        .update({
          status,
          resolution_note: status === "new" ? null : note.trim() || null,
          handled_at: status === "new" ? null : new Date().toISOString(),
        })
        .eq("id", report.id);
      if (error) throw new Error(error.message);
      return status;
    },
    onSuccess: (status) => {
      setDeciding(null);
      setNote("");
      void client.invalidateQueries({ queryKey: ["admin", "reports"] });
      void client.invalidateQueries({ queryKey: ["admin", "counts"] });
      toast.success(
        status === "resolved"
          ? "Signalement traité."
          : status === "rejected"
            ? "Signalement écarté."
            : "Signalement remis à traiter.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const correct = () => {
    if (report.target_type === "departure") setEditing(true);
    else if (EDIT_TAB[report.target_type]) onOpenItem(EDIT_TAB[report.target_type]!, report.target_id);
    else if (report.target_type === "schedule" && target?.route_id) onOpenItem("routes", target.route_id);
  };
  const canCorrect =
    Boolean(target) &&
    (report.target_type === "departure" ||
      Boolean(EDIT_TAB[report.target_type]) ||
      (report.target_type === "schedule" && Boolean(target?.route_id)));

  return (
    <li
      data-report={report.id}
      className={`rounded-2xl border bg-white p-4 ${open ? "border-amber-300" : "opacity-90"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-base">
          {reportReasonLabel[report.reason] ?? report.reason}
        </strong>
        <span className="text-sm text-muted-foreground">
          sur {reportTargetLabel[report.target_type]?.toLowerCase() ?? report.target_type}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${open ? "bg-amber-100 text-amber-900" : report.status === "resolved" ? "bg-emerald-100 text-emerald-900" : "bg-secondary"}`}
        >
          {reportStatusLabel[report.status] ?? report.status}
        </span>
        <span className="ml-auto text-xs text-muted-foreground" title={paris(report.created_at)}>
          Reçu {ago(report.created_at)} · {paris(report.created_at)}
        </span>
      </div>

      <dl className="mt-3 grid gap-2.5">
        <Row label="Ce qui est visé">
          {target ? (
            <>
              <strong>{target.label ?? "Fiche"}</strong>
              {report.target_type === "departure" && target.departure_at ? (
                <>
                  {" "}
                  · départ {formatDateTime(target.departure_at, zone)}
                  {target.vessel ? ` · ${target.vessel}` : " · navire non indiqué"}
                  {target.company ? ` (${target.company})` : ""}
                  <span className="block text-xs text-muted-foreground">
                    Statut aujourd'hui : {departureStatusLabel[target.status ?? ""] ?? target.status}
                    {target.delay_minutes ? ` · retard signalé ${target.delay_minutes} min` : ""}
                    {target.source_name ? ` · source : ${target.source_name}` : ""}
                    {target.last_verified_at
                      ? ` · vérifié le ${formatDateTime(target.last_verified_at, zone)}`
                      : " · jamais vérifié"}
                  </span>
                </>
              ) : target.company ? (
                ` · ${target.company}`
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">
              Fiche introuvable (supprimée depuis ?)
            </span>
          )}
        </Row>
        <Row label="Ce que le voyageur voyait">
          {shown && Object.keys(shown).length ? (
            <span>
              {Object.entries(shown)
                .filter(([, value]) => value !== null && value !== "")
                .map(([key, value]) => `${key} : ${value}`)
                .join(" · ")}
            </span>
          ) : report.context?.page ? (
            <span className="text-muted-foreground">Page {report.context.page}</span>
          ) : (
            <span className="text-muted-foreground">Non enregistré (signalement ancien)</span>
          )}
        </Row>
        <Row label="Son message">
          {report.message ? (
            <q className="whitespace-pre-wrap italic">{report.message}</q>
          ) : (
            <span className="text-muted-foreground">Aucun détail : seulement le motif.</span>
          )}
        </Row>
        <Row label="Envoyé par">
          {reporter ? (
            <span>
              <strong>{reporter.pseudo ?? reporter.name ?? "Voyageur sans pseudo"}</strong>
              {reporter.staff ? (
                <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  <ShieldCheck className="size-3.5" aria-hidden /> équipe
                </span>
              ) : null}
              {reporter.email ? (
                <span className="text-muted-foreground"> · {reporter.email}</span>
              ) : null}
              <span className="block text-xs text-muted-foreground">
                Inscrit le {formatDateTime(reporter.since, "Europe/Paris").split(" · ")[0]} ·{" "}
                {reporter.reports} signalement{reporter.reports > 1 ? "s" : ""} au total
                {reporter.resolved ? `, ${reporter.resolved} utile${reporter.resolved > 1 ? "s" : ""}` : ""}
                {reporter.rejected ? `, ${reporter.rejected} écarté${reporter.rejected > 1 ? "s" : ""}` : ""}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Compte supprimé</span>
          )}
        </Row>
        {report.same_target ? (
          <Row label="Même fiche">
            <span className="font-semibold text-amber-800">
              {report.same_target} autre{report.same_target > 1 ? "s" : ""} signalement
              {report.same_target > 1 ? "s" : ""} sur les 30 derniers jours : à prendre au sérieux.
            </span>
          </Row>
        ) : null}
        {!open ? (
          <Row label="Décision">
            <span>
              {reportStatusLabel[report.status]}
              {report.handled_by ? ` par ${report.handled_by}` : ""}
              {report.handled_at ? ` le ${paris(report.handled_at)}` : ""}
              {report.resolution_note ? ` : ${report.resolution_note}` : ""}
            </span>
          </Row>
        ) : null}
      </dl>

      {editing ? (
        <div className="mt-3 rounded-xl border bg-secondary/40 p-3">
          {renderDepartureEditor(report.target_id, () => {
            setEditing(false);
            setDeciding("resolved");
          })}
        </div>
      ) : null}

      {open && deciding ? (
        <div className="mt-3 grid gap-2 rounded-xl border bg-secondary/40 p-3">
          <p className="text-sm font-semibold">
            {deciding === "resolved" ? "Qu'avez-vous corrigé ?" : "Pourquoi l'écarter ?"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(deciding === "resolved" ? RESOLVED_NOTES : REJECTED_NOTES).map((text) => (
              <button
                key={text}
                type="button"
                aria-pressed={note === text}
                onClick={() => setNote(text)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${note === text ? "border-primary bg-primary/10" : "bg-white"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            maxLength={500}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note pour l'équipe (facultatif)"
            aria-label="Note de décision"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(deciding)}>
              {deciding === "resolved" ? "Valider : traité" : "Valider : écarté"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeciding(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {open && canCorrect && !editing ? (
          <Button size="sm" variant="outline" onClick={correct}>
            <Pencil className="size-3.5" /> Corriger la fiche
          </Button>
        ) : null}
        {link ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Voir comme le voyageur
            </a>
          </Button>
        ) : null}
        <span className="flex-1" />
        {open ? (
          <>
            <Button size="sm" disabled={decide.isPending} onClick={() => setDeciding("resolved")}>
              <Check className="size-3.5" /> Traité
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={decide.isPending}
              onClick={() => setDeciding("rejected")}
            >
              <X className="size-3.5" /> Écarter
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={decide.isPending}
            onClick={() => decide.mutate("new")}
          >
            Remettre à traiter
          </Button>
        )}
      </div>
    </li>
  );
}
