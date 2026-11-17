import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  Copy,
  ExternalLink,
  Flag,
  MessageSquareReply,
  Radio,
  Send,
  Star,
  Trash2,
  Undo2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  companyAccessKeys,
  companyAccessRequest,
  LEVEL_CATALOG,
  type CompanyLevel,
} from "@/lib/company/access";
import {
  blobToBase64,
  deskKeys,
  GALLERY_LIMIT,
  latestReply,
  PHOTO_STATUS,
  PROFILE_FIELDS,
  profileFieldError,
  PROPOSAL_STATUS,
  REPLY_STATUS,
  type CompanyFeedback,
  type CompanyPhoto,
  type CompanyProfile,
  type CompanyReply,
  type FeedbackAlert,
  type FeedbackReview,
  type ManagerOverview,
  type ProfileField,
  type ReplyKind,
  type ReplyTargetKind,
} from "@/lib/company/desk";
import { alertLabel, type TravelAlert } from "@/lib/ferry/community";
import { reviewCriteria, reviewNumber } from "@/lib/ferry/reviewCriteria";

/** Ce que ces rubriques reçoivent de la page « Espace compagnie ». */
export type VoiceContext = {
  companyId: string;
  companyName: string;
  /** Niveau Opérations confirmé par le serveur ; l'aperçu de l'équipe BledWay ne soumet rien. */
  canAct: boolean;
  when: (iso: string) => string;
};

const httpStatus = (error: unknown) => (error as { status?: number } | null)?.status;

function useDeskRefresh() {
  const client = useQueryClient();
  const { user } = useAuth();
  return (error?: unknown) => {
    const id = user?.id ?? "";
    for (const part of ["feedback", "profile", "manager", "activity"])
      void client.invalidateQueries({ queryKey: ["company-access", id, part] });
    if (httpStatus(error) === 403)
      void client.invalidateQueries({ queryKey: companyAccessKeys.me(id) });
  };
}

