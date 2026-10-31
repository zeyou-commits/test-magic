import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ClipboardCheck, PartyPopper } from "lucide-react";
import { SeaIcon } from "./SeaForecast";
import { seaLevel } from "@/lib/ferry/seaState";
import { toast } from "sonner";
import {
  currentPhase,
  defaultProfile,
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

function openRoute() {
  window.sessionStorage.setItem("bledway:open-home-action", "itinerary");
  if (window.location.pathname === "/") window.dispatchEvent(new Event("bledway:open-itinerary"));
  else window.location.assign("/");
}

function ItemLink({ item }: { item: PrepItem }) {
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
}: {
  departureId: string;
  departureAt: string;
  userId: string;
  direction?: TripDirection;
  /** Vagues prévues : un rappel la veille si la mer s'annonce agitée. */
  seaPeak?: number | null;
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
  const items = itemsFor(data.profile, direction);
  const progress = prepProgress(data, direction);
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
    <section className="bw-prep" aria-label="Préparer ma traversée">
      <header className="bw-prep__head">
        <h3>
          <ClipboardCheck size={17} aria-hidden /> {direction === "return" ? "Mon retour" : "Mon parcours"}
        </h3>
        <strong>
          {progress.done}/{progress.total}
        </strong>
        <span className="bw-prep__bar" aria-hidden>
          <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </span>
      </header>

      {progress.next ? (
        <div className="bw-prep__next">
          <small>Prochaine étape</small>
          <strong>{progress.next.label}</strong>
          <div>
            <button type="button" onClick={() => toggle(progress.next!)}>
              <Check size={14} aria-hidden /> C’est fait
            </button>
            <ItemLink item={progress.next} />
          </div>
        </div>
      ) : (
        <p className="bw-prep__next" data-complete>
          <PartyPopper size={18} aria-hidden /> {direction === "return" ? "Tout est prêt. Bon retour !" : "Tout est prêt. Bonne traversée !"}
        </p>
      )}

      <div className="bw-prep__steps" role="tablist" aria-label="Étapes">
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
              <SeaIcon peak={seaPeak} size={20} /> {seaLevel(seaPeak).label} prévue : si vous êtes sensible au
              mal de mer, prévoyez de quoi vous soulager.
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
                  <ItemLink item={item} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <details className="bw-prep__trip">
        <summary>
          <span>Mon voyage : {summary || "à pied, sans cabine"}</span>
          <ChevronDown size={15} aria-hidden />
        </summary>
        <div role="group" aria-label="Mon voyage">
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
        Un aide-mémoire : les règles officielles et votre billet restent la référence.
      </p>
    </section>
  );
}
