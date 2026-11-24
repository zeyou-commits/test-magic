import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ClipboardList,
  Megaphone,
  MessageSquareText,
  PenLine,
  Send,
  Undo2,
  Users,
} from "lucide-react";
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
import { tr, intlLocale } from "@/lib/i18n";

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
      <summary className="cursor-pointer">{tr("ui.companyDesk.historique")}</summary>
      <ul className="mt-1 grid gap-0.5">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            {EVENT_LABELS[event.action] ?? event.action} · {event.by} ·{" "}
            {new Date(event.at).toLocaleString(intlLocale(), {
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
  fixedKind,
  onClose,
}: {
  ctx: DeskContext;
  departure: Departure;
  draft?: CompanyRequest;
  /** Choisi dans le panneau « Modifier ou prévenir » : ni en-tête ni second choix ici. */
  fixedKind?: RequestKind;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const zones = ctx.zonesOf(departure.route_id);
  const [chosenKind, setKind] = useState<RequestKind>(draft?.kind ?? "delay");
  const kind = fixedKind ?? chosenKind;
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
        submit,
      });
    },
    onSuccess: (data) => {
      toast.success(
        data.status === "applied"
          ? "Traversée mise à jour. Les voyageurs qui la suivent sont prévenus."
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
        // Une annulation se voit tout de suite et ne se défait pas depuis l'espace compagnie.
        if (
          kind === "cancel" &&
          !window.confirm(
            "Annuler cette traversée ? Elle s'affiche « Annulée » tout de suite et les voyageurs qui la suivent sont prévenus. Pour revenir en arrière, il faudra écrire à BledWay.",
          )
        )
          return;
        save.mutate(true);
      }}
      aria-label={fixedKind ? REQUEST_KINDS[fixedKind].label : tr("ui.companyDesk.signalerUnChangement")}
    >
      {fixedKind ? null : (
        <p className="text-sm">
          <strong>{ctx.lineOf(departure.route_id)}</strong>
          <span className="block text-xs text-muted-foreground">
            {ctx.when(departure.departure_at)} · {ctx.vesselName(departure.vessel_id)}
          </span>
        </p>
      )}
      <fieldset className={fixedKind ? "hidden" : "grid gap-1"}>
        <legend className="mb-1 text-sm font-semibold">{tr("ui.companyDesk.ceQuiChange")}</legend>
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
        <Field label={tr("ui.companyDesk.retardEnMinutes")} hint={tr("ui.companyDesk.entre5Et1440")}>
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
          <Field label={tr("ui.companyDesk.navireQuiAssureLaTraversee")}>
            <select
              className={selectClass}
              value={vesselId}
              onChange={(event) => setVesselId(event.target.value)}
            >
              <option value="">{tr("ui.companyDesk.choisirUnNavire")}</option>
              {otherVessels.map((vessel) => (
                <option key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">
            {tr("ui.companyDesk.aucunAutreNavireEnService")}
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
            hint={tr("ui.companyDesk.facultatifSansArriveeLaDuree")}
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

      <Field
        label={tr("ui.companyDesk.notePourLHistorique")}
        hint={tr("ui.companyDesk.facultatifLueParVotreEquipe")}
      >
        <Textarea
          value={message}
          maxLength={500}
          rows={2}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={tr("ui.companyDesk.exAvarieTechniqueNouveauCreneau")}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {tr("ui.companyDesk.leChangementSAfficheTout")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          <Send className="size-4" aria-hidden />{tr("ui.companyDesk.appliquerLeChangement")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
        >
          {tr("ui.companyDesk.enregistrerEnBrouillon")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {tr("ui.companyDesk.fermer")}
        </Button>
      </div>
    </form>
  );
}

// ─── Une traversée, un seul bouton : modifier ou prévenir ───────────────────────────────────────

type CrossingAction = RequestKind | "message";
const CROSSING_ACTIONS: { id: CrossingAction; label: string; hint: string }[] = [
  ...(Object.keys(REQUEST_KINDS) as RequestKind[]).map((id) => ({
    id,
    label: REQUEST_KINDS[id].label,
    hint: `${REQUEST_KINDS[id].hint} Les voyageurs qui la suivent sont prévenus.`,
  })),
  {
    id: "message",
    label: "Message aux voyageurs",
    hint: "Rien ne change sur la traversée : une consigne ou une information, envoyée à ceux qui la suivent.",
  },
];

/**
 * Tout ce qu'une compagnie fait sur une traversée, depuis sa ligne : retard, nouvel horaire,
 * autre navire, annulation (la traversée change et les voyageurs sont prévenus), ou simple message.
 */
export function CrossingActionPanel({
  ctx,
  departure,
  onClose,
}: {
  ctx: DeskContext;
  departure: Departure;
  onClose: () => void;
}) {
  const [action, setAction] = useState<CrossingAction>("delay");
  const current = CROSSING_ACTIONS.find((item) => item.id === action)!;
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-sm">
        <strong>{ctx.lineOf(departure.route_id)}</strong>
        <span className="block text-xs text-muted-foreground">
          {ctx.when(departure.departure_at)} · {ctx.vesselName(departure.vessel_id)}
        </span>
      </p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-semibold">{tr("ui.companyDesk.queVoulezVousFaire")}</legend>
        <div className="flex flex-wrap gap-2">
          {CROSSING_ACTIONS.map((option) => (
            <label
              key={option.id}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="radio"
                name={`action-${departure.id}`}
                value={option.id}
                checked={action === option.id}
                onChange={() => setAction(option.id)}
              />
              {option.id === "message" ? (
                <MessageSquareText className="size-4" aria-hidden />
              ) : null}
              {option.label}
            </label>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{current.hint}</span>
      </fieldset>
      {action === "message" ? (
        <AnnouncementForm ctx={ctx} draft={null} departure={departure} onDone={onClose} />
      ) : (
        <ChangeRequestForm
          key={action}
          ctx={ctx}
          departure={departure}
          fixedKind={action}
          onClose={onClose}
        />
      )}
    </div>
  );
}

// ─── Rubrique « Historique des changements » ────────────────────────────────────────────────────────────────

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
        <ClipboardList aria-hidden />{tr("ui.companyDesk.changementsDeTraversee")}
        <small>{waiting ? `${waiting} en attente` : tr("ui.companyDesk.appliquesALEnvoi")}</small>
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
                        {item.routeId ? ctx.lineOf(item.routeId) : tr("ui.companyDesk.traverseeSupprimee")}
                        {item.departureAt ? ` · départ publié ${ctx.when(item.departureAt)}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1">
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
                      <strong>{tr("ui.companyDesk.reponseDeBledway")}</strong>
                      {item.decisionNote}
                    </p>
                  ) : null}
                  {ctx.canAct && open ? (
                    <div className="flex flex-wrap gap-2">
                      {item.status === "draft" && departureKnown ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                          <PenLine className="size-4" aria-hidden />{tr("ui.companyDesk.reprendre")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdraw.isPending}
                        onClick={() => {
                          if (window.confirm("Retirer ce changement ? Il ne sera pas appliqué."))
                            withdraw.mutate(item.id);
                        }}
                      >
                        <Undo2 className="size-4" aria-hidden />{tr("ui.companyDesk.retirer")}
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
            {tr("ui.companyDesk.aucunChangementPourLInstant")}
            {ctx.canAct
              ? tr("ui.companyDesk.pourSignalerUnRetardUn")
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
      {tr("ui.companyDesk.votreAccesLecturePermetDe")}
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
  if (query.isPending) return <p className="bo-empty">{tr("ui.companyDesk.chargement")}</p>;
  if (query.isError)
    return (
      <div className="grid gap-2 py-3 text-sm">
        <p>
          {httpStatus(query.error) === 403
            ? tr("ui.companyDesk.cesInformationsNeVousSont")
            : (query.error as Error).message}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void query.refetch()}
        >
          {tr("ui.companyDesk.reessayer")}
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
            <Megaphone aria-hidden /> {editing ? tr("ui.companyDesk.reprendreLAnnonce") : tr("ui.companyDesk.prevenirVosPassagers")}
            <small>{tr("ui.companyDesk.envoyeToutDeSuiteSigne")}{ctx.companyName}</small>
          </h2>
          <p className="bo-lead mb-2">
            {tr("ui.companyDesk.plusRapideDansMesTraversees")}
          </p>
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
          <Megaphone aria-hidden />{tr("ui.companyDesk.vosAnnonces")}
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
                          {item.routeId ? ctx.lineOf(item.routeId) : tr("ui.companyDesk.traverseeSupprimee")}
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
                          ? `${item.previewCount} personne${item.previewCount > 1 ? "s" : ""} à prévenir`
                          : null}
                    </p>
                    {item.decisionNote ? (
                      <p className="rounded-lg bg-muted/60 p-2 text-xs">
                        <strong>{tr("ui.companyDesk.reponseDeBledway")}</strong>
                        {item.decisionNote}
                      </p>
                    ) : null}
                    {ctx.canAct && open ? (
                      <div className="flex flex-wrap gap-2">
                        {item.status === "draft" ? (
                          <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                            <PenLine className="size-4" aria-hidden />{tr("ui.companyDesk.reprendre")}
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
                          <Undo2 className="size-4" aria-hidden />{tr("ui.companyDesk.retirer")}
                        </Button>
                      </div>
                    ) : null}
                    <History activity={activity.data} itemId={item.id} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bo-empty">{tr("ui.companyDesk.aucuneAnnoncePourLInstant")}</p>
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
  departure,
  onDone,
}: {
  ctx: DeskContext;
  draft: CompanyAnnouncement | null;
  /** Ouvert depuis la ligne d'une traversée : elle est déjà choisie. */
  departure?: Departure;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const choices = ctx.departures.filter(
    (item) => item.status !== "cancelled" || item.id === draft?.departureId,
  );
  const [departureId, setDepartureId] = useState(departure?.id ?? draft?.departureId ?? "");
  const [reason, setReason] = useState<AnnouncementReason>(
    draft?.reason ?? (departure ? "boarding" : "delay"),
  );
  const [body, setBody] = useState(draft?.body ?? "");
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
        submit,
      }),
    onSuccess: (data) => {
      toast.success(
        data.status === "approved"
          ? "Annonce envoyée aux voyageurs qui suivent cette traversée."
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

  if (!choices.length && !draft && !departure)
    return <p className="bo-empty">{tr("ui.companyDesk.aucuneTraverseeAVenirRien")}</p>;

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) preview.mutate();
      }}
      aria-label={tr("ui.companyDesk.nouvelleAnnonce")}
    >
      {departure ? null : (
        <Field
          label={tr("ui.companyDesk.traversee")}
          hint={tr("ui.companyDesk.seulesLesPersonnesQuiSuivent")}
        >
          <select
            className={selectClass}
            value={departureId}
            onChange={(event) => {
              setDepartureId(event.target.value);
              touched();
            }}
          >
            <option value="">{tr("ui.companyDesk.choisirUneTraversee")}</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {ctx.when(item.departure_at)} · {ctx.lineOf(item.route_id)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={tr("ui.companyDesk.motif")}>
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
      <Field label={tr("ui.companyDesk.messageAuxVoyageurs")} hint={`${text.length}/280 caractères, 10 au moins.`}>
        <Textarea
          value={body}
          maxLength={280}
          rows={3}
          onChange={(event) => {
            setBody(event.target.value);
            touched();
          }}
          placeholder={tr("ui.companyDesk.exEmbarquementDesVehiculesA")}
        />
      </Field>

      {reachable === 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
          {tr("ui.companyDesk.personneNeSuitCetteTraversee")}
        </p>
      ) : null}
      {confirming && reachable ? (
        <div
          className="grid gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
          role="status"
        >
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4" aria-hidden /> {reachable}{tr("ui.companyDesk.personne")}{reachable > 1 ? "s" : ""}{" "}
            {tr("ui.companyDesk.aPrevenir")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr("ui.companyDesk.voyageursEtProchesQuiSuivent")}
          </p>
          <div className="rounded-lg bg-background p-2">
            <p className="text-xs font-semibold">{announcementTitle(ctx.companyName)}</p>
            <p>{text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>
              <Send className="size-4" aria-hidden />{tr("ui.companyDesk.envoyerMaintenant")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {tr("ui.companyDesk.modifier")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid || preview.isPending}>
            <Users className="size-4" aria-hidden />{" "}
            {preview.isPending ? tr("ui.companyDesk.calcul") : tr("ui.companyDesk.voirLApercuEtLes")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate(false)}
          >
            {tr("ui.companyDesk.enregistrerEnBrouillon")}
          </Button>
          {draft || departure ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              {tr("ui.companyDesk.fermer")}
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}
