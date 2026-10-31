import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ClipboardCheck } from "lucide-react";
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
        {item.linkLabel} <ArrowRight size={12} aria-hidden />
      </button>
    );
  if (!item.href) return null;
  return (
    <a href={item.href}>
      {item.linkLabel} <ArrowRight size={12} aria-hidden />
    </a>
  );
}

/** Le parcours de préparation d'une traversée : les bonnes choses, au bon moment. */
export function TripPreparation({
  departureId,
  departureAt,
  userId,
}: {
  departureId: string;
  departureAt: string;
  userId: string;
}) {
  const client = useQueryClient();
  const query = preparationQuery(departureId, userId);
  const data = useQuery(query).data ?? { profile: defaultProfile, done: [] };
  const daysLeft = Math.floor((Date.parse(departureAt) - Date.now()) / 86_400_000);
  const [open, setOpen] = useState<PrepPhase>(() => currentPhase(daysLeft));
  useEffect(() => setOpen(currentPhase(daysLeft)), [departureId, daysLeft]);
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
  const items = itemsFor(data.profile);
  const progress = prepProgress(data);
  return (
    <section className="bw-prep" aria-label="Préparer ma traversée">
      <header className="bw-prep__head">
        <h3>
          <ClipboardCheck size={16} aria-hidden /> Préparer ma traversée
        </h3>
        <strong>
          {progress.done}/{progress.total}
        </strong>
        <span className="bw-prep__bar" aria-hidden>
          <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </span>
      </header>
      <div className="bw-prep__profile" role="group" aria-label="Mon voyage">
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
      {phases.map((phase) => {
        const list = items.filter((item) => item.phase === phase.id);
        if (!list.length) return null;
        const count = list.filter((item) => data.done.includes(item.id)).length;
        return (
          <details
            key={phase.id}
            className="bw-prep__phase"
            open={open === phase.id}
            onToggle={(event) => {
              if (event.currentTarget.open) setOpen(phase.id);
            }}
          >
            <summary>
              <span>
                {phase.title} <small>{phase.when}</small>
              </span>
              <b data-complete={count === list.length || undefined}>
                {count}/{list.length}
              </b>
            </summary>
            <ul>
              {list.map((item) => {
                const done = data.done.includes(item.id);
                return (
                  <li key={item.id} data-done={done || undefined}>
                    <label>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={done}
                        onChange={() =>
                          save.mutate({
                            ...data,
                            done: done
                              ? data.done.filter((id) => id !== item.id)
                              : [...data.done, item.id],
                          })
                        }
                      />
                      <span aria-hidden>{done ? <Check size={12} /> : null}</span>
                      {item.label}
                    </label>
                    <ItemLink item={item} />
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      <p className="bw-prep__note">
        Un aide-mémoire : les règles officielles et votre billet restent la référence.
      </p>
    </section>
  );
}
