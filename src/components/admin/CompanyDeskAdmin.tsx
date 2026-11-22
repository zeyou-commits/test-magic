import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { companyAccessRequest } from "@/lib/company/access";
import {
  deskKeys,
  PHOTO_STATUS,
  PROFILE_FIELDS,
  PROPOSAL_STATUS,
  REPLY_STATUS,
  type DeskQueue,
  type QueuePhoto,
  type QueueProfile,
  type QueueReply,
} from "@/lib/company/desk";
import { alertLabel, type TravelAlert } from "@/lib/ferry/community";
import { reviewCriteria } from "@/lib/ferry/reviewCriteria";
import { ModerationCard, ModerationSection, moderationEmpty, StatusFilter } from "./ModerationCard";

const whenFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const when = (iso: string | null | undefined) => (iso ? whenFmt.format(new Date(iso)) : "—");
const PILL: Record<string, string> = {
  submitted: "pending",
  pending: "pending",
  published: "published",
  applied: "approved",
  acknowledged: "approved",
  refused: "rejected",
  removed: "rejected",
  stale: "hidden",
  withdrawn: "hidden",
  replaced: "hidden",
};
const REVIEW_ROLES = ["admin", "moderator"];
const EDIT_ROLES = ["admin", "editor"];

export function useDeskQueue(enabled = true) {
  const { user, roles } = useAuth();
  return useQuery({
    queryKey: deskKeys.queue(user?.id ?? ""),
    queryFn: () => companyAccessRequest<DeskQueue>({ action: "desk_queue" }),
    enabled:
      Boolean(user) &&
      enabled &&
      roles.some((role) => [...REVIEW_ROLES, ...EDIT_ROLES].includes(role)),
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/** Badge du menu : ce qui attend encore une décision (contestations surtout, depuis le 22/11/2026). */
export function useDeskQueueCount() {
  const queue = useDeskQueue();
  const pending = queue.data?.pending;
  return pending ? pending.replies + pending.profiles + pending.photos : 0;
}

function useDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      companyAccessRequest<Record<string, unknown>>(input),
    onSettled: () => void client.invalidateQueries({ queryKey: ["company-access"] }),
  });
}

