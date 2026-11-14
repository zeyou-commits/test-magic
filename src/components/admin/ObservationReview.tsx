import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CircleHelp, Clock, MapPin, Smartphone, User, Users } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { openTravellerProfile, type TravellerCard } from "@/lib/community/travellers";
import { serviceLabel, situationOf } from "@/lib/ferry/community";

// Table et fonction du script « moderation_observations_contexte », pas encore dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type Observation = {
  id: string;
  user_id?: string;
  vessel_id: string | null;
  port_id?: string | null;
  departure_id: string | null;
  category: string;
  detail: string | null;
  delay_minutes?: number | null;
  reason: string;
  status: string;
  created_at: string;
  handled_at?: string | null;
  handled_by?: string | null;
  decision?: "published" | "handled" | "dismissed" | null;
};

type Counts = {
  total?: number;
  published?: number;
  handled?: number;
  dismissed?: number;
  pending?: number;
  on_site?: number;
  validated?: number;
  confirmed?: number;
  denied?: number;
};
type Nearby = {
  kind: "alert" | "observation";
  category: string;
  detail: string | null;
  delay_minutes: number | null;
  created_at: string;
  same_author: boolean;
  on_site: boolean;
  confirmations: number;
  denials: number;
  validated: boolean;
  status: string;
};
export type ObservationContext = {
  author: { card: TravellerCard; joined_at: string; observations: Counts; alerts: Counts };
  device: {
    platform: "android" | "ios" | "desktop" | null;
    installed: boolean | null;
    permission: string | null;
    online: boolean | null;
    attempts: number;
    timeouts: number;
    denied: number;
    unavailable: number;
    silent: number;
    unsupported: number;
    success: number;
    logs: number;
  } | null;
  crossing: {
    departure_at: string;
    arrival_at: string | null;
    status: string;
    from: string | null;
    to: string | null;
    vessel: string | null;
    reported_delay: number | null;
  } | null;
  ais: { speed_knots: number | null; reported_at: string | null; status: string | null } | null;
  nearby: Nearby[];
  moderator: TravellerCard | null;
  /** Durée d'affichage en minutes, celle que le serveur appliquera (précision, sinon situation). */
  lifetime?: number | null;
};

/** Contexte des observations (équipe) ; `undefined` tant que le script n'est pas appliqué. */
export function useObservationContext(ids: string[]) {
  return useQuery({
    queryKey: ["admin", "anomaly-context", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_anomaly_context_staff", {
        p_ids: ids.slice(0, 100),
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as Record<string, ObservationContext>;
    },
  });
}

/* ---------- Textes ---------- */

const time = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const hour = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function ago(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `il y a ${hours} h${minutes % 60 >= 5 && hours < 6 ? ` ${String(minutes % 60).padStart(2, "0")}` : ""}`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
}

/** « File d'attente », « Accès au port · bouchon pour entrer »… jamais le code brut. */
export function situationText(category: string, detail: string | null, delay?: number | null) {
  if (category === "service") return serviceLabel(detail) ?? situationOf("service").label;
  const situation = situationOf(category);
  const option = situation.options?.find(
    (o) => o.code === detail || (o.delay && o.delay === delay),
  );
  return {
    situation: situation.label,
    precision: option?.label ?? (detail ? detail : delay ? `${delay} min de retard` : null),
  };
}
const shortSituation = (category: string, detail: string | null, delay?: number | null) => {
  const text = situationText(category, detail, delay);
  if (typeof text === "string") return text;
  return text.precision ? `${text.situation} · ${text.precision.toLowerCase()}` : text.situation;
};

