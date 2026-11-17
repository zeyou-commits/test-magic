import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { canUseAdminTab } from "@/lib/admin/permissions";
import {
  ANNOUNCEMENT_REASONS,
  ANNOUNCEMENT_STATUS,
  announcementTitle,
  companyAccessKeys,
  companyAccessRequest,
  DELIVERY_LABEL,
  describeRequest,
  REQUEST_STATUS,
  type CompanyQueue,
  type DepartureSnapshot,
  type QueueAnnouncement,
  type QueueRequest,
} from "@/lib/company/access";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { ModerationCard, ModerationSection, moderationEmpty, StatusFilter } from "./ModerationCard";

const whenFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const when = (iso: string | null | undefined) => (iso ? whenFmt.format(new Date(iso)) : "—");
/** Couleur de la pastille d'état, reprise des cartes de modération. */
const PILL: Record<string, string> = {
  submitted: "pending",
  applied: "approved",
  approved: "approved",
  refused: "rejected",
  stale: "hidden",
  withdrawn: "hidden",
  draft: "hidden",
};

export function useCompanyQueue(enabled = true) {
  const { user, roles } = useAuth();
  return useQuery({
    queryKey: companyAccessKeys.queue(user?.id ?? ""),
    queryFn: () => companyAccessRequest<CompanyQueue>({ action: "queue" }),
    enabled: Boolean(user) && enabled && canUseAdminTab(roles, "companyRequests"),
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/** Badge du menu : demandes et annonces en attente de relecture. */
export function useCompanyQueueCount() {
  const queue = useCompanyQueue();
  return (queue.data?.pending.requests ?? 0) + (queue.data?.pending.announcements ?? 0);
}

type Filter = "pending" | "done";

/**
 * Rubrique « Demandes des compagnies » de l'espace équipe : les changements de traversée et les
 * annonces envoyés par les compagnies, à appliquer, valider ou refuser. Les urgents en premier.
 */
export function CompanyRequestsAdmin() {
  const { isAdmin } = useAuth();
  const queue = useCompanyQueue();
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const [filter, setFilter] = useState<Filter>("pending");
  const portName = (id: string | undefined) => ports.find((port) => port.id === id)?.name ?? "—";
  const lineOf = (routeId: string | null) => {
    const route = routes.find((item) => item.id === routeId);
    return route
      ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
      : "Traversée supprimée";
  };
  const vesselName = (id: string | null) =>
    vessels.find((vessel) => vessel.id === id)?.name ?? "navire à confirmer";

  if (queue.isPending) return <p className="bo-empty">Chargement des demandes…</p>;
  if (queue.isError)
    return (
      <div className="grid gap-2 p-3 text-sm">
        <p>{(queue.error as Error).message}</p>
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void queue.refetch()}
        >
          Réessayer
        </Button>
      </div>
    );
  const data = queue.data;
  const pick = <T extends { status: string }>(items: T[]) =>
    items.filter((item) =>
      filter === "pending" ? item.status === "submitted" : item.status !== "submitted",
    );
  const requests = pick(data.requests);
  const announcements = pick(data.announcements);
  const filterBar = (
    <StatusFilter
      label="Afficher"
      value={filter}
      onChange={setFilter}
      options={[
        { value: "pending", label: "À traiter" },
        { value: "done", label: "Traitées (30 jours)" },
      ]}
    />
  );

  return (
    <div className="grid gap-5">
      <ModerationSection
        title="Changements de traversée"
        count={data.pending.requests}
        hint="Proposés par les compagnies (niveau Opérations). Appliquer modifie la traversée et prévient automatiquement les voyageurs qui la suivent."
        toolbar={filterBar}
      >
        {requests.length ? (
          <ul className="bo-modlist">
            {requests.map((item) => (
              <RequestCard key={item.id} item={item} lineOf={lineOf} vesselName={vesselName} />
            ))}
          </ul>
        ) : (
          moderationEmpty(
            filter === "pending"
              ? "Aucune demande à traiter."
              : "Aucune demande traitée ces 30 derniers jours.",
          )
        )}
      </ModerationSection>
      <ModerationSection
        title="Annonces aux passagers"
        count={data.pending.announcements}
        hint={
          isAdmin
            ? "Signées « Information de [compagnie] », envoyées seulement aux personnes qui suivent la traversée. Vous voyez le nombre de destinataires avant de valider."
            : "La validation des annonces est réservée aux administrateurs. Vous pouvez les lire."
        }
      >
        {announcements.length ? (
          <ul className="bo-modlist">
            {announcements.map((item) => (
              <AnnouncementCard key={item.id} item={item} lineOf={lineOf} canDecide={isAdmin} />
            ))}
          </ul>
        ) : (
          moderationEmpty(
            filter === "pending"
              ? "Aucune annonce à relire."
              : "Aucune annonce traitée ces 30 derniers jours.",
          )
        )}
      </ModerationSection>
    </div>
  );
}

function useDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      companyAccessRequest<Record<string, unknown>>(input),
    onSettled: () => void client.invalidateQueries({ queryKey: ["company-access"] }),
  });
}

function RefuseForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="grid w-full gap-2">
      <Textarea
        value={note}
        maxLength={500}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Motif, visible par la compagnie (obligatoire)"
        aria-label="Motif du refus"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || note.trim().length < 3}
          onClick={() => onConfirm(note.trim())}
        >
          Confirmer le refus
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function snapshotLine(
  snapshot: DepartureSnapshot | null,
  vesselName: (id: string | null) => string,
) {
  if (!snapshot) return "traversée supprimée";
  const state =
    snapshot.status === "cancelled"
      ? " · annulée"
      : snapshot.status === "modified"
        ? " · modifiée"
        : "";
  return `départ ${when(snapshot.departure_at)}${snapshot.arrival_at ? `, arrivée ${when(snapshot.arrival_at)}` : ""} · ${vesselName(snapshot.vessel_id)}${state}`;
}

function RequestCard({
  item,
  lineOf,
  vesselName,
}: {
  item: QueueRequest;
  lineOf: (routeId: string | null) => string;
  vesselName: (id: string | null) => string;
}) {
  const decide = useDecision();
  const [refusing, setRefusing] = useState(false);
  const open = item.status === "submitted";
  const run = (decision: "apply" | "refuse", note?: string) =>
    decide.mutate(
      { action: "request_decide", requestId: item.id, decision, ...(note ? { note } : {}) },
      {
        onSuccess: (data) => {
          const result = data["result"];
          if (result === "stale")
            toast.warning(
              "La traversée a changé ou est passée : demande classée « dépassée », rien n'a été modifié.",
            );
          else
            toast.success(
              result === "applied"
                ? "Changement appliqué. Les voyageurs qui suivent la traversée sont prévenus."
                : "Demande refusée.",
            );
          setRefusing(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  return (
    <ModerationCard
      title={`${item.companyName} · ${describeRequest(item.kind, item.proposed, vesselName, when)}`}
      status={PILL[item.status]}
      statusLabel={REQUEST_STATUS[item.status].label}
      meta={
        <>
          {item.urgent && open ? <b className="text-destructive">Urgent · </b> : null}
          {lineOf(item.routeId)} · envoyée {when(item.submittedAt)}
          {item.author ? ` par ${item.author}` : ""}
        </>
      }
      actions={
        open && !refusing ? (
          <>
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Appliquer ce changement à la traversée ?\n\n${item.companyName} · ${describeRequest(item.kind, item.proposed, vesselName, when)}\n\nLes voyageurs qui la suivent seront prévenus.`,
                  )
                )
                  run("apply");
              }}
            >
              <Check className="size-4" aria-hidden /> Appliquer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => setRefusing(true)}
            >
              <X className="size-4" aria-hidden /> Refuser
            </Button>
          </>
        ) : null
      }
    >
      <p className="text-sm">
        <span className="text-muted-foreground">Publié actuellement : </span>
        {snapshotLine(item.current, vesselName)}
      </p>
      {item.stale ? (
        <p
          className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
          role="note"
        >
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
          La traversée a changé depuis l'envoi ({snapshotLine(item.snapshot, vesselName)}), ou elle
          est passée. « Appliquer » classera la demande comme dépassée, sans rien modifier.
        </p>
      ) : null}
      {item.message ? <p className="text-sm">« {item.message} »</p> : null}
      {item.decisionNote ? (
        <p className="text-xs text-muted-foreground">Réponse : {item.decisionNote}</p>
      ) : null}
      {refusing ? (
        <RefuseForm
          pending={decide.isPending}
          onCancel={() => setRefusing(false)}
          onConfirm={(note) => run("refuse", note)}
        />
      ) : null}
    </ModerationCard>
  );
}

function AnnouncementCard({
  item,
  lineOf,
  canDecide,
}: {
  item: QueueAnnouncement;
  lineOf: (routeId: string | null) => string;
  canDecide: boolean;
}) {
  const decide = useDecision();
  const [refusing, setRefusing] = useState(false);
  const [checked, setChecked] = useState<number | null>(null);
  const open = item.status === "submitted";
  const check = useMutation({
    mutationFn: () =>
      companyAccessRequest<{ reachable: number }>({ action: "announce_check", id: item.id }),
    onSuccess: (data) => setChecked(data.reachable),
    onError: (error: Error) => toast.error(error.message),
  });
  const approve = () =>
    decide.mutate(
      { action: "announce_decide", id: item.id, decision: "approve", confirmCount: checked },
      {
        onSuccess: (data) => {
          if (data["stale"])
            toast.warning(
              "La traversée est passée : annonce classée « dépassée », rien n'a été envoyé.",
            );
          else if (data["already"])
            toast.info("Cette annonce avait déjà été validée : rien n'a été renvoyé.");
          else if (data["sentNow"] === false)
            toast.warning(
              "Annonce validée. L'envoi immédiat a échoué : l'envoi programmé la reprendra.",
            );
          else
            toast.success(`Annonce validée et envoyée à ${String(data["reachable"])} personne(s).`);
          setChecked(null);
        },
        onError: (error) => {
          toast.error(error.message);
          setChecked(null);
        },
      },
    );
  const refuse = (note: string) =>
    decide.mutate(
      { action: "announce_decide", id: item.id, decision: "refuse", note },
      {
        onSuccess: () => {
          toast.success("Annonce refusée.");
          setRefusing(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );

  return (
    <ModerationCard
      title={`${item.companyName} · ${ANNOUNCEMENT_REASONS[item.reason]}`}
      status={PILL[item.status]}
      statusLabel={ANNOUNCEMENT_STATUS[item.status].label}
      meta={
        <>
          {item.urgent && open ? <b className="text-destructive">Urgent · </b> : null}
          {lineOf(item.routeId)} · départ {when(item.departureAt)} · envoyée{" "}
          {when(item.submittedAt)}
          {item.author ? ` par ${item.author}` : ""}
        </>
      }
      actions={
        open && canDecide && !refusing && checked === null ? (
          <>
            <Button
              size="sm"
              disabled={check.isPending || item.stale}
              onClick={() => check.mutate()}
            >
              <Users className="size-4" aria-hidden />{" "}
              {check.isPending ? "Calcul…" : "Vérifier et valider"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => setRefusing(true)}
            >
              <X className="size-4" aria-hidden /> Refuser
            </Button>
          </>
        ) : null
      }
    >
      <div className="rounded-lg border border-border bg-background p-2 text-sm">
        <p className="text-xs font-semibold">{announcementTitle(item.companyName)}</p>
        <p>{item.body}</p>
      </div>
      {open && item.previewCount !== null ? (
        <p className="text-xs text-muted-foreground">
          {item.previewCount} personne(s) à prévenir au moment de l'envoi par la compagnie.
        </p>
      ) : null}
      {item.stale ? (
        <p className="text-xs text-amber-900">
          La traversée est passée : l'annonce ne peut plus partir. Refusez-la ou laissez-la.
        </p>
      ) : null}
      {checked !== null ? (
        checked > 0 ? (
          <div
            className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm"
            role="status"
          >
            <p className="font-semibold">
              {checked} personne{checked > 1 ? "s" : ""} recevront ce message maintenant.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={approve}>
                <Send className="size-4" aria-hidden /> Confirmer l'envoi
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChecked(null)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm" role="status">
            Personne ne suit cette traversée pour l'instant : rien ne peut partir.{" "}
            <button type="button" className="underline" onClick={() => setChecked(null)}>
              Fermer
            </button>
          </p>
        )
      ) : null}
      {item.status === "approved" ? <DeliveryLine item={item} /> : null}
      {item.decisionNote ? (
        <p className="text-xs text-muted-foreground">Réponse : {item.decisionNote}</p>
      ) : null}
      {refusing ? (
        <RefuseForm
          pending={decide.isPending}
          onCancel={() => setRefusing(false)}
          onConfirm={refuse}
        />
      ) : null}
    </ModerationCard>
  );
}

/** Suivi d'envoi : dans les comptes, puis sur les téléphones, avec les échecs à part. */
function DeliveryLine({ item }: { item: QueueAnnouncement }) {
  const parts = [DELIVERY_LABEL[item.delivery ?? ""] ?? "Envoi"];
  if (item.inbox !== undefined && item.inbox !== null)
    parts.push(`${item.inbox} compte(s) prévenu(s)`);
  if (item.pushSent !== undefined && item.pushSent !== null)
    parts.push(`${item.pushSent} notification(s) téléphone parties`);
  return (
    <p className="text-xs text-muted-foreground">
      {parts.join(" · ")}
      {item.pushFailed ? (
        <b className="text-destructive"> · {item.pushFailed} notification(s) téléphone en échec</b>
      ) : null}
      {item.delivery === "failed" && item.lastError ? (
        <b className="text-destructive"> · {item.lastError}</b>
      ) : null}
    </p>
  );
}
