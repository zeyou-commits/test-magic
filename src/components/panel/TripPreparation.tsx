import { TicketAction } from "@/components/tickets/MyTickets";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ClipboardCheck, PartyPopper } from "lucide-react";
import { SeaIcon } from "./SeaForecast";
import { seaLevel } from "@/lib/ferry/seaState";
import { toast } from "sonner";
import {
  currentPhase,
  defaultProfile,
  itemForCompany,
  itemsFor,
  phases,
  prepProgress,
  preparationKey,
  preparationQuery,
  profileLabels,
  savePreparation,
  type PrepItem,
  type PrepPhase,
  type TripDirection,
  type Preparation,
} from "@/lib/ferry/preparation";
import { tr } from "@/lib/i18n";
import { papersProgress } from "@/content/formalites";

function openRoute() {
  window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-itinerary"));
  else window.location.assign("/");
}

/** « Mes papiers » : la liste faite sur la page des papiers, avec où on en est. */
function PapersLink({ item }: { item: PrepItem }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => setProgress(papersProgress()), []);
  return (
    <a href={item.href}>
      {progress ? `Mes papiers : ${progress.done} sur ${progress.total}` : item.linkLabel}{" "}
      <ArrowRight size={13} aria-hidden />
    </a>
  );
}

function ItemLink({ item, departureId }: { item: PrepItem; departureId?: string }) {
  // « Je vérifie mon billet » : ajouter le billet, ou le revoir.
  if (item.id === "tickets" && departureId) return <TicketAction departureId={departureId} />;
  if (item.id === "identity" && item.href) return <PapersLink item={item} />;
  if (item.itinerary)
    return (
      <button type="button" onClick={openRoute}>
        {item.linkLabel} <ArrowRight size={13} aria-hidden />
      </button>
    );
  if (!item.href) return null;
  return (
    <a href={item.href} {...(item.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
      {item.linkLabel} <ArrowRight size={13} aria-hidden />
    </a>
  );
}

/** Le parcours d'une traversée : une étape à la fois, et toujours la prochaine chose à faire. */
export function TripPreparation({
  departureId,
  departureAt,
  userId,
  direction = "outbound",
  seaPeak = null,
  company = null,
}: {
  departureId: string;
  departureAt: string;
  userId: string;
  direction?: TripDirection;
  /** Vagues prévues : un rappel la veille si la mer s'annonce agitée. */
  seaPeak?: number | null;
  /** Compagnie du voyage : l'enregistrement et la carte d'embarquement en dépendent. */
  company?: string | null | undefined;
}) {
  const client = useQueryClient();
  const query = preparationQuery(departureId, userId);
  const data = useQuery(query).data ?? { profile: defaultProfile, done: [] };
  const daysLeft = Math.floor((Date.parse(departureAt) - Date.now()) / 86_400_000);
  const [step, setStep] = useState<PrepPhase>(() => currentPhase(daysLeft));
  useEffect(() => setStep(currentPhase(daysLeft)), [departureId, daysLeft]);
  const save = useMutation({
    mutationFn: (next: Preparation) => savePreparation(departureId, userId, next),
    onMutate: (next) => {
      client.setQueryData(query.queryKey, next);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void client.invalidateQueries({ queryKey: preparationKey });
    },
  });
  const items = itemsFor(data.profile, direction).map((item) => itemForCompany(item, company));
  const progress = prepProgress(data, direction);
  const nextItem = progress.next ? itemForCompany(progress.next, company) : null;
  const steps = phases
    .map((phase) => {
      const list = items.filter((item) => item.phase === phase.id);
      return { ...phase, list, count: list.filter((item) => data.done.includes(item.id)).length };
    })
    .filter((phase) => phase.list.length);
  const active = steps.find((phase) => phase.id === step) ?? steps[0];
  const toggle = (item: PrepItem) => {
    const done = data.done.includes(item.id)
      ? data.done.filter((id) => id !== item.id)
      : [...data.done, item.id];
    save.mutate({ ...data, done });
  };
  const summary = profileLabels
    .filter(({ key }) => data.profile[key])
    .map(({ label }) => label.replace(/^(Avec des?|Avec un|En) /, ""))
    .join(" · ");
  return (
    <section className="bw-prep" aria-label={tr("ui.tripPreparation.preparerMaTraversee")}>
      <header className="bw-prep__head">
        <h3>
          <ClipboardCheck size={17} aria-hidden /> {direction === "return" ? tr("ui.tripPreparation.monRetour") : tr("ui.tripPreparation.monParcours")}
        </h3>
        <strong>
          {progress.done}/{progress.total}
        </strong>
        <span className="bw-prep__bar" aria-hidden>
          <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </span>
      </header>

      {nextItem ? (
        <div className="bw-prep__next">
          <small>{tr("ui.tripPreparation.prochaineEtape")}</small>
          <strong>{nextItem.label}</strong>
          {nextItem.tip ? <p className="bw-prep__tip">{nextItem.tip}</p> : null}
          <div>
            <button type="button" onClick={() => toggle(nextItem)}>
              <Check size={14} aria-hidden />{tr("ui.tripPreparation.cEstFait")}
            </button>
            <ItemLink item={nextItem} departureId={departureId} />
          </div>
        </div>
      ) : (
        <p className="bw-prep__next" data-complete>
          <PartyPopper size={18} aria-hidden /> {direction === "return" ? tr("ui.tripPreparation.toutEstPretBonRetour") : tr("ui.tripPreparation.toutEstPretBonneTraversee")}
        </p>
      )}

      <div className="bw-prep__steps" role="tablist" aria-label={tr("ui.tripPreparation.etapes")}>
        {steps.map((phase, index) => (
          <button
            key={phase.id}
            type="button"
            role="tab"
            aria-selected={phase.id === active?.id}
            data-complete={phase.count === phase.list.length || undefined}
            onClick={() => setStep(phase.id)}
          >
            <b>{phase.count === phase.list.length ? <Check size={13} aria-hidden /> : index + 1}</b>
            <span>{phase.title}</span>
            <small>
              {phase.count}/{phase.list.length}
            </small>
          </button>
        ))}
      </div>

      {active ? (
        <div role="tabpanel" aria-label={active.title}>
          <p className="bw-prep__when">{active.when}</p>
          {active.id === "eve" && seaPeak != null && seaPeak >= 1.25 ? (
            <p className="bw-prep__sea" role="note">
              <SeaIcon peak={seaPeak} size={20} /> {seaLevel(seaPeak).label}{tr("ui.tripPreparation.prevueSiVousEtesSensible")}
            </p>
          ) : null}
          <ul className="bw-prep__list">
            {active.list.map((item) => {
              const done = data.done.includes(item.id);
              return (
                <li key={item.id} data-done={done || undefined}>
                  <label>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={done}
                      onChange={() => toggle(item)}
                    />
                    <span aria-hidden>{done ? <Check size={13} /> : null}</span>
                    <em>{item.label}</em>
                  </label>
                  {item.tip ? <p className="bw-prep__tip">{item.tip}</p> : null}
                  <ItemLink item={item} departureId={departureId} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <details className="bw-prep__trip">
        <summary>
          <span>{tr("ui.tripPreparation.monVoyage")}{summary || tr("ui.tripPreparation.aPiedSansCabine")}</span>
          <ChevronDown size={15} aria-hidden />
        </summary>
        <div role="group" aria-label={tr("ui.tripPreparation.monVoyage2")}>
          {profileLabels.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={data.profile[key]}
              onClick={() =>
                save.mutate({ ...data, profile: { ...data.profile, [key]: !data.profile[key] } })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <p className="bw-prep__note">
        {tr("ui.tripPreparation.unAideMemoireLesRegles")}
      </p>
    </section>
  );
}