function QueryState({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
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

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted/60 p-2 text-xs">{children}</p>;
}

export function useCompanyFeedback(companyId: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: deskKeys.feedback(user?.id ?? "", companyId),
    queryFn: () => companyAccessRequest<CompanyFeedback>({ action: "feedback", companyId }),
    enabled: Boolean(user && companyId) && enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

// ─── Réponse ou contestation ─────────────────────────────────────────────────────────────────

function ReplyBlock({
  ctx,
  targetKind,
  targetId,
  kind,
  replies,
}: {
  ctx: VoiceContext;
  targetKind: ReplyTargetKind;
  targetId: string;
  kind: ReplyKind;
  replies: CompanyReply[];
}) {
  const refresh = useDeskRefresh();
  const current = latestReply(replies, targetId, kind);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: () =>
      companyAccessRequest({
        action: "reply_save",
        companyId: ctx.companyId,
        targetKind,
        targetId,
        kind,
        body: body.trim(),
      }),
    onSuccess: () => {
      toast.success(
        kind === "contest"
          ? "Contestation envoyée à BledWay. Le signalement reste affiché pendant l'examen."
          : "Réponse envoyée : elle sera publiée après relecture par BledWay.",
      );
      setOpen(false);
      setBody("");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => companyAccessRequest({ action: "reply_withdraw", id }),
    onSuccess: () => {
      toast.success(kind === "contest" ? "Contestation retirée." : "Réponse retirée.");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const label =
    kind === "contest"
      ? current?.status === "submitted"
        ? "Modifier la contestation"
        : "Contester"
      : current
        ? "Modifier la réponse"
        : "Répondre";
  const status = current ? REPLY_STATUS[current.status] : null;
  const valid = body.trim().length >= 3;

  return (
    <div className="grid gap-1.5">
      {current ? (
        <div className="grid gap-1 rounded-lg border border-dashed border-border p-2">
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <strong>{kind === "contest" ? "Votre contestation" : "Votre réponse"}</strong>
            <em className="bo-pill" data-tone={status?.tone}>
              {status?.label}
            </em>
            <span className="text-muted-foreground">
              {current.author} · {ctx.when(current.createdAt)}
            </span>
          </span>
          <p className="whitespace-pre-line text-sm">{current.body}</p>
          {current.decisionNote ? (
            <Note>
              <strong>Note de BledWay : </strong>
              {current.decisionNote}
            </Note>
          ) : null}
        </div>
      ) : null}
      {ctx.canAct && !open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={kind === "contest" ? "ghost" : "outline"}
            onClick={() => {
              setBody(
                current && kind === "reply" && current.status !== "removed" ? current.body : "",
              );
              setOpen(true);
            }}
          >
            {kind === "contest" ? (
              <Flag className="size-4" aria-hidden />
            ) : (
              <MessageSquareReply className="size-4" aria-hidden />
            )}
            {label}
          </Button>
          {current && (current.status === "submitted" || current.status === "published") ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={withdraw.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    kind === "contest"
                      ? "Retirer cette contestation ?"
                      : "Retirer cette réponse ? Elle ne sera plus affichée.",
                  )
                )
                  withdraw.mutate(current.id);
              }}
            >
              <Undo2 className="size-4" aria-hidden /> Retirer
            </Button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <form
          className="grid gap-2 rounded-lg border border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">
              {kind === "contest"
                ? "Pourquoi ce signalement vous semble inexact"
                : "Votre réponse publique"}
            </span>
            <Textarea
              value={body}
              maxLength={1000}
              rows={4}
              onChange={(event) => setBody(event.target.value)}
              placeholder={
                kind === "contest"
                  ? "Par exemple : départ à l'heure, embarquement ouvert à 18 h. Ajoutez ce qui permet de vérifier."
                  : "Une réponse courtoise et factuelle, sans données personnelles."
              }
            />
            <span className="text-xs text-muted-foreground">
              {kind === "contest"
                ? "Lue par l'équipe BledWay seulement. Le signalement n'est ni supprimé ni masqué pendant l'examen."
                : `Publiée sous « Réponse de ${ctx.companyName} » après relecture par BledWay. L'avis reste affiché tel quel.`}{" "}
              {body.trim().length}/1000
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={!valid || save.isPending}>
              <Send className="size-4" aria-hidden /> Envoyer à BledWay
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ─── Avis ────────────────────────────────────────────────────────────────────────────────────

function reviewSummary(review: FeedbackReview) {
  if (review.kind === "vessel_review") return review.score ? `${review.score}/5` : "Note";
  const kind = review.targetKind === "vessel" ? "vessel" : "company";
  const rated = reviewCriteria[kind].filter((c) => typeof review.scores?.[c.code] === "number");
  if (!rated.length) return "Note";
  const mean = rated.reduce((sum, c) => sum + (review.scores![c.code] as number), 0) / rated.length;
  return `${reviewNumber(mean)}/5`;
}

export function CompanyReviewsTab({ ctx, summary }: { ctx: VoiceContext; summary: ReactNode }) {
  const feedback = useCompanyFeedback(ctx.companyId);
  const [filter, setFilter] = useState<"all" | "todo">("all");
  const data = feedback.data;
  const reviews = (data?.reviews ?? []).filter(
    (review) => filter === "all" || !latestReply(data!.replies, review.id, "reply"),
  );
  return (
    <div className="grid gap-3.5">
      <section className="bo-card">
        <h2>
          <Star aria-hidden /> Notes par critère
          <small>compagnie</small>
        </h2>
        {summary}
      </section>
      <section className="bo-card">
        <h2>
          <MessageSquareReply aria-hidden /> Avis publiés
          <small>votre réponse est relue par BledWay</small>
        </h2>
        <p className="bo-lead mb-2">
          Vous pouvez répondre à chaque avis publié sur votre compagnie ou vos navires. Un avis
          n'est jamais masqué, modifié ni supprimé à la demande d'une compagnie.
        </p>
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Filtrer les avis">
          {(
            [
              ["all", "Tous"],
              ["todo", "Sans réponse"],
            ] as const
          ).map(([value, text]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {text}
            </Button>
          ))}
        </div>
        <QueryState query={feedback}>
          {reviews.length ? (
            <ul className="grid gap-2" data-testid="company-reviews">
              {reviews.map((review) => {
                const kind = review.targetKind === "vessel" ? "vessel" : "company";
                return (
                  <li
                    key={review.id}
                    className="grid gap-1.5 rounded-xl border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <strong>{review.vesselName ?? ctx.companyName}</strong>
                        <span className="block text-xs text-muted-foreground">
                          Avis d'un voyageur · {ctx.when(review.date)}
                        </span>
                      </span>
                      <em className="bo-pill">{reviewSummary(review)}</em>
                    </div>
                    {review.scores ? (
                      <p className="text-xs text-muted-foreground">
                        {reviewCriteria[kind]
                          .filter((c) => typeof review.scores?.[c.code] === "number")
                          .map((c) => `${c.label} ${review.scores![c.code]}/5`)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {review.comment ? (
                      <p className="whitespace-pre-line">« {review.comment} »</p>
                    ) : null}
                    <ReplyBlock
                      ctx={ctx}
                      targetKind={review.kind}
                      targetId={review.id}
                      kind="reply"
                      replies={data!.replies}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bo-empty">
              {filter === "todo"
                ? "Tous les avis ont une réponse."
                : "Aucun avis publié pour l'instant."}
            </p>
          )}
        </QueryState>
      </section>
    </div>
  );
}

// ─── Signalements ────────────────────────────────────────────────────────────────────────────

const alertText = (alert: FeedbackAlert) =>
  alertLabel({
    category: alert.category,
    detail: alert.detail,
    delay_minutes: alert.delayMinutes,
  } as unknown as TravelAlert);

export function CompanySignalsTab({ ctx, live }: { ctx: VoiceContext; live: ReactNode }) {
  const feedback = useCompanyFeedback(ctx.companyId);
  const data = feedback.data;
  return (
    <div className="grid gap-3.5">
      <section className="bo-card">
        <h2>
          <Radio aria-hidden /> En ce moment
          <small>visible par les voyageurs</small>
        </h2>
        {live}
      </section>
      <section className="bo-card">
        <h2>
          <Flag aria-hidden /> 30 derniers jours
          <small>répondre ou contester</small>
        </h2>
        <p className="bo-lead mb-2">
          Une réponse est publiée sous le signalement après relecture. Une contestation est lue par
          BledWay seulement : elle ne supprime ni ne masque rien.
        </p>
        <QueryState query={feedback}>
          {data?.alerts.length ? (
            <ul className="grid gap-2" data-testid="company-alerts">
              {data.alerts.map((alert) => {
                const live = !alert.resolved && new Date(alert.expiresAt).getTime() > Date.now();
                return (
                  <li
                    key={alert.id}
                    className="grid gap-1.5 rounded-xl border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <strong>{alertText(alert)}</strong>
                        <span className="block text-xs text-muted-foreground">
                          {alert.vesselName} · {ctx.when(alert.date)}
                          {alert.onSite ? " · signalé sur place" : ""}
                        </span>
                      </span>
                      <span className="flex flex-none flex-wrap gap-1">
                        {alert.validated ? <em className="bo-pill">Vérifié par BledWay</em> : null}
                        <em className="bo-pill" data-tone={live ? "warn" : "mute"}>
                          {live ? "En cours" : "Terminé"}
                        </em>
                      </span>
                    </div>
                    <ReplyBlock
                      ctx={ctx}
                      targetKind="alert"
                      targetId={alert.id}
                      kind="reply"
                      replies={data.replies}
                    />
                    <ReplyBlock
                      ctx={ctx}
                      targetKind="alert"
                      targetId={alert.id}
                      kind="contest"
                      replies={data.replies}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bo-empty">Aucun signalement sur vos navires ces 30 derniers jours.</p>
          )}
        </QueryState>
      </section>
    </div>
  );
}

// ─── Fiche publique et photos ────────────────────────────────────────────────────────────────

export function CompanyProfileTab({
  ctx,
  logo,
  publicHref,
}: {
  ctx: VoiceContext;
  logo: ReactNode;
  publicHref: string;
}) {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: deskKeys.profile(user?.id ?? "", ctx.companyId),
    queryFn: () =>
      companyAccessRequest<CompanyProfile>({ action: "profile", companyId: ctx.companyId }),
    enabled: Boolean(user),
    // Les liens des photos en relecture expirent au bout de 10 minutes.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  return (
    <div className="grid gap-3.5">
      <section className="bo-card">
        <h2>
          <Building2 aria-hidden /> {ctx.companyName}
          <small>
            <a className="bo-link" href={publicHref} target="_blank" rel="noreferrer">
              Voir la fiche publique <ExternalLink aria-hidden />
            </a>
          </small>
        </h2>
        <QueryState query={profile}>
          {profile.data ? <ProfileForm ctx={ctx} profile={profile.data} logo={logo} /> : null}
        </QueryState>
      </section>
      {profile.data ? <Galleries ctx={ctx} profile={profile.data} /> : null}
    </div>
  );
}

function ProfileForm({
  ctx,
  profile,
  logo,
}: {
  ctx: VoiceContext;
  profile: CompanyProfile;
  logo: ReactNode;
}) {
  const refresh = useDeskRefresh();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const changed = PROFILE_FIELDS.filter(
    (field) =>
      field.key in values && values[field.key]!.trim() !== (profile.fields[field.key] ?? ""),
  );
  const errors = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [
      field.key,
      profileFieldError(field.key, values[field.key] ?? ""),
    ]),
  ) as Record<ProfileField, string | null>;
  const invalid = changed.some((field) => errors[field.key]);
  const open = profile.proposals.find((item) => item.status === "submitted");
  const propose = useMutation({
    mutationFn: () =>
      companyAccessRequest({
        action: "profile_propose",
        companyId: ctx.companyId,
        changes: Object.fromEntries(changed.map((field) => [field.key, values[field.key]!.trim()])),
        ...(message.trim() ? { message: message.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Proposition envoyée : BledWay la relit avant de modifier la fiche.");
      setEditing(false);
      setValues({});
      setMessage("");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => companyAccessRequest({ action: "profile_withdraw", id }),
    onSuccess: () => {
      toast.success("Proposition retirée.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const label = (key: string) => PROFILE_FIELDS.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="grid gap-3">
      {editing ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (changed.length && !invalid) propose.mutate();
          }}
        >
          <p className="bo-lead">
            Modifiez seulement ce qui doit changer. Laisser un champ vide demande de l'effacer.
            {open ? " Votre proposition en relecture sera remplacée par celle-ci." : ""}
          </p>
          {PROFILE_FIELDS.map((field) => {
            const value = values[field.key] ?? profile.fields[field.key] ?? "";
            const error = field.key in values ? errors[field.key] : null;
            const id = `profile-${field.key}`;
            return (
              <div key={field.key} className="grid gap-1 text-sm">
                <label htmlFor={id} className="font-semibold">
                  {field.label}
                </label>
                {field.key === "description" ? (
                  <Textarea
                    id={id}
                    rows={4}
                    maxLength={1000}
                    value={value}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  />
                ) : (
                  <Input
                    id={id}
                    value={value}
                    inputMode={
                      field.key === "phone"
                        ? "tel"
                        : field.key === "contact_email"
                          ? "email"
                          : "url"
                    }
                    maxLength={field.key === "phone" ? 40 : 300}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  />
                )}
                <span
                  className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                >
                  {error ?? field.hint}
                </span>
              </div>
            );
          })}
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Message pour BledWay (facultatif)</span>
            <Input
              value={message}
              maxLength={500}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!changed.length || invalid || propose.isPending}
            >
              <Send className="size-4" aria-hidden />
              {changed.length
                ? `Proposer ${changed.length} correction${changed.length > 1 ? "s" : ""}`
                : "Aucun changement"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => (setEditing(false), setValues({}))}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="bo-facts bo-facts--wide">
            <div>
              <dt>Logo</dt>
              <dd>{logo}</dd>
            </div>
            {PROFILE_FIELDS.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd className="break-words">{profile.fields[field.key] || "Non renseigné"}</dd>
              </div>
            ))}
          </dl>
          {ctx.canAct ? (
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => setEditing(true)}
            >
              Proposer une correction
            </Button>
          ) : null}
          <p className="bo-lead">Le nom et le logo se changent avec votre interlocuteur BledWay.</p>
        </>
      )}
      {profile.proposals.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Vos propositions</h3>
          <ul className="grid gap-2">
            {profile.proposals.map((item) => (
              <li key={item.id} className="grid gap-1 rounded-xl border border-border p-3 text-sm">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{ctx.when(item.createdAt)}</span>
                  <em className="bo-pill" data-tone={PROPOSAL_STATUS[item.status].tone}>
                    {PROPOSAL_STATUS[item.status].label}
                  </em>
                </span>
                <ul className="grid gap-0.5">
                  {Object.entries(item.changes).map(([key, value]) => (
                    <li key={key} className="break-words">
                      <strong>{label(key)} : </strong>
                      {value || <em>à effacer</em>}
                    </li>
                  ))}
                </ul>
                {item.decisionNote ? (
                  <Note>
                    <strong>Réponse de BledWay : </strong>
                    {item.decisionNote}
                  </Note>
                ) : null}
                {ctx.canAct && item.status === "submitted" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="justify-self-start"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(item.id)}
                  >
                    <Undo2 className="size-4" aria-hidden /> Retirer
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Galleries({ ctx, profile }: { ctx: VoiceContext; profile: CompanyProfile }) {
  const galleries = [{ id: null as string | null, name: ctx.companyName }, ...profile.fleet];
  return (
    <section className="bo-card">
      <h2>
        <Camera aria-hidden /> Photos informatives
        <small>relues par BledWay</small>
      </h2>
      <p className="bo-lead mb-2">
        Des photos qui aident les voyageurs : ponts, cabines, espaces, embarquement. Pas de
        publicité ni de texte incrusté. {GALLERY_LIMIT} photos par galerie au plus. Les visages et
        les plaques sont floutés avant l'envoi.
      </p>
      <div className="grid gap-4">
        {galleries.map((gallery) => (
          <Gallery
            key={gallery.id ?? "company"}
            ctx={ctx}
            vesselId={gallery.id}
            title={gallery.id ? gallery.name : `Galerie de ${gallery.name}`}
            photos={profile.photos.filter((photo) => photo.vesselId === gallery.id)}
          />
        ))}
      </div>
    </section>
  );
}

function Gallery({
  ctx,
  vesselId,
  title,
  photos,
}: {
  ctx: VoiceContext;
  vesselId: string | null;
  title: string;
  photos: CompanyPhoto[];
}) {
  const refresh = useDeskRefresh();
  const [adding, setAdding] = useState(false);
  const live = photos.filter((photo) => photo.status === "pending" || photo.status === "published");
  const withdraw = useMutation({
    mutationFn: (id: string) => companyAccessRequest({ action: "photo_withdraw", id }),
    onSuccess: () => {
      toast.success("Photo retirée.");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="font-normal text-muted-foreground">
            {live.length}/{GALLERY_LIMIT}
          </span>
        </h3>
        {ctx.canAct && live.length < GALLERY_LIMIT && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Camera className="size-4" aria-hidden /> Ajouter une photo
          </Button>
        ) : null}
      </div>
      {adding ? <PhotoForm ctx={ctx} vesselId={vesselId} onClose={() => setAdding(false)} /> : null}
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="grid content-start gap-1 rounded-xl border border-border p-1.5 text-xs"
            >
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={photo.caption}
                  loading="lazy"
                  width={photo.width}
                  height={photo.height}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ) : (
                <span className="grid aspect-[4/3] place-items-center rounded-lg bg-muted text-muted-foreground">
                  Aperçu indisponible
                </span>
              )}
              <span className="flex items-center justify-between gap-1">
                <em className="bo-pill" data-tone={PHOTO_STATUS[photo.status].tone}>
                  {PHOTO_STATUS[photo.status].label}
                </em>
                {ctx.canAct && (photo.status === "pending" || photo.status === "published") ? (
                  <button
                    type="button"
                    className="bo-link min-h-8"
                    aria-label={`Retirer la photo « ${photo.caption} »`}
                    disabled={withdraw.isPending}
                    onClick={() => {
                      if (window.confirm("Retirer cette photo ? Elle sera effacée."))
                        withdraw.mutate(photo.id);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </span>
              <span className="line-clamp-2">{photo.caption}</span>
              {photo.credit ? (
                <span className="text-muted-foreground">© {photo.credit}</span>
              ) : null}
              {photo.decisionNote ? <Note>{photo.decisionNote}</Note> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="bo-empty">Aucune photo pour l'instant.</p>
      )}
    </div>
  );
}

function PhotoForm({
  ctx,
  vesselId,
  onClose,
}: {
  ctx: VoiceContext;
  vesselId: string | null;
  onClose: () => void;
}) {
  const refresh = useDeskRefresh();
  const [prepared, setPrepared] = useState<{
    blob: Blob;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState(false);
  const send = useMutation({
    mutationFn: async () =>
      companyAccessRequest({
        action: "photo_add",
        companyId: ctx.companyId,
        vesselId,
        caption: caption.trim(),
        ...(credit.trim() ? { credit: credit.trim() } : {}),
        rights: true,
        width: prepared!.width,
        height: prepared!.height,
        image: await blobToBase64(prepared!.blob),
      }),
    onSuccess: () => {
      toast.success("Photo envoyée : elle sera publiée après relecture par BledWay.");
      onClose();
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      const { preparePhoto } = await import("@/lib/photos/photos");
      const result = await preparePhoto(file);
      if (Math.min(result.width, result.height) < 200 || result.blob.size > 2 * 1024 * 1024)
        throw new Error("Photo trop petite ou trop lourde : choisissez-en une autre.");
      setPrepared(result);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPreparing(false);
    }
  };
  const ready = prepared && caption.trim().length >= 3 && rights;
  return (
    <form
      className="grid gap-2 rounded-xl border border-border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) send.mutate();
      }}
    >
      <label className="grid gap-1">
        <span className="font-semibold">Photo</span>
        <input
          type="file"
          accept="image/*"
          className="text-sm"
          disabled={preparing || send.isPending}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <span className="text-xs text-muted-foreground">
          {preparing
            ? "Préparation : réduction, floutage des visages et des plaques, retrait des données de l'appareil…"
            : "Réduite à 1 600 px, sans position GPS ni données de l'appareil."}
        </span>
      </label>
      {prepared ? (
        <img
          src={prepared.url}
          alt="Aperçu de la photo préparée"
          className="max-h-48 w-auto justify-self-start rounded-lg"
        />
      ) : null}
      <label className="grid gap-1">
        <span className="font-semibold">Légende</span>
        <Input
          value={caption}
          maxLength={200}
          placeholder="Par exemple : salon du pont 7, places assises"
          onChange={(event) => setCaption(event.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span className="font-semibold">Crédit (facultatif)</span>
        <Input
          value={credit}
          maxLength={120}
          placeholder="Auteur ou service"
          onChange={(event) => setCredit(event.target.value)}
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={rights}
          onChange={(event) => setRights(event.target.checked)}
        />
        <span>
          Je déclare que {ctx.companyName} détient les droits de diffusion de cette photo et que les
          personnes reconnaissables ont donné leur accord.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!ready || send.isPending}>
          <Send className="size-4" aria-hidden /> Envoyer à BledWay
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ─── Responsable de compagnie ────────────────────────────────────────────────────────────────

export function CompanyManagerPanel({ ctx }: { ctx: VoiceContext }) {
  const { user } = useAuth();
  const refresh = useDeskRefresh();
  const overview = useQuery({
    queryKey: deskKeys.manager(user?.id ?? "", ctx.companyId),
    queryFn: () =>
      companyAccessRequest<ManagerOverview>({
        action: "manager_overview",
        companyId: ctx.companyId,
      }),
    enabled: Boolean(user),
    staleTime: 0,
    retry: false,
  });
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<CompanyLevel>("read");
  const [verification, setVerification] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      companyAccessRequest<{ link: string }>({
        action: "manager_invite",
        companyId: ctx.companyId,
        email: email.trim(),
        level,
        verification: verification.trim(),
      }),
    onSuccess: (data) => {
      setLink(data.link);
      setEmail("");
      setVerification("");
      setInviting(false);
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const act = useMutation({
    mutationFn: (input: Record<string, unknown>) => companyAccessRequest(input),
    onSuccess: () => {
      toast.success("Modification enregistrée.");
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh(error);
    },
  });
  const ask = (text: string) => {
    const answer = window.prompt(text);
    return answer && answer.trim().length ? answer.trim() : null;
  };

  return (
    <section className="bo-card">
      <h2>
        <UserRound aria-hidden /> Gérer l'équipe
        <small>vous êtes responsable</small>
      </h2>
      <p className="bo-lead mb-2">
        Vous invitez vos collaborateurs et ajustez leurs accès. Chaque action est enregistrée et
        visible par BledWay. Les autres responsables se gèrent avec BledWay.
      </p>
      {link ? (
        <div className="mb-3 grid gap-2 rounded-xl border border-border p-3 text-sm" role="status">
          <strong>Lien d'invitation, valable 7 jours, montré une seule fois</strong>
          <code className="break-all rounded bg-muted p-2 text-xs">{link}</code>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(() => toast.success("Lien copié."))
              }
            >
              <Copy className="size-4" aria-hidden /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
              Fermer
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Envoyez-le vous-même à la personne. Il ne fonctionne qu'avec un compte à cette adresse
            e-mail.
          </span>
        </div>
      ) : null}
      {inviting ? (
        <form
          className="mb-3 grid gap-2 rounded-xl border border-border p-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <label className="grid gap-1">
            <span className="font-semibold">Adresse e-mail professionnelle</span>
            <Input
              type="email"
              required
              value={email}
              maxLength={255}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <fieldset className="grid gap-1">
            <legend className="font-semibold">Niveau</legend>
            {(["read", "operations"] as const).map((value) => (
              <label key={value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="level"
                  className="mt-1"
                  checked={level === value}
                  onChange={() => setLevel(value)}
                />
                <span>
                  <strong>{LEVEL_CATALOG[value].label}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {LEVEL_CATALOG[value].summary}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1">
            <span className="font-semibold">Comment avez-vous vérifié cette personne ?</span>
            <Input
              required
              minLength={3}
              maxLength={500}
              value={verification}
              placeholder="Par exemple : collègue du service escale, vu en personne"
              onChange={(event) => setVerification(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={invite.isPending || verification.trim().length < 3}
            >
              Créer le lien
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setInviting(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="outline" className="mb-3" onClick={() => setInviting(true)}>
          <UserPlus className="size-4" aria-hidden /> Inviter un collaborateur
        </Button>
      )}
      <QueryState query={overview}>
        <ul className="grid gap-2" data-testid="manager-members">
          {(overview.data?.members ?? []).map((member) => {
            const editable = !member.you && !member.manager;
            return (
              <li
                key={member.id}
                className="grid gap-1 rounded-xl border border-border p-3 text-sm"
              >
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <strong>
                      {member.name}
                      {member.you ? " (vous)" : ""}
                    </strong>
                    <span className="block break-all text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {member.manager ? <em className="bo-pill">Responsable</em> : null}
                    <em
                      className="bo-pill"
                      data-tone={member.level === "operations" ? undefined : "mute"}
                    >
                      {LEVEL_CATALOG[member.level].label}
                    </em>
                    {member.status === "suspended" ? (
                      <em className="bo-pill" data-tone="bad">
                        Suspendu
                      </em>
                    ) : null}
                  </span>
                </span>
                {member.reason ? (
                  <span className="text-xs text-muted-foreground">Motif : {member.reason}</span>
                ) : null}
                {editable ? (
                  <span className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate({
                          action: "manager_member",
                          memberId: member.id,
                          change: "level",
                          level: member.level === "read" ? "operations" : "read",
                        })
                      }
                    >
                      Passer en{" "}
                      {LEVEL_CATALOG[member.level === "read" ? "operations" : "read"].label}
                    </Button>
                    {member.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={act.isPending}
                        onClick={() => {
                          const reason = ask("Motif de la suspension (visible par BledWay) :");
                          if (reason)
                            act.mutate({
                              action: "manager_member",
                              memberId: member.id,
                              change: "suspend",
                              reason,
                            });
                        }}
                      >
                        Suspendre
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({
                            action: "manager_member",
                            memberId: member.id,
                            change: "resume",
                          })
                        }
                      >
                        Réactiver
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={act.isPending}
                      onClick={() => {
                        const reason = ask("Motif du retrait de l'accès (visible par BledWay) :");
                        if (reason)
                          act.mutate({
                            action: "manager_member",
                            memberId: member.id,
                            change: "revoke",
                            reason,
                          });
                      }}
                    >
                      Retirer l'accès
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {overview.data?.invites.length ? (
          <div className="mt-3 grid gap-2">
            <h3 className="text-sm font-semibold">Invitations en attente</h3>
            <ul className="grid gap-2">
              {overview.data.invites.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="break-all">{item.email}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {LEVEL_CATALOG[item.level].label} · expire {ctx.when(item.expiresAt)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({ action: "manager_invite_revoke", inviteId: item.id })
                    }
                  >
                    Annuler
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </QueryState>
    </section>
  );
}