function NoteForm({
  label,
  pending,
  onCancel,
  onConfirm,
}: {
  label: string;
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
        aria-label="Motif"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || note.trim().length < 3}
          onClick={() => onConfirm(note.trim())}
        >
          {label}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

type Filter = "pending" | "done";

/**
 * Suite de la rubrique « Demandes des compagnies » : réponses aux avis et aux signalements,
 * contestations (administrateurs et modérateurs), corrections de fiche et photos
 * (administrateurs et éditeurs). Chacun ne voit que ce que son rôle lui permet de décider.
 */
export function CompanyDeskAdmin() {
  const queue = useDeskQueue();
  // Depuis le 22/11/2026, les compagnies publient sans relecture : on montre d'abord ce qui est
  // publié (à retirer si besoin), puis ce qui attend encore une décision (contestations).
  const [filter, setFilter] = useState<Filter>("done");
  if (queue.isPending)
    return <p className="bo-empty">Chargement des réponses, fiches et photos…</p>;
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
  const open = (status: string) => status === "submitted" || status === "pending";
  const pick = <T extends { status: string }>(items: T[] | null) =>
    (items ?? []).filter((item) => (filter === "pending" ? open(item.status) : !open(item.status)));
  const filterBar = (
    <StatusFilter
      label="Afficher"
      value={filter}
      onChange={setFilter}
      options={[
        { value: "done", label: "Publié (30 jours)" },
        { value: "pending", label: "À examiner" },
      ]}
    />
  );
  const empty = filter === "pending" ? "Rien à examiner." : "Rien ces 30 derniers jours.";
  return (
    <div className="mt-5 grid gap-5">
      {data.replies ? (
        <ModerationSection
          title="Réponses aux avis et signalements"
          count={data.pending.replies}
          hint="Publiées directement par la compagnie, sous l'avis ou le signalement. « Retirer » les masque avec un motif que la compagnie voit. Une contestation n'est jamais publiée : elle attend dans « À examiner » ; « Prendre en compte » signifie que vous vérifiez, puis vous agissez avec les outils habituels (Avis, Signalements)."
          toolbar={filterBar}
        >
          {pick(data.replies).length ? (
            <ul className="bo-modlist">
              {pick(data.replies).map((item) => (
                <ReplyCard key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            moderationEmpty(empty)
          )}
        </ModerationSection>
      ) : null}
      {data.profiles ? (
        <ModerationSection
          title="Corrections de fiche"
          count={data.pending.profiles}
          hint="Appliquées directement par la compagnie ; l'état d'avant reste dans l'historique de la compagnie. Pour corriger, modifiez la fiche dans Réseau → Fiches compagnies."
          toolbar={data.replies ? undefined : filterBar}
        >
          {pick(data.profiles).length ? (
            <ul className="bo-modlist">
              {pick(data.profiles).map((item) => (
                <ProfileCard key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            moderationEmpty(empty)
          )}
        </ModerationSection>
      ) : null}
      {data.photos ? (
        <ModerationSection
          title="Photos des compagnies"
          count={data.pending.photos}
          hint="Publiées directement par la compagnie, après le filtre automatique de contenu explicite. Droits déclarés par la compagnie. Retirez la publicité, le texte incrusté, les personnes reconnaissables."
        >
          {pick(data.photos).length ? (
            <ul className="bo-modlist">
              {pick(data.photos).map((item) => (
                <PhotoCard key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            moderationEmpty(empty)
          )}
        </ModerationSection>
      ) : null}
    </div>
  );
}

function targetLine(item: QueueReply) {
  const target = item.target;
  if (!target) return "Élément supprimé";
  if (item.targetKind === "alert")
    return `Signalement · ${alertLabel({ category: target.category, detail: target.detail, delay_minutes: target.delayMinutes } as unknown as TravelAlert)} · ${target.vesselName ?? ""} · ${when(target.date)}`;
  if (item.targetKind === "vessel_review")
    return `Avis ${target.score ?? "?"}/5 · ${target.vesselName ?? ""} · ${when(target.date)}`;
  const kind = target.vesselName ? "vessel" : "company";
  const scores = reviewCriteria[kind]
    .filter((c) => typeof target.scores?.[c.code] === "number")
    .map((c) => `${c.label} ${target.scores![c.code]}/5`)
    .join(", ");
  return `Avis ${target.vesselName ?? "compagnie"} · ${scores || "notes"} · ${when(target.date)}`;
}

function ReplyCard({ item }: { item: QueueReply }) {
  const decide = useDecision();
  const [noting, setNoting] = useState<"refuse" | "remove" | null>(null);
  const run = (decision: string, note?: string) =>
    decide.mutate(
      { action: "reply_decide", id: item.id, decision, ...(note ? { note } : {}) },
      {
        onSuccess: () => {
          toast.success(
            decision === "publish"
              ? "Réponse publiée."
              : decision === "acknowledge"
                ? "Contestation prise en compte. Vérifiez le signalement dans « Signalements »."
                : "Décision enregistrée.",
          );
          setNoting(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  const contest = item.kind === "contest";
  return (
    <ModerationCard
      title={`${item.companyName} · ${contest ? "Contestation" : "Réponse"}`}
      status={PILL[item.status]}
      statusLabel={REPLY_STATUS[item.status].label}
      meta={`${targetLine(item)} · envoyée ${when(item.createdAt)} par ${item.author}`}
      actions={
        noting ? null : item.status === "submitted" ? (
          <>
            <Button
              size="sm"
              disabled={decide.isPending || (!contest && item.targetStillThere === false)}
              onClick={() => run(contest ? "acknowledge" : "publish")}
            >
              <Check className="size-4" aria-hidden /> {contest ? "Prendre en compte" : "Publier"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => setNoting("refuse")}
            >
              <X className="size-4" aria-hidden /> Refuser
            </Button>
          </>
        ) : item.status === "published" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={decide.isPending}
            onClick={() => setNoting("remove")}
          >
            <Trash2 className="size-4" aria-hidden /> Retirer
          </Button>
        ) : null
      }
    >
      {item.target?.comment ? (
        <p className="text-sm text-muted-foreground">Avis : « {item.target.comment} »</p>
      ) : null}
      <p className="whitespace-pre-line text-sm">« {item.body} »</p>
      {!contest && item.status === "submitted" && item.targetStillThere === false ? (
        <p
          className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
          role="note"
        >
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
          L'avis ou le signalement n'est plus affiché : la réponse ne peut plus être publiée.
        </p>
      ) : null}
      {item.decisionNote ? (
        <p className="text-xs text-muted-foreground">Note : {item.decisionNote}</p>
      ) : null}
      {noting ? (
        <NoteForm
          label={noting === "remove" ? "Confirmer le retrait" : "Confirmer le refus"}
          pending={decide.isPending}
          onCancel={() => setNoting(null)}
          onConfirm={(note) => run(noting, note)}
        />
      ) : null}
    </ModerationCard>
  );
}

function ProfileCard({ item }: { item: QueueProfile }) {
  const decide = useDecision();
  const [refusing, setRefusing] = useState(false);
  const changedSince = Object.keys(item.changes).some(
    (key) =>
      (item.current as Record<string, unknown>)[key] !==
      (item.snapshot as Record<string, unknown>)[key],
  );
  const run = (decision: "apply" | "refuse", note?: string) =>
    decide.mutate(
      { action: "profile_decide", id: item.id, decision, ...(note ? { note } : {}) },
      {
        onSuccess: (data) => {
          if (data["status"] === "stale")
            toast.warning(
              "La fiche a changé entre-temps : proposition classée « dépassée », rien n'a été écrasé.",
            );
          else toast.success(decision === "apply" ? "Fiche mise à jour." : "Proposition refusée.");
          setRefusing(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  return (
    <ModerationCard
      title={`${item.companyName} · fiche publique`}
      status={PILL[item.status]}
      statusLabel={PROPOSAL_STATUS[item.status].label}
      meta={`envoyée ${when(item.createdAt)} par ${item.author}`}
      actions={
        item.status === "submitted" && !refusing ? (
          <>
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Appliquer ces corrections à la fiche publique de ${item.companyName} ?`,
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
      <dl className="grid gap-1 text-sm">
        {PROFILE_FIELDS.filter((field) => field.key in item.changes).map((field) => (
          <div key={field.key} className="grid gap-0.5">
            <dt className="font-semibold">{field.label}</dt>
            <dd className="break-words text-muted-foreground line-through">
              {item.snapshot[field.key] || "vide"}
            </dd>
            <dd className="break-words">{item.changes[field.key] || <em>à effacer</em>}</dd>
          </div>
        ))}
      </dl>
      {item.message ? <p className="text-sm">« {item.message} »</p> : null}
      {item.status === "submitted" && changedSince ? (
        <p
          className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
          role="note"
        >
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
          La fiche a changé depuis l'envoi. « Appliquer » classera la proposition comme dépassée.
        </p>
      ) : null}
      {item.decisionNote ? (
        <p className="text-xs text-muted-foreground">Réponse : {item.decisionNote}</p>
      ) : null}
      {refusing ? (
        <NoteForm
          label="Confirmer le refus"
          pending={decide.isPending}
          onCancel={() => setRefusing(false)}
          onConfirm={(note) => run("refuse", note)}
        />
      ) : null}
    </ModerationCard>
  );
}

function PhotoCard({ item }: { item: QueuePhoto }) {
  const decide = useDecision();
  const [noting, setNoting] = useState<"refuse" | "remove" | null>(null);
  const run = (decision: string, note?: string) =>
    decide.mutate(
      { action: "photo_decide", id: item.id, decision, ...(note ? { note } : {}) },
      {
        onSuccess: () => {
          toast.success(
            decision === "publish" ? "Photo publiée." : "Décision enregistrée, fichier effacé.",
          );
          setNoting(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  return (
    <ModerationCard
      title={`${item.companyName} · ${item.vesselName ? `galerie ${item.vesselName}` : "galerie de la compagnie"}`}
      status={PILL[item.status]}
      statusLabel={PHOTO_STATUS[item.status].label}
      meta={`envoyée ${when(item.createdAt)} par ${item.author} · ${item.width}×${item.height} · ${Math.round(item.bytes / 1024)} Ko · droits déclarés`}
      actions={
        noting ? null : item.status === "pending" ? (
          <>
            <Button size="sm" disabled={decide.isPending} onClick={() => run("publish")}>
              <Check className="size-4" aria-hidden /> Publier
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => setNoting("refuse")}
            >
              <X className="size-4" aria-hidden /> Refuser
            </Button>
          </>
        ) : item.status === "published" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={decide.isPending}
            onClick={() => setNoting("remove")}
          >
            <Trash2 className="size-4" aria-hidden /> Retirer
          </Button>
        ) : null
      }
    >
      {item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="block max-w-sm">
          <img
            src={item.url}
            alt={item.caption}
            loading="lazy"
            className="max-h-56 w-auto rounded-lg"
          />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Aperçu indisponible.</p>
      )}
      <p className="text-sm">
        « {item.caption} »{item.credit ? ` · © ${item.credit}` : ""}
      </p>
      {item.decisionNote ? (
        <p className="text-xs text-muted-foreground">Note : {item.decisionNote}</p>
      ) : null}
      {noting ? (
        <NoteForm
          label={noting === "remove" ? "Confirmer le retrait" : "Confirmer le refus"}
          pending={decide.isPending}
          onCancel={() => setNoting(null)}
          onConfirm={(note) => run(noting, note)}
        />
      ) : null}
    </ModerationCard>
  );
}
