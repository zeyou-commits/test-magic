import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, ExternalLink, KeyRound, Newspaper, Pause, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { ChatModeration } from "./ChatModeration";
import { ChatDemoAdmin } from "./ChatDemoAdmin";
import { ChatStartersAdmin } from "./ChatStartersAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatAge } from "@/lib/ferry/tracking";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { flashClient, looksInternal, newsKey } from "@/lib/ferry/flash";
import { DeparturePicker } from "./ContentAdmin";

const db = supabase as unknown as SupabaseClient;

type Status = "pending" | "standby" | "approved" | "rejected";
interface Proposal {
  id: string;
  kind:
    | "flash"
    | "departure"
    | "vessel"
    | "note"
    | "incident"
    | "crossing"
    | "schedule_fix"
    | "new_departure"
    | "remove_departure";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  status: Status;
  applied: boolean;
  decided_at: string | null;
  decision_note?: string | null;
  created_at: string;
  vessel_id: string | null;
  company_id: string | null;
  departure_id?: string | null;
  /** Texte grand public proposé par la veille (script du 13/12/2026). */
  public_summary?: string | null;
  departure_ids?: string[] | null;
  bw_watch_items: {
    url: string;
    title?: string | null;
    excerpt?: string | null;
    published_at: string | null;
    bw_watch_sources: { name: string; url: string; tier: "official" | "media" } | null;
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
  note: "À lire, sans effet sur les horaires",
  incident: "Mettre à jour un incident",
  crossing: "Corriger l’heure affichée",
  schedule_fix: "Corriger le planning (source officielle)",
  new_departure: "Ajouter une traversée (source officielle)",
  remove_departure: "Retirer une traversée (source officielle)",
};
const FIELD: Record<string, string> = {
  status: "Statut",
  departure_at: "Heure de départ",
  arrival_at: "Heure d’arrivée",
  vessel_id: "Navire",
  verified_at: "Dernière confirmation",
  web_departed_at: "Départ constaté",
  web_arrived_at: "Arrivée constatée",
  web_eta_at: "Arrivée estimée",
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
  // Proposition dont l'actualité est en cours de rédaction (texte grand public relu).
  const [composing, setComposing] = useState<string | null>(null);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  const proposals = useQuery({
    queryKey: ["admin", "watch", "proposals"],
    queryFn: async () => {
      const { data, error } = await db
        .from("bw_watch_proposals")
        .select("*,bw_watch_items(url,title,excerpt,published_at,bw_watch_sources(name,url,tier))")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Proposal[];
    },
    refetchInterval: 60_000,
  });
  const state = useQuery({
    queryKey: ["admin", "watch", "state"],
    queryFn: async () => {
      const [sources, runs, claude] = await Promise.all([
        db.from("bw_watch_sources").select("id,name,url,active,last_checked_at,last_error").not("url", "like", "%/interne/%").order("name"),
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
  const revert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("bw_watch_revert", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction annulée");
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
    if (proposal.field === "verified_at" || proposal.field === "departure_at" || proposal.field === "arrival_at" || proposal.field?.startsWith("web_")) return dateTime(raw);
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
                {(proposal.kind === "departure" || proposal.kind === "schedule_fix") &&
                (proposal.field === "departure_at" || proposal.field === "arrival_at") &&
                proposal.proposed_value ? (
                  <TimeFix proposal={proposal} onDone={refresh} />
                ) : null}
                {item ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">
                    {item.bw_watch_sources?.name ?? "Source"}
                    {item.published_at ? ` · publié le ${dateTime(item.published_at)}` : ""}
                    <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
                {composing === proposal.id ? (
                  <NewsComposer
                    proposal={proposal}
                    onCancel={() => setComposing(null)}
                    onDone={() => {
                      setComposing(null);
                      refresh();
                    }}
                  />
                ) : null}
                {(proposal.status === "pending" || proposal.status === "standby") &&
                composing !== proposal.id ? (
                  <div className="bw-watch__actions">
                    {proposal.kind === "flash" ? (
                      // Une actualité n'est jamais publiée sans relecture du texte grand public.
                      <Button size="sm" onClick={() => setComposing(proposal.id)}>
                        <Newspaper size={15} aria-hidden /> Rédiger et publier
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: proposal.id, decision: "approved" })}
                      >
                        <Check size={15} aria-hidden />{" "}
                        {proposal.kind === "new_departure"
                          ? "Ajouter la traversée"
                          : proposal.kind === "remove_departure"
                            ? "Retirer la traversée"
                            : "Approuver"}
                      </Button>
                    )}
                    {proposal.kind === "note" && !item?.bw_watch_sources?.url.includes("/interne/") ? (
                      <Button size="sm" variant="outline" onClick={() => setComposing(proposal.id)}>
                        <Newspaper size={15} aria-hidden /> Publier en actualité
                      </Button>
                    ) : null}
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
                ) : composing === proposal.id ? null : (
                  <p className="bw-watch__decided">
                    {proposal.status === "approved"
                      ? proposal.applied
                        ? proposal.decision_note?.startsWith("Appliquée automatiquement")
                          ? "Appliquée automatiquement (source officielle)"
                          : "Approuvée et appliquée"
                        : "Approuvée, sans modification automatique"
                      : "Refusée"}
                    {proposal.decided_at ? ` · ${dateTime(proposal.decided_at)}` : ""}
                    {["crossing", "schedule_fix", "new_departure"].includes(proposal.kind) &&
                    proposal.applied ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revert.isPending}
                        onClick={() => revert.mutate(proposal.id)}
                      >
                        <Undo2 size={15} aria-hidden /> Annuler la correction
                      </Button>
                    ) : null}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ChatModeration />
      <ChatDemoAdmin />
      <ChatStartersAdmin />

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

const MISSING_ACTUS_SQL =
  "Exécutez d'abord le script supabase/migrations/20261213100000_actus_grand_public.sql dans Supabase.";

/**
 * L'actualité telle que le public la lira : titre et texte relus (jamais la note de travail de la
 * veille), traversées concernées cliquables, et l'aperçu de l'article source ajouté à la publication.
 */
/** Heure de Paris (celle de l'équipe), au format d'un champ date et heure. */
function toLocalInput(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}

/** Corriger la date ou l'heure proposée (souvent « heure à confirmer ») avant de valider. */
function TimeFix({ proposal, onDone }: { proposal: Proposal; onDone: () => void }) {
  const [value, setValue] = useState(() => toLocalInput(proposal.proposed_value!));
  const changed = value !== toLocalInput(proposal.proposed_value!);
  const save = useMutation({
    mutationFn: async () => {
      // L'heure saisie est celle de Paris (même heure qu'Alger en hiver) : on retrouve son instant.
      const guess = new Date(`${value}:00Z`);
      const paris = new Date(toLocalInput(guess.toISOString()) + ":00Z");
      const instant = new Date(guess.getTime() - (paris.getTime() - guess.getTime()));
      const { error } = await db.rpc("bw_watch_adjust", {
        p_id: proposal.id,
        p_value: instant.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Heure corrigée : vérifiez puis approuvez");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <label className="bw-watch__timefix mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
      Corriger la date et l'heure (heure de Paris)
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!changed || save.isPending}
        onClick={() => save.mutate()}
      >
        Enregistrer
      </Button>
    </label>
  );
}

function NewsComposer({
  proposal,
  onCancel,
  onDone,
}: {
  proposal: Proposal;
  onCancel: () => void;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const item = proposal.bw_watch_items;
  const [title, setTitle] = useState(proposal.title);
  const [summary, setSummary] = useState(
    proposal.public_summary ?? (looksInternal(proposal.summary) ? "" : proposal.summary),
  );
  const [departures, setDepartures] = useState<string[]>(
    proposal.departure_ids?.length
      ? proposal.departure_ids
      : proposal.departure_id
        ? [proposal.departure_id]
        : [],
  );
  const routeLabel = (routeId: string) => {
    const route = routes.find((entry) => entry.id === routeId);
    const name = (id?: string) => ports.find((port) => port.id === id)?.name ?? "?";
    return route ? `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}` : "Trajet";
  };
  const internal = looksInternal(`${title} ${summary}`);
  const ready = title.trim().length >= 4 && summary.trim().length >= 20 && !internal;
  const save = useMutation({
    mutationFn: async () => {
      const text = { title: title.trim(), summary: summary.trim(), departure_ids: departures };
      if (proposal.kind === "flash") {
        const { error } = await db.rpc("bw_watch_decide", {
          p_id: proposal.id,
          p_decision: "approved",
          p_news: text,
        });
        if (error) throw new Error(/p_news|function/i.test(error.message) ? MISSING_ACTUS_SQL : error.message);
        return;
      }
      // Note d'article : l'actualité est créée ici, puis la proposition est approuvée.
      const row = {
        kind: "info",
        origin: item?.bw_watch_sources?.tier === "official" ? "official" : "media",
        title: text.title,
        summary: text.summary,
        source_name: item?.bw_watch_sources?.name ?? "",
        source_url: item?.url ?? null,
        vessel_id: proposal.vessel_id,
        company_ids: proposal.company_id ? [proposal.company_id] : [],
        departure_ids: text.departure_ids,
        published: true,
      };
      const preview = {
        source_title: item?.title?.slice(0, 200) ?? null,
        source_excerpt: item?.excerpt?.slice(0, 300) ?? null,
        source_published_at: item?.published_at ?? null,
      };
      let inserted = await flashClient.from("bw_news").insert({ ...row, ...preview });
      // Script pas encore exécuté : l'actualité part sans aperçu de la source.
      if (inserted.error && /source_(title|excerpt|published_at)/.test(inserted.error.message))
        inserted = await flashClient.from("bw_news").insert(row);
      if (inserted.error) throw inserted.error;
      if (proposal.status === "pending" || proposal.status === "standby") {
        const decided = await db.rpc("bw_watch_decide", { p_id: proposal.id, p_decision: "approved" });
        if (decided.error) throw decided.error;
      }
    },
    onSuccess: () => {
      toast.success("Publiée dans les actualités");
      void client.invalidateQueries({ queryKey: newsKey });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form
      className="bw-watch__composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) save.mutate();
      }}
    >
      <p className="bw-watch__composer-note">
        <strong>Texte lu par le public.</strong> Une ou deux phrases simples : ce qui se passe, qui est
        concerné, ce qu’il faut faire. Ni « à vérifier », ni identifiant : la note de la veille reste
        pour l’équipe.
      </p>
      <label>
        Titre
        <input maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Texte de l’actualité ({summary.length}/400)
        <textarea
          maxLength={400}
          rows={4}
          value={summary}
          placeholder="Ex. Algérie Ferries annonce le report d’une traversée vers Marseille. Les voyageurs concernés sont invités à vérifier leur départ auprès de la compagnie."
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>
      {internal ? (
        <p role="alert" className="bw-watch__composer-warn">
          Ce texte contient encore une note de travail (« à vérifier », « à contrôler » ou un
          identifiant) : réécrivez-le pour le public.
        </p>
      ) : null}
      <DeparturePicker value={departures} onChange={setDepartures} routeLabel={routeLabel} />
      {item?.title ? (
        <p className="bw-watch__composer-source">
          Aperçu ajouté sous l’actualité : « {item.title} » ({item.bw_watch_sources?.name ?? "source"}
          ), avec le lien vers l’article.
        </p>
      ) : null}
      <div className="bw-watch__actions">
        <Button size="sm" type="submit" disabled={!ready || save.isPending}>
          <Newspaper size={15} aria-hidden /> Publier
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
