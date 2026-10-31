import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, ExternalLink, KeyRound, Pause, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatAge } from "@/lib/ferry/tracking";
import { vesselsQuery } from "@/lib/ferry/queries";

const db = supabase as unknown as SupabaseClient;

type Status = "pending" | "standby" | "approved" | "rejected";
interface Proposal {
  id: string;
  kind: "flash" | "departure" | "vessel" | "note" | "incident";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  status: Status;
  applied: boolean;
  decided_at: string | null;
  created_at: string;
  bw_watch_items: {
    url: string;
    published_at: string | null;
    bw_watch_sources: { name: string } | null;
  } | null;
}
interface Source {
  id: string;
  name: string;
  url: string;
  active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
}

const KIND: Record<Proposal["kind"], string> = {
  flash: "Flash info à publier",
  departure: "Modifier une traversée",
  vessel: "Modifier un navire",
  note: "À lire, rien d’automatique",
  incident: "Mettre à jour un incident",
};
const FIELD: Record<string, string> = {
  status: "Statut",
  departure_at: "Heure de départ",
  arrival_at: "Heure d’arrivée",
  vessel_id: "Navire",
  verified_at: "Dernière confirmation",
};
const STATUS_VALUE: Record<string, string> = {
  scheduled: "Prévue",
  modified: "Modifiée",
  cancelled: "Annulée",
  active: "Actif",
  inactive: "Retiré",
  verifying: "En vérification",
  confirmed: "Confirmé",
  resolved: "Levé",
};
const CONFIDENCE: Record<Proposal["confidence"], string> = {
  high: "Confiance haute",
  medium: "Confiance moyenne",
  low: "À confirmer",
};
const TABS: { id: Status | "done"; label: string }[] = [
  { id: "pending", label: "À valider" },
  { id: "standby", label: "En attente" },
  { id: "done", label: "Traitées" },
];

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const ago = (iso: string) => formatAge(Math.max(0, (Date.now() - Date.parse(iso)) / 60_000));

