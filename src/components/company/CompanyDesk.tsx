import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Megaphone, PenLine, Send, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  ANNOUNCEMENT_REASONS,
  ANNOUNCEMENT_STATUS,
  announcementTitle,
  companyAccessKeys,
  companyAccessRequest,
  DELIVERY_LABEL,
  describeRequest,
  EVENT_LABELS,
  REQUEST_KINDS,
  REQUEST_STATUS,
  type AnnouncementReason,
  type CompanyActivity,
  type CompanyAnnouncement,
  type CompanyRequest,
  type RequestKind,
  type RequestProposal,
} from "@/lib/company/access";
import { dateKeyInZone, wallTimeInZone, zoneLabel, zonedTimeToUtc } from "@/lib/ferry/time";
import type { Departure } from "@/lib/ferry/types";

/** Ce que la page « Espace compagnie » sait déjà afficher, partagé avec ces rubriques. */
export type DeskContext = {
  companyId: string;
  companyName: string;
  /** Niveau Opérations, accès vérifié par le serveur. L'équipe BledWay ne soumet rien ici. */
  canAct: boolean;
  departures: Departure[];
  fleet: { id: string; name: string }[];
  lineOf: (routeId: string) => string;
  vesselName: (id: string | null) => string;
  /** Fuseaux du port de départ et d'arrivée d'une ligne. */
  zonesOf: (routeId: string) => { departure: string; arrival: string };
  /** Date et heure en clair, comme le reste de l'espace. */
  when: (iso: string) => string;
};

const httpStatus = (error: unknown) => (error as { status?: number } | null)?.status;