/** La raison de la mise en attente, en clair, avec ce qu'on attendait. */
function reasonText(item: Observation, context: ObservationContext | undefined) {
  const c = context?.crossing;
  const crossing = c
    ? `départ prévu ${time(c.departure_at)}${c.arrival_at ? `, arrivée ${time(c.arrival_at)}` : ""}`
    : null;
  switch (item.reason) {
    case "position indisponible : à vérifier":
      return {
        title: "position introuvable",
        text: "Le téléphone n'a pas donné sa position à l'envoi, donc rien ne prouve que le voyageur était sur place. L'information elle-même n'a rien d'incohérent.",
      };
    case "traversée non identifiée":
      return {
        title: "traversée non choisie",
        text: "Le voyageur n'a pas indiqué de quelle traversée il parle.",
      };
    case "traversée ou affectation du bateau à vérifier":
      return {
        title: "traversée incohérente",
        text: `La traversée choisie n'est pas (ou plus) assurée par ce navire, ou elle est annulée.${crossing ? ` Attendu : ${crossing}.` : ""}`,
      };
    case "embarquement hors de la période prévue":
      return {
        title: "embarquement hors horaire",
        text: `L'embarquement est attendu entre 6 h avant le départ et 5 min après.${crossing ? ` Ici : ${crossing}.` : ""}`,
      };
    case "embarquement signalé alors que le bateau navigue":
      return {
        title: "contredit par l'AIS",
        text: `L'embarquement est signalé alors que le navire avançait à ${context?.ais?.speed_knots != null ? context.ais.speed_knots.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "5 ou plus de"} nœuds${context?.ais?.reported_at ? ` (position AIS de ${hour(context.ais.reported_at)})` : ""}. Attendu : navire à quai (moins de 5 nœuds).`,
      };
    case "débarquement hors de la période prévue":
      return {
        title: "débarquement hors horaire",
        text: `Le débarquement est attendu de 30 min avant l'arrivée à 2 h après.${crossing ? ` Ici : ${crossing}.` : ""}`,
      };
    case "traversée non en cours ou éloignée":
      return {
        title: "hors de la période de la traversée",
        text: `Ce signalement n'est accepté que de 24 h avant le départ à 2 h après l'arrivée.${crossing ? ` Ici : ${crossing}.` : ""}`,
      };
    default:
      return { title: "à vérifier", text: item.reason };
  }
}

/** Ce que le téléphone a répondu à la demande de position (journal de diagnostic, sans coordonnées). */
function deviceText(device: NonNullable<ObservationContext["device"]>) {
  const names = { android: "Android", ios: "iPhone", desktop: "Ordinateur" } as const;
  const platform = device.platform ? names[device.platform] : "Appareil inconnu";
  const support = device.installed
    ? device.platform === "android"
      ? "appli installée (Play Store ou écran d'accueil)"
      : "appli installée sur l'écran d'accueil"
    : "navigateur web";
  const why: string[] = [];
  if (device.denied) why.push("le voyageur a refusé la localisation");
  if (device.permission === "prompt" && !device.denied)
    why.push("autorisation de localisation jamais accordée");
  if (device.permission === "denied") why.push("localisation bloquée dans les réglages");
  if (device.timeouts)
    why.push(
      `${device.timeouts} demande${device.timeouts > 1 ? "s" : ""} expirée${device.timeouts > 1 ? "s" : ""} sans réponse du GPS`,
    );
  if (device.silent) why.push("le téléphone n'a jamais répondu");
  if (device.unavailable) why.push("position indisponible (GPS coupé ou à l'intérieur)");
  if (device.unsupported) why.push("localisation non prise en charge par ce navigateur");
  if (device.online === false) why.push("hors connexion");
  return { source: `${platform} · ${support}`, why, attempts: device.attempts };
}

/* ---------- Carte ---------- */

const decisionHelp = (lifetimeEnd: Date) => [
  {
    label: "Valider et publier",
    text: `affiche l'information sur la carte, au nom du voyageur, marquée «\u00a0validée par l'équipe\u00a0», jusqu'à ${hour(lifetimeEnd)}. Les abonnés du lieu peuvent être prévenus.`,
  },
  {
    label: "Traité",
    text: "retire de la file sans rien publier : déjà pris en compte, corrigé à la main ou plus d'actualité.",
  },
  {
    label: "Écarter",
    text: "information jugée fausse ou inutile : rien n'est publié et le refus compte dans l'historique du voyageur.",
  },
];

