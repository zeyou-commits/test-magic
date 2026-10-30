import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { flashClient } from "@/lib/ferry/flash";
import {
  incidentMessageText,
  type IncidentImpact,
  type IncidentStatus,
} from "@/lib/ferry/incidents";
import {
  audiencePreviewQuery,
  BODY_MAX,
  messageAction,
  TITLE_MAX,
  type Audience,
} from "@/lib/notifications/messages";

const motifs: { id: IncidentImpact; label: string }[] = [
  { id: "confirmed", label: "Touché selon la source" },
  { id: "possible", label: "Susceptible d'être touché" },
  { id: "none", label: "Sans conséquence connue" },
];
type Target = { id: string; label: string; date: string; impact: IncidentImpact };

/**
 * Prévenir depuis le dossier : un message par date, adapté au motif de chaque départ, avec les
 * destinataires visibles. Rien ne part sans la confirmation de l'équipe.
 */
export function IncidentMessages({
  vesselId,
  vesselName,
  portName,
  status,
  sourceName,
  sourceUrl,
  targets,
  onBeforeSend,
}: {
  vesselId: string;
  vesselName: string;
  portName: string | undefined;
  status: IncidentStatus;
  sourceName: string;
  sourceUrl: string;
  targets: Target[];
  /** Enregistre le dossier : le message et la fiche publique disent la même chose. */
  onBeforeSend: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const incident = { status, source_name: sourceName };
  const generated = (impact: IncidentImpact) =>
    incidentMessageText(incident, vesselName, portName, impact);
  // Sélection de l'équipe ; à défaut, les départs concernés (le planning peut arriver après).
  const [manual, setManual] = useState<Set<string> | null>(null);
  const picked = manual ?? new Set(targets.filter((t) => t.impact !== "none").map((t) => t.id));
  const setPicked = setManual;
  const [title, setTitle] = useState(`${vesselName} : navire immobilisé`);
  const [edited, setEdited] = useState<Partial<Record<IncidentImpact, string>>>({});
  const [followers, setFollowers] = useState(true);
  const [flash, setFlash] = useState(status === "confirmed");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (status === "confirmed") setFlash(true);
  }, [status]);

  const chosen = targets.filter((t) => picked.has(t.id));
  const usedMotifs = motifs.filter((m) => chosen.some((t) => t.impact === m.id));
  const bodyOf = (impact: IncidentImpact) => edited[impact] ?? generated(impact);
  const audiences = useMemo(
    () => [
      ...chosen.map((t): Audience => ({ kind: "departure", departureId: t.id, who: "everyone" })),
      ...(followers ? [{ kind: "vessel_followers", vesselId } as Audience] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((t) => t.id).join(), followers, vesselId],
  );
  const previews = useQueries({
    queries: audiences.map((audience) => audiencePreviewQuery(user?.id, audience)),
  });
  const previewOf = (audience: Audience) => previews[audiences.indexOf(audience)]?.data;
  const reachable = previews.reduce((sum, p) => sum + (p.data?.reachable ?? 0), 0);
  const silent = previews.filter((p) => p.data && !p.data.reachable).length;
  const counting = previews.some((p) => p.isPending);
  const alreadySent = chosen.filter((t) => {
    const index = audiences.findIndex((a) => a.kind === "departure" && a.departureId === t.id);
    return previews[index]?.data?.duplicates.length;
  }).length;
  const publicStatus = status === "verifying" || status === "confirmed";
  const blocker = !publicStatus
    ? "Passez le dossier à « en cours de vérification » ou « immobilisé » : le message doit correspondre à ce que le public voit."
    : status === "confirmed" && !sourceName.trim()
      ? "Indiquez la source avant d'envoyer."
      : !audiences.length && !flash
        ? "Choisissez au moins une date, les personnes qui suivent le navire ou le Flash info."
        : "";

  const send = useMutation({
    mutationFn: async () => {
      await onBeforeSend();
      let sent = 0;
      let accounts = 0;
      const failed: string[] = [];
      for (const [index, audience] of audiences.entries()) {
        const preview = previews[index]?.data;
        if (!preview?.reachable) continue;
        const target =
          audience.kind === "departure" ? chosen.find((t) => t.id === audience.departureId) : null;
        const body = target
          ? `Traversée du ${target.date}. ${bodyOf(target.impact)}`
          : incidentMessageText(incident, vesselName, portName, "followers");
        try {
          await messageAction({
            action: "message-create",
            audience,
            template: "immobilized",
            title: title.trim(),
            body: body.slice(0, BODY_MAX),
            url: preview.context.url,
            sendAt: null,
            flash: false,
            catchUp: true,
          });
          sent++;
          accounts += preview.reachable;
        } catch {
          failed.push(target?.date ?? "personnes qui suivent le navire");
        }
      }
      let flashFailed = false;
      if (flash) {
        const startsAt = new Date();
        const { error } = await flashClient.from("bw_news").insert({
          kind: "alerte",
          origin: "bledway",
          vessel_id: vesselId,
          title: `${vesselName} : immobilisé${portName ? ` à ${portName}` : ""}`,
          summary: incidentMessageText(incident, vesselName, portName, "followers"),
          source_name: sourceName.trim().slice(0, 80),
          source_url: /^https:\/\//i.test(sourceUrl) ? sourceUrl.trim() : null,
          route_ids: [],
          port_ids: [],
          starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + 72 * 3_600_000).toISOString(),
          published: true,
          created_by: user?.id,
        });
        flashFailed = Boolean(error);
      }
      return { sent, accounts, failed, flashFailed };
    },
    onSuccess: ({ sent, accounts, failed, flashFailed }) => {
      setConfirming(false);
      if (sent) toast.success(`${sent} message(s) envoyé(s) à ${accounts} destinataire(s).`);
      else if (!flash || flashFailed) toast.info("Aucun message envoyé : personne à prévenir.");
      if (failed.length) toast.error(`Échec pour : ${failed.join(", ")}. Vous pouvez réessayer.`);
      if (flash && !flashFailed) toast.success("Alerte publiée en Flash info pour 72 h.");
      if (flashFailed) toast.error("Le Flash info n'a pas pu être publié.");
      void client.invalidateQueries({ queryKey: ["admin", "message-audience"] });
      void client.invalidateQueries({ queryKey: ["admin", "messages"] });
      void client.invalidateQueries({ queryKey: ["bw-news"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectBy = (test: (t: Target) => boolean) =>
    setPicked(new Set(targets.filter(test).map((t) => t.id)));

  return (
    <section className="grid gap-3">
      <div>
        <h3 className="font-semibold">Prévenir les voyageurs</h3>
        <p className="text-xs text-muted-foreground">
          Un message par date, selon son motif. Rien ne part sans votre confirmation.
        </p>
      </div>
      {targets.length ? (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sélection rapide">
            <Button size="sm" variant="outline" onClick={() => selectBy(() => true)}>
              Toutes les dates
            </Button>
            {motifs.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="outline"
                onClick={() => selectBy((t) => t.impact === m.id)}
              >
                {m.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => selectBy(() => false)}>
              Aucune
            </Button>
          </div>
          <ul className="grid gap-1">
            {targets.map((t) => {
              const audience = audiences.find(
                (a) => a.kind === "departure" && a.departureId === t.id,
              );
              const preview = audience ? previewOf(audience) : undefined;
              return (
                <li key={t.id}>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={picked.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setPicked(next);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block">{t.label}</strong>
                      {t.date} · {motifs.find((m) => m.id === t.impact)?.label}
                    </span>
                    {preview ? (
                      <span className="shrink-0 text-muted-foreground">
                        {preview.reachable} compte{preview.reachable > 1 ? "s" : ""}
                        {preview.duplicates.length ? " · déjà prévenu" : ""}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={followers}
          onChange={(e) => setFollowers(e.target.checked)}
        />
        <span>
          Prévenir aussi les personnes qui suivent le navire
          <small className="block text-muted-foreground">
            Un voyageur qui suit aussi le navire recevra les deux messages.
          </small>
        </span>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={flash}
          onChange={(e) => setFlash(e.target.checked)}
        />
        <span>
          Publier une alerte en Flash info, visible de tous pendant 72 h
          <small className="block text-muted-foreground">En rouge, en tête du fil.</small>
        </span>
      </label>
      <label className="grid gap-1 font-medium">
        Titre
        <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {usedMotifs.map((m) => (
        <label key={m.id} className="grid gap-1 font-medium">
          Message · {m.label}
          <textarea
            value={bodyOf(m.id)}
            maxLength={BODY_MAX - 40}
            onChange={(e) => setEdited({ ...edited, [m.id]: e.target.value })}
            className="min-h-20 rounded-md border border-input bg-background p-2 text-xs font-normal"
          />
        </label>
      ))}
      {blocker ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{blocker}</p>
      ) : confirming ? (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs">
          <p className="font-semibold">
            {audiences.length} envoi(s) · {reachable} destinataire(s)
            {flash ? " · Flash info" : ""}
          </p>
          {silent ? <p>{silent} sans destinataire : ignoré(s).</p> : null}
          {alreadySent ? (
            <p>{alreadySent} date(s) ont déjà reçu un message : doublon possible.</p>
          ) : null}
          <p>Un message envoyé ne peut pas être rappelé. Le dossier sera enregistré d'abord.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? "Envoi…" : "Confirmer l'envoi"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          className="justify-self-start"
          disabled={counting || title.trim().length < 4}
          onClick={() => setConfirming(true)}
        >
          {counting ? "Calcul des destinataires…" : "Vérifier et envoyer"}
        </Button>
      )}
    </section>
  );
}