export function useCompanyActivity(companyId: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: companyAccessKeys.activity(user?.id ?? "", companyId),
    queryFn: () => companyAccessRequest<CompanyActivity>({ action: "activity", companyId }),
    enabled: Boolean(user) && enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/** Après une action : relit l'activité, et l'accès si le serveur a refusé (accès changé). */
function useRefresh() {
  const client = useQueryClient();
  const { user } = useAuth();
  return (error?: unknown) => {
    void client.invalidateQueries({ queryKey: ["company-access", user?.id ?? "", "activity"] });
    if (httpStatus(error) === 403)
      void client.invalidateQueries({ queryKey: companyAccessKeys.me(user?.id ?? "") });
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function History({ activity, itemId }: { activity: CompanyActivity | undefined; itemId: string }) {
  const events = (activity?.events ?? []).filter((event) => event.itemId === itemId);
  if (!events.length) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Historique</summary>
      <ul className="mt-1 grid gap-0.5">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            {EVENT_LABELS[event.action] ?? event.action} · {event.by} ·{" "}
            {new Date(event.at).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Paris",
            })}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Demande de changement d'une traversée ───────────────────────────────────────────────────

export function ChangeRequestForm({
  ctx,
  departure,
  draft,
  onClose,
}: {
  ctx: DeskContext;
  departure: Departure;
  draft?: CompanyRequest;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const zones = ctx.zonesOf(departure.route_id);
  const [kind, setKind] = useState<RequestKind>(draft?.kind ?? "delay");
  const [minutes, setMinutes] = useState(String(draft?.proposed.minutes ?? 30));
  const [vesselId, setVesselId] = useState(draft?.proposed.vessel_id ?? "");
  const startIso = draft?.proposed.departure_at ?? departure.departure_at;
  const [day, setDay] = useState(dateKeyInZone(startIso, zones.departure));
  const [hour, setHour] = useState(wallTimeInZone(startIso, zones.departure));
  const arrivalIso = draft?.proposed.arrival_at ?? null;
  const [arrivalDay, setArrivalDay] = useState(
    arrivalIso ? dateKeyInZone(arrivalIso, zones.arrival) : "",
  );
  const [arrivalHour, setArrivalHour] = useState(
    arrivalIso ? wallTimeInZone(arrivalIso, zones.arrival) : "",
  );
  const [message, setMessage] = useState(draft?.message ?? "");
  const [urgent, setUrgent] = useState(draft?.urgent ?? false);
  const otherVessels = ctx.fleet.filter((vessel) => vessel.id !== departure.vessel_id);

  const proposal = (): RequestProposal | string => {
    if (kind === "delay") {
      const value = Number(minutes);
      if (!Number.isInteger(value) || value < 5 || value > 1440)
        return "Indiquez un retard entre 5 et 1 440 minutes (24 h).";
      return { minutes: value };
    }
    if (kind === "vessel") return vesselId ? { vessel_id: vesselId } : "Choisissez le navire.";
    if (kind === "time") {
      if (!day || !hour) return "Indiquez la nouvelle date et l'heure de départ.";
      const start = zonedTimeToUtc(day, hour, zones.departure);
      const end =
        arrivalDay && arrivalHour ? zonedTimeToUtc(arrivalDay, arrivalHour, zones.arrival) : null;
      if (start.getTime() <= Date.now()) return "Le nouvel horaire doit être dans le futur.";
      if (start.toISOString() === new Date(departure.departure_at).toISOString())
        return "Cet horaire est déjà celui publié.";
      if (Math.abs(start.getTime() - new Date(departure.departure_at).getTime()) > 7 * 86_400_000)
        return "Au-delà de 7 jours d'écart, signalez plutôt une annulation.";
      if (end && end <= start) return "L'arrivée doit suivre le départ.";
      return { departure_at: start.toISOString(), arrival_at: end ? end.toISOString() : null };
    }
    return {};
  };

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const proposed = proposal();
      if (typeof proposed === "string") throw new Error(proposed);
      return companyAccessRequest<{ id: string; status: string }>({
        action: "request_save",
        ...(draft ? { requestId: draft.id } : {}),
        departureId: departure.id,
        kind,
        proposed,
        message: message.trim() || undefined,
        urgent,
        submit,
      });
    },
    onSuccess: (data) => {
      toast.success(
        data.status === "submitted"
          ? "Demande envoyée. BledWay la relit avant de l'appliquer."
          : "Brouillon enregistré.",
      );
      refresh();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(true);
      }}
      aria-label="Signaler un changement"
    >
      <p className="text-sm">
        <strong>{ctx.lineOf(departure.route_id)}</strong>
        <span className="block text-xs text-muted-foreground">
          {ctx.when(departure.departure_at)} · {ctx.vesselName(departure.vessel_id)}
        </span>
      </p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-semibold">Ce qui change</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(REQUEST_KINDS) as RequestKind[]).map((option) => (
            <label
              key={option}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
              />
              {REQUEST_KINDS[option].label}
            </label>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{REQUEST_KINDS[kind].hint}</span>
      </fieldset>

      {kind === "delay" ? (
        <Field label="Retard, en minutes" hint="Entre 5 et 1 440 minutes.">
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={1440}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className="max-w-40"
          />
        </Field>
      ) : kind === "vessel" ? (
        otherVessels.length ? (
          <Field label="Navire qui assure la traversée">
            <select
              className={selectClass}
              value={vesselId}
              onChange={(event) => setVesselId(event.target.value)}
            >
              <option value="">Choisir un navire</option>
              {otherVessels.map((vessel) => (
                <option key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun autre navire en service dans votre flotte. Écrivez le nom du navire dans le
            message : BledWay vérifiera.
          </p>
        )
      ) : kind === "time" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Nouveau départ (${zoneLabel(zones.departure)})`}>
            <div className="flex gap-2">
              <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
              <Input
                type="time"
                value={hour}
                onChange={(event) => setHour(event.target.value)}
                className="max-w-32"
              />
            </div>
          </Field>
          <Field
            label={`Nouvelle arrivée (${zoneLabel(zones.arrival)})`}
            hint="Facultatif. Sans arrivée, la durée de la traversée reste la même."
          >
            <div className="flex gap-2">
              <Input
                type="date"
                value={arrivalDay}
                onChange={(event) => setArrivalDay(event.target.value)}
              />
              <Input
                type="time"
                value={arrivalHour}
                onChange={(event) => setArrivalHour(event.target.value)}
                className="max-w-32"
              />
            </div>
          </Field>
        </div>
      ) : null}

      <Field label="Message pour BledWay" hint="Facultatif. 500 caractères au plus.">
        <Textarea
          value={message}
          maxLength={500}
          rows={2}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ex. : avarie technique, nouveau créneau confirmé par le port."
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(event) => setUrgent(event.target.checked)}
        />
        Urgent : à relire en priorité
      </label>
      <p className="text-xs text-muted-foreground">
        BledWay relit votre demande puis l'applique. Une fois appliquée, les voyageurs qui suivent
        cette traversée sont prévenus automatiquement.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          <Send className="size-4" aria-hidden /> Envoyer à BledWay
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
        >
          Enregistrer en brouillon
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </form>
  );
}

// ─── Rubrique « Mes demandes » ────────────────────────────────────────────────────────────────

export function CompanyRequestsTab({ ctx }: { ctx: DeskContext }) {
  const activity = useCompanyActivity(ctx.companyId);
  const refresh = useRefresh();
  const [editing, setEditing] = useState<CompanyRequest | null>(null);
  const withdraw = useMutation({
    mutationFn: (requestId: string) =>
      companyAccessRequest({ action: "request_withdraw", requestId }),
    onSuccess: () => {
      toast.success("Demande retirée.");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const editingDeparture = editing
    ? ctx.departures.find((item) => item.id === editing.departureId)
    : undefined;
  const items = activity.data?.requests ?? [];
  const waiting = items.filter((item) => item.status === "submitted").length;

  return (
    <section className="bo-card">
      <h2>
        <ClipboardList aria-hidden /> Demandes de changement
        <small>{waiting ? `${waiting} en relecture` : "relues par BledWay"}</small>
      </h2>
      {editing && editingDeparture ? (
        <ChangeRequestForm
          ctx={ctx}
          departure={editingDeparture}
          draft={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ActivityState query={activity}>
        {items.length ? (
          <ul className="grid gap-2" data-testid="company-requests">
            {items.map((item) => {
              const status = REQUEST_STATUS[item.status];
              const open = item.status === "draft" || item.status === "submitted";
              const departureKnown = ctx.departures.some((d) => d.id === item.departureId);
              return (
                <li
                  key={item.id}
                  className="grid gap-1 rounded-xl border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <strong>
                        {describeRequest(item.kind, item.proposed, ctx.vesselName, ctx.when)}
                      </strong>
                      <span className="block text-xs text-muted-foreground">
                        {item.routeId ? ctx.lineOf(item.routeId) : "Traversée supprimée"}
                        {item.departureAt ? ` · départ publié ${ctx.when(item.departureAt)}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      {item.urgent && open ? (
                        <em className="bo-pill" data-tone="bad">
                          Urgent
                        </em>
                      ) : null}
                      <em className="bo-pill" data-tone={status.tone}>
                        {status.label}
                      </em>
                    </span>
                  </div>
                  {item.message ? (
                    <p className="text-muted-foreground">« {item.message} »</p>
                  ) : null}
                  {item.decisionNote ? (
                    <p className="rounded-lg bg-muted/60 p-2 text-xs">
                      <strong>Réponse de BledWay : </strong>
                      {item.decisionNote}
                    </p>
                  ) : null}
                  {ctx.canAct && open ? (
                    <div className="flex flex-wrap gap-2">
                      {item.status === "draft" && departureKnown ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                          <PenLine className="size-4" aria-hidden /> Reprendre
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdraw.isPending}
                        onClick={() => {
                          if (window.confirm("Retirer cette demande ? BledWay ne la traitera pas."))
                            withdraw.mutate(item.id);
                        }}
                      >
                        <Undo2 className="size-4" aria-hidden /> Retirer
                      </Button>
                    </div>
                  ) : null}
                  <History activity={activity.data} itemId={item.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="bo-empty">
            Aucune demande pour l'instant.
            {ctx.canAct
              ? " Pour signaler un retard, un nouvel horaire, un changement de navire ou une annulation, ouvrez « Mes traversées »."
              : ""}
          </p>
        )}
      </ActivityState>
      {!ctx.canAct ? <ReadOnlyNote /> : null}
    </section>
  );
}

function ReadOnlyNote() {
  return (
    <p className="bo-lead mt-3">
      Votre accès Lecture permet de suivre les demandes et les annonces. Pour en envoyer, demandez
      le niveau Opérations à votre interlocuteur BledWay.
    </p>
  );
}

function ActivityState({
  query,
  children,
}: {
  query: ReturnType<typeof useCompanyActivity>;
  children: ReactNode;
}) {
  if (query.isPending) return <p className="bo-empty">Chargement…</p>;
  if (query.isError)
    return (
      <div className="grid gap-2 py-3 text-sm">
        <p>
          {httpStatus(query.error) === 403
            ? "Ces informations ne vous sont pas ouvertes. Si votre accès vient de changer, rechargez la page."
            : (query.error as Error).message}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void query.refetch()}
        >
          Réessayer
        </Button>
      </div>
    );
  return <>{children}</>;
}

// ─── Rubrique « Annonces » ────────────────────────────────────────────────────────────────────

export function CompanyAnnouncementsTab({ ctx }: { ctx: DeskContext }) {
  const activity = useCompanyActivity(ctx.companyId);
  const refresh = useRefresh();
  const [editing, setEditing] = useState<CompanyAnnouncement | null>(null);
  const [formKey, setFormKey] = useState(0);
  const withdraw = useMutation({
    mutationFn: (id: string) => companyAccessRequest({ action: "announce_withdraw", id }),
    onSuccess: () => {
      toast.success("Annonce retirée.");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const items = activity.data?.announcements ?? [];
  const reset = () => {
    setEditing(null);
    setFormKey((value) => value + 1);
  };

  return (
    <>
      {ctx.canAct ? (
        <section className="bo-card">
          <h2>
            <Megaphone aria-hidden /> {editing ? "Reprendre l'annonce" : "Prévenir vos passagers"}
            <small>relu par BledWay avant l'envoi</small>
          </h2>
          <AnnouncementForm
            key={editing?.id ?? `new-${formKey}`}
            ctx={ctx}
            draft={editing}
            onDone={reset}
          />
        </section>
      ) : null}
      <section className="bo-card">
        <h2>
          <Megaphone aria-hidden /> Vos annonces
          <small>{items.length ? `${items.length} au total` : null}</small>
        </h2>
        <ActivityState query={activity}>
          {items.length ? (
            <ul className="grid gap-2" data-testid="company-announcements">
              {items.map((item) => {
                const status = ANNOUNCEMENT_STATUS[item.status];
                const open = item.status === "draft" || item.status === "submitted";
                return (
                  <li
                    key={item.id}
                    className="grid gap-1 rounded-xl border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <strong>{ANNOUNCEMENT_REASONS[item.reason]}</strong>
                        <span className="block text-xs text-muted-foreground">
                          {item.routeId ? ctx.lineOf(item.routeId) : "Traversée supprimée"}
                          {item.departureAt ? ` · ${ctx.when(item.departureAt)}` : ""}
                        </span>
                      </span>
                      <em className="bo-pill" data-tone={status.tone}>
                        {status.label}
                      </em>
                    </div>
                    <p>{item.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.status === "approved"
                        ? `${DELIVERY_LABEL[item.delivery ?? ""] ?? "Envoi"}${
                            item.recipients !== null && item.delivery === "sent"
                              ? ` · ${item.recipients} personne${item.recipients > 1 ? "s" : ""} prévenue${item.recipients > 1 ? "s" : ""}`
                              : ""
                          }`
                        : item.previewCount !== null
                          ? `${item.previewCount} personne${item.previewCount > 1 ? "s" : ""} à prévenir au moment de l'envoi à BledWay`
                          : null}
                    </p>
                    {item.decisionNote ? (
                      <p className="rounded-lg bg-muted/60 p-2 text-xs">
                        <strong>Réponse de BledWay : </strong>
                        {item.decisionNote}
                      </p>
                    ) : null}
                    {ctx.canAct && open ? (
                      <div className="flex flex-wrap gap-2">
                        {item.status === "draft" ? (
                          <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                            <PenLine className="size-4" aria-hidden /> Reprendre
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={withdraw.isPending}
                          onClick={() => {
                            if (window.confirm("Retirer cette annonce ? Elle ne sera pas envoyée."))
                              withdraw.mutate(item.id);
                          }}
                        >
                          <Undo2 className="size-4" aria-hidden /> Retirer
                        </Button>
                      </div>
                    ) : null}
                    <History activity={activity.data} itemId={item.id} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bo-empty">Aucune annonce pour l'instant.</p>
          )}
        </ActivityState>
        {!ctx.canAct ? <ReadOnlyNote /> : null}
      </section>
    </>
  );
}

function AnnouncementForm({
  ctx,
  draft,
  onDone,
}: {
  ctx: DeskContext;
  draft: CompanyAnnouncement | null;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const choices = ctx.departures.filter(
    (item) => item.status !== "cancelled" || item.id === draft?.departureId,
  );
  const [departureId, setDepartureId] = useState(draft?.departureId ?? "");
  const [reason, setReason] = useState<AnnouncementReason>(draft?.reason ?? "delay");
  const [body, setBody] = useState(draft?.body ?? "");
  const [urgent, setUrgent] = useState(draft?.urgent ?? false);
  const [reachable, setReachable] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const text = body.trim();
  const valid = Boolean(departureId) && text.length >= 10 && text.length <= 280;

  const preview = useMutation({
    mutationFn: () =>
      companyAccessRequest<{ reachable: number }>({ action: "announce_preview", departureId }),
    onSuccess: (data) => {
      setReachable(data.reachable);
      setConfirming(data.reachable > 0);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const save = useMutation({
    mutationFn: (submit: boolean) =>
      companyAccessRequest<{ id: string; status: string }>({
        action: "announce_save",
        ...(draft ? { id: draft.id } : {}),
        departureId,
        reason,
        body: text,
        urgent,
        submit,
      }),
    onSuccess: (data) => {
      toast.success(
        data.status === "submitted"
          ? "Annonce envoyée à BledWay. Elle partira après relecture."
          : "Brouillon enregistré.",
      );
      refresh();
      onDone();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setConfirming(false);
      refresh(error);
    },
  });
  // Tout changement de contenu oblige à revérifier les destinataires.
  const touched = () => {
    setReachable(null);
    setConfirming(false);
  };

  if (!choices.length && !draft)
    return <p className="bo-empty">Aucune traversée à venir : rien à annoncer pour l'instant.</p>;

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) preview.mutate();
      }}
      aria-label="Nouvelle annonce"
    >
      <Field
        label="Traversée"
        hint="Seules les personnes qui suivent cette traversée sont prévenues."
      >
        <select
          className={selectClass}
          value={departureId}
          onChange={(event) => {
            setDepartureId(event.target.value);
            touched();
          }}
        >
          <option value="">Choisir une traversée</option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {ctx.when(item.departure_at)} · {ctx.lineOf(item.route_id)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Motif">
        <select
          className={selectClass}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value as AnnouncementReason);
            touched();
          }}
        >
          {(Object.keys(ANNOUNCEMENT_REASONS) as AnnouncementReason[]).map((option) => (
            <option key={option} value={option}>
              {ANNOUNCEMENT_REASONS[option]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Message aux voyageurs" hint={`${text.length}/280 caractères, 10 au moins.`}>
        <Textarea
          value={body}
          maxLength={280}
          rows={3}
          onChange={(event) => {
            setBody(event.target.value);
            touched();
          }}
          placeholder="Ex. : embarquement des véhicules à partir de 16 h, quai 3."
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(event) => {
            setUrgent(event.target.checked);
            touched();
          }}
        />
        Urgent : à relire en priorité
      </label>

      {reachable === 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
          Personne ne suit cette traversée pour l'instant : l'annonce ne peut pas partir. Vous
          pouvez l'enregistrer en brouillon et revérifier plus tard.
        </p>
      ) : null}
      {confirming && reachable ? (
        <div
          className="grid gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
          role="status"
        >
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4" aria-hidden /> {reachable} personne{reachable > 1 ? "s" : ""}{" "}
            à prévenir
          </p>
          <p className="text-xs text-muted-foreground">
            Voyageurs et proches qui suivent cette traversée et acceptent ces messages. Ce nombre
            est recalculé par BledWay au moment de l'envoi.
          </p>
          <div className="rounded-lg bg-background p-2">
            <p className="text-xs font-semibold">{announcementTitle(ctx.companyName)}</p>
            <p>{text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>
              <Send className="size-4" aria-hidden /> Envoyer à BledWay pour relecture
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Modifier
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid || preview.isPending}>
            <Users className="size-4" aria-hidden />{" "}
            {preview.isPending ? "Vérification…" : "Vérifier les destinataires"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate(false)}
          >
            Enregistrer en brouillon
          </Button>
          {draft ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Fermer
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}