export function WatchAdmin() {
  const { isAdmin } = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState<Status | "done">("pending");
  const [newKey, setNewKey] = useState<string | null>(null);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  const proposals = useQuery({
    queryKey: ["admin", "watch", "proposals"],
    queryFn: async () => {
      const { data, error } = await db
        .from("bw_watch_proposals")
        .select("*,bw_watch_items(url,published_at,bw_watch_sources(name))")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data as unknown as Proposal[];
    },
    refetchInterval: 60_000,
  });
  const state = useQuery({
    queryKey: ["admin", "watch", "state"],
    queryFn: async () => {
      const [sources, runs, claude] = await Promise.all([
        db.from("bw_watch_sources").select("id,name,url,active,last_checked_at,last_error").order("name"),
        db
          .from("bw_watch_runs")
          .select("finished_at,items_found,errors,requested_by")
          .not("finished_at", "is", null)
          .order("finished_at", { ascending: false })
          .limit(1),
        db.from("bw_admin_settings").select("value").eq("key", "watch_claude").maybeSingle(),
      ]);
      if (sources.error) throw sources.error;
      return {
        sources: sources.data as Source[],
        lastRun: runs.data?.[0] as { finished_at: string; items_found: number; errors: number } | undefined,
        claude: claude.data?.value as { last_seen?: string } | undefined,
      };
    },
    refetchInterval: 60_000,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin", "watch"] });
    void client.invalidateQueries({ queryKey: ["admin", "counts"] });
  };

  const decide = useMutation({
    mutationFn: async (input: { id: string; decision: Status }) => {
      const { error } = await db.rpc("bw_watch_decide", {
        p_id: input.id,
        p_decision: input.decision,
      });
      if (error) throw error;
      return input.decision;
    },
    onSuccess: (decision) => {
      toast.success(
        decision === "approved"
          ? "Proposition approuvée"
          : decision === "standby"
            ? "Proposition mise en attente"
            : "Proposition refusée",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const relaunch = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("bw_watch_relaunch");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veille relancée : les sources sont en cours de lecture.");
      window.setTimeout(refresh, 25_000);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleSource = useMutation({
    mutationFn: async (source: Source) => {
      const { error } = await db
        .from("bw_watch_sources")
        .update({ active: !source.active })
        .eq("id", source.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const rotate = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("bw_watch_rotate_token");
      if (error) throw error;
      return data as string;
    },
    onSuccess: setNewKey,
    onError: (error: Error) => toast.error(error.message),
  });

  const value = (proposal: Proposal, raw: string | null) => {
    if (!raw) return "—";
    if (proposal.field === "vessel_id") return vessels.find((v) => v.id === raw)?.name ?? raw;
    if (proposal.field === "status") return STATUS_VALUE[raw] ?? raw;
    if (proposal.field === "verified_at" || proposal.field === "departure_at" || proposal.field === "arrival_at") return dateTime(raw);
    return raw;
  };
  const all = proposals.data ?? [];
  const shown = all.filter((proposal) =>
    tab === "done" ? ["approved", "rejected"].includes(proposal.status) : proposal.status === tab,
  );
  const count = (id: Status) => all.filter((proposal) => proposal.status === id).length;

  return (
    <div className="bw-watch">
      <header className="bw-watch__head">
        <div>
          <p>
            <Clock size={14} aria-hidden /> Sources lues{" "}
            {state.data?.lastRun ? ago(state.data.lastRun.finished_at) : "pas encore"}
            {state.data?.lastRun
              ? ` · ${state.data.lastRun.items_found} nouvel(s) article(s)`
              : ""}
          </p>
          <p>
            Analyse par Claude :{" "}
            {state.data?.claude?.last_seen ? ago(state.data.claude.last_seen) : "pas encore active"}. Elle
            passe une fois par heure.
          </p>
        </div>
        <Button onClick={() => relaunch.mutate()} disabled={relaunch.isPending}>
          <RefreshCw size={15} aria-hidden className={relaunch.isPending ? "animate-spin" : ""} />
          Relancer la veille
        </Button>
      </header>

      <div className="bw-watch__tabs" role="tablist" aria-label="Propositions">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id !== "done" && count(item.id) ? <b>{count(item.id)}</b> : null}
          </button>
        ))}
      </div>

      {proposals.isPending ? (
        <p className="bw-watch__empty">Chargement…</p>
      ) : proposals.error ? (
        <p role="alert" className="bw-watch__empty">
          Les propositions ne sont pas disponibles pour le moment.
        </p>
      ) : !shown.length ? (
        <p className="bw-watch__empty">
          {tab === "pending" ? "Aucune proposition à valider." : "Rien ici pour le moment."}
        </p>
      ) : (
        <ul className="bw-watch__list">
          {shown.map((proposal) => {
            const item = proposal.bw_watch_items;
            return (
              <li key={proposal.id} className="bw-watch__card" data-confidence={proposal.confidence}>
                <div className="bw-watch__meta">
                  <span>{KIND[proposal.kind]}</span>
                  <em>{CONFIDENCE[proposal.confidence]}</em>
                </div>
                <h3>{proposal.title}</h3>
                <p>{proposal.summary}</p>
                {proposal.field ? (
                  <dl className="bw-watch__change">
                    <dt>{FIELD[proposal.field] ?? proposal.field}</dt>
                    <dd>
                      <s>{value(proposal, proposal.current_value)}</s> →{" "}
                      <strong>{value(proposal, proposal.proposed_value)}</strong>
                    </dd>
                  </dl>
                ) : null}
                {item ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">
                    {item.bw_watch_sources?.name ?? "Source"}
                    {item.published_at ? ` · publié le ${dateTime(item.published_at)}` : ""}
                    <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
                {proposal.status === "pending" || proposal.status === "standby" ? (
                  <div className="bw-watch__actions">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: proposal.id, decision: "approved" })}
                    >
                      <Check size={15} aria-hidden /> Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: proposal.id, decision: "rejected" })}
                    >
                      <X size={15} aria-hidden /> Refuser
                    </Button>
                    {proposal.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: proposal.id, decision: "standby" })}
                      >
                        <Pause size={15} aria-hidden /> En attente
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="bw-watch__decided">
                    {proposal.status === "approved"
                      ? proposal.applied
                        ? "Approuvée et appliquée"
                        : "Approuvée, sans modification automatique"
                      : "Refusée"}
                    {proposal.decided_at ? ` · ${dateTime(proposal.decided_at)}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="bw-watch__sources" aria-label="Sources surveillées">
        <h3>Sources surveillées</h3>
        <ul>
          {(state.data?.sources ?? []).map((source) => (
            <li key={source.id}>
              <span>
                <b>{source.name}</b>
                <small>
                  {source.last_error
                    ? "Lecture impossible au dernier passage"
                    : source.last_checked_at
                      ? `Lue ${ago(source.last_checked_at)}`
                      : "Pas encore lue"}
                </small>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={toggleSource.isPending}
                onClick={() => toggleSource.mutate(source)}
              >
                {source.active ? "Suspendre" : "Réactiver"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin ? (
        <section className="bw-watch__key" aria-label="Clé de veille">
          <h3>
            <KeyRound size={15} aria-hidden /> Clé d’analyse de Claude
          </h3>
          <p>Elle permet seulement de déposer des propositions. En créer une nouvelle désactive l’ancienne.</p>
          {newKey ? (
            <>
              <p role="status">Copiez-la maintenant : elle ne sera plus jamais affichée.</p>
              <code>{newKey}</code>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
              Créer une nouvelle clé
            </Button>
          )}
        </section>
      ) : null}
    </div>
  );
}