export function ObservationCard({
  item,
  place,
  context,
  contextMissing,
  fallbackHistory,
  busy,
  canPublish,
  onPublish,
  onTriage,
}: {
  item: Observation;
  place: string;
  context: ObservationContext | undefined;
  contextMissing: boolean;
  fallbackHistory?: Counts | undefined;
  busy: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onTriage: (status: "handled" | "dismissed") => void;
}) {
  const [help, setHelp] = useState(false);
  const text = situationText(item.category, item.detail, item.delay_minutes);
  const situation = typeof text === "string" ? text : text.situation;
  const precision = typeof text === "string" ? null : text.precision;
  const lifetime = context?.lifetime ?? situationOf(item.category).lifetime;
  const created = new Date(item.created_at);
  const end = new Date(created.getTime() + lifetime * 60_000);
  const stale = end.getTime() <= Date.now() + 5 * 60_000;
  const reason = reasonText(item, context);
  const device = context?.device?.logs ? deviceText(context.device) : null;
  const author = context?.author;
  const history = author?.observations ?? fallbackHistory;
  const alerts = author?.alerts;
  const past = (history?.total ?? 0) + (alerts?.total ?? 0);
  const nearby = context?.nearby ?? [];
  const agreeing = nearby.filter((n) => n.category === item.category && !n.same_author);

  return (
    <li className="rounded-xl border bg-card p-4 text-sm">
      {/* QUOI + QUAND, en une ligne lisible */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden /> {place}
          </p>
          <h3 className="text-base font-semibold leading-snug">
            {situation}
            {precision ? <span className="font-normal"> · {precision}</span> : null}
          </h3>
        </div>
        <p
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          title={created.toLocaleString("fr-FR")}
        >
          <Clock className="size-3.5" aria-hidden />
          <span>
            <b className="text-foreground">{ago(item.created_at)}</b> · {time(item.created_at)}
          </span>
        </p>
      </div>

      {stale ? (
        <p
          role="note"
          className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {`Trop ancienne pour être publiée : une info «\u00a0${situation.toLowerCase()}\u00a0» ne reste affichée que ${
              lifetime >= 60
                ? `${Math.floor(lifetime / 60)} h${lifetime % 60 ? ` ${lifetime % 60}` : ""}`
                : `${lifetime} min`
            } (jusqu'à ${hour(end)}). La situation a probablement changé : choisissez «\u00a0Traité\u00a0» ou «\u00a0Écarter\u00a0».`}
          </span>
        </p>
      ) : null}

      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        {/* QUOI */}
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quoi
          </dt>
          <dd className="space-y-1">
            {precision ? null : (
              <p className="text-muted-foreground">Aucune précision choisie (niveau, durée…).</p>
            )}
            {context?.crossing ? (
              <p>
                <span className="text-muted-foreground">Traversée :</span> {context.crossing.from} →{" "}
                {context.crossing.to}, {time(context.crossing.departure_at)}
                {context.crossing.vessel ? ` · ${context.crossing.vessel}` : ""}
                {context.crossing.status === "cancelled" ? " · annulée" : ""}
              </p>
            ) : item.port_id ? (
              <p className="text-muted-foreground">Signalement de port, sans traversée associée.</p>
            ) : null}
            <p className="text-muted-foreground">
              Sans commentaire ni photo (choix dans une liste).
            </p>
            {item.departure_id ? (
              <a
                className="inline-block underline"
                href={`/?select=departure&id=${item.departure_id}`}
              >
                Voir la traversée
              </a>
            ) : null}
          </dd>
        </div>

        {/* QUI */}
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qui
          </dt>
          <dd className="space-y-1">
            {author ? (
              <div className="flex items-center gap-2">
                <TravellerAvatar card={author.card} size={32} static />
                <div className="min-w-0">
                  <button
                    type="button"
                    className="font-semibold underline-offset-2 hover:underline"
                    onClick={() => openTravellerProfile(author.card.handle)}
                  >
                    {author.card.pseudo}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Compte voyageur · inscrit {ago(author.joined_at)} (
                    {new Date(author.joined_at).toLocaleDateString("fr-FR")})
                  </p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1.5">
                <User className="size-4" aria-hidden /> Compte voyageur connecté (signalement
                impossible sans compte)
              </p>
            )}
            {history || alerts ? (
              past === 0 ? (
                <p>
                  <b>Première contribution</b> : aucun signalement avant celui-ci.
                </p>
              ) : (
                <div className="space-y-0.5 text-[13px]">
                  {alerts?.total ? (
                    <p>
                      {alerts.total} signalement{alerts.total > 1 ? "s" : ""} publié
                      {alerts.total > 1 ? "s" : ""}
                      {alerts.on_site
                        ? `, dont ${alerts.on_site} vérifié${alerts.on_site > 1 ? "s" : ""} sur place`
                        : ""}
                      {alerts.confirmed
                        ? ` · ${alerts.confirmed} confirmé${alerts.confirmed > 1 ? "s" : ""} par d'autres`
                        : ""}
                      {alerts.denied ? (
                        <b className="text-red-700 dark:text-red-400">
                          {" "}
                          · {alerts.denied} contesté{alerts.denied > 1 ? "s" : ""}
                        </b>
                      ) : null}
                    </p>
                  ) : null}
                  {history?.total ? (
                    <p>
                      {history.total} autre{history.total > 1 ? "s" : ""} observation
                      {history.total > 1 ? "s" : ""} mise{history.total > 1 ? "s" : ""} en attente
                      {history.published
                        ? ` · ${history.published} publiée${history.published > 1 ? "s" : ""}`
                        : ""}
                      {history.handled
                        ? ` · ${history.handled} traitée${history.handled > 1 ? "s" : ""}`
                        : ""}
                      {history.dismissed ? (
                        <b className="text-red-700 dark:text-red-400">
                          {" "}
                          · {history.dismissed} écartée{history.dismissed > 1 ? "s" : ""}
                        </b>
                      ) : null}
                      {history.pending ? ` · ${history.pending} encore en attente` : ""}
                    </p>
                  ) : null}
                </div>
              )
            ) : null}
          </dd>
        </div>

        {/* COMMENT */}
        <div className="rounded-lg bg-muted/50 p-3 md:col-span-2">
          <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Comment
          </dt>
          <dd className="space-y-2">
            <p>
              <b>Mis en attente : {reason.title}.</b> {reason.text}
            </p>
            {device ? (
              <p className="flex gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <b>{device.source}</b>
                  {device.why.length ? ` · ${device.why.join(" ; ")}` : ""}
                  {device.attempts
                    ? ` (${device.attempts} essai${device.attempts > 1 ? "s" : ""} de localisation)`
                    : ""}
                  .
                </span>
              </p>
            ) : context ? (
              <p className="text-muted-foreground">
                Aucun journal de l'appareil pour ce signalement.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
              {context ? (
                nearby.length ? (
                  <div>
                    <p>
                      <b>
                        {agreeing.length
                          ? agreeing.length > 1
                            ? `${agreeing.length} autres signalements de la même situation`
                            : "1 autre signalement de la même situation"
                          : "Autres signalements au même endroit"}
                      </b>{" "}
                      (de {hour(new Date(created.getTime() - 3 * 3_600_000))} à{" "}
                      {hour(new Date(created.getTime() + 3 * 3_600_000))}) :
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px]">
                      {nearby.slice(0, 6).map((n, index) => (
                        <li key={index}>
                          {hour(n.created_at)} ·{" "}
                          {shortSituation(n.category, n.detail, n.delay_minutes)}
                          {n.same_author ? " · même voyageur" : ""}
                          {n.kind === "observation"
                            ? " · en attente aussi"
                            : n.on_site
                              ? " · sur place"
                              : ""}
                          {n.confirmations
                            ? ` · ${n.confirmations} confirmation${n.confirmations > 1 ? "s" : ""}`
                            : ""}
                          {n.denials ? ` · ${n.denials} «\u00a0plus le cas\u00a0»` : ""}
                          {n.validated ? " · validé par l'équipe" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>
                    Aucun autre signalement à cet endroit de{" "}
                    {hour(new Date(created.getTime() - 3 * 3_600_000))} à{" "}
                    {hour(new Date(created.getTime() + 3 * 3_600_000))} : rien ne confirme ni ne
                    contredit.
                  </p>
                )
              ) : (
                <p className="text-muted-foreground">
                  {contextMissing
                    ? "Appareil, historique et signalements voisins : disponibles après le script «\u00a0moderation_observations_contexte\u00a0»."
                    : "Chargement du contexte…"}
                </p>
              )}
            </div>
          </dd>
        </div>
      </dl>

      {/* Décision */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !canPublish || stale} onClick={onPublish}>
          Valider et publier
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onTriage("handled")}>
          Traité
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onTriage("dismissed")}>
          Écarter
        </Button>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={help}
          onClick={() => setHelp((open) => !open)}
        >
          <CircleHelp className="size-4" aria-hidden /> Que fait chaque bouton ?
        </button>
      </div>
      {help ? (
        <ul className="mt-2 space-y-1 rounded-lg border p-3 text-[13px]">
          {decisionHelp(end).map((entry) => (
            <li key={entry.label}>
              <b>{entry.label}</b> : {entry.text}
            </li>
          ))}
          <li className="text-muted-foreground">
            Chaque décision est enregistrée : qui a modéré, quand, et laquelle.
          </li>
        </ul>
      ) : null}
      {!canPublish && !stale ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Publication impossible : aucune traversée n'est associée à ce navire.
        </p>
      ) : null}
    </li>
  );
}

/* ---------- Trace des décisions ---------- */

const decisionLabel = (row: Observation) =>
  row.decision === "published"
    ? "Validée et publiée"
    : row.status === "dismissed"
      ? "Écartée"
      : "Traitée sans publication";

export function ObservationHistory({
  rows,
  placeOf,
  context,
}: {
  rows: Observation[];
  placeOf: (row: Observation) => string;
  context: Record<string, ObservationContext> | undefined;
}) {
  if (!rows.length) return null;
  return (
    <details className="mt-4 rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Décisions récentes · {rows.length}</summary>
      <ul className="mt-2 divide-y">
        {rows.map((row) => {
          const moderator = context?.[row.id]?.moderator;
          return (
            <li key={row.id} className="py-2">
              <p>
                <b>{decisionLabel(row)}</b> · {placeOf(row)} ·{" "}
                {shortSituation(row.category, row.detail, row.delay_minutes)}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.handled_at
                  ? `${time(row.handled_at)} (${ago(row.handled_at)})`
                  : "date inconnue"}{" "}
                ·{" "}
                {moderator
                  ? `par ${moderator.pseudo}`
                  : row.handled_by === undefined
                    ? "modérateur non enregistré avant le script"
                    : "modérateur non enregistré"}{" "}
                · signalé {time(row.created_at)}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
