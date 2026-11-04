import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { nextDates, plannedVessel, type Recurrence } from "@/lib/ferry/recurrence";

// Colonnes et fonctions du script « calendrier_recurrent », absentes des types générés.
const db = typedSupabase as unknown as SupabaseClient;

export type RecurrenceDraft = {
  weekdays: number[];
  valid_from: string;
  valid_to: string;
  default_vessel_id: string;
  every_weeks: number;
  /** Vide : toujours le même navire. */
  vessel_rotation: string[];
};

type DateRule = { exception_date: string; exception_type: string; new_vessel_id: string | null };

const FREQUENCIES = [1, 2, 3, 4];
const shortDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const today = () => new Date().toISOString().slice(0, 10);

const asRecurrence = (draft: RecurrenceDraft): Recurrence => ({
  weekdays: draft.weekdays,
  valid_from: draft.valid_from,
  valid_to: draft.valid_to || null,
  default_vessel_id: draft.default_vessel_id || null,
  every_weeks: draft.every_weeks,
  vessel_rotation: draft.vessel_rotation,
});

/**
 * Fréquence, navires en alternance et aperçu des prochaines dates d'un calendrier.
 * Sur un calendrier déjà enregistré, chaque date peut recevoir un autre navire ou être sautée.
 */
export function ScheduleRecurrenceFields({
  draft,
  onChange,
  vessels,
  scheduleId,
  ready,
}: {
  draft: RecurrenceDraft;
  onChange: (change: Partial<RecurrenceDraft>) => void;
  vessels: { id: string; name: string }[];
  /** Calendrier enregistré (et inchangé) : ses dates se règlent une par une. */
  scheduleId: string | null;
  /** Le script est exécuté : fréquence et alternance sont disponibles. */
  ready: boolean;
}) {
  const client = useQueryClient();
  const rotating = draft.vessel_rotation.length > 0;
  const vesselName = (id: string | null | undefined) =>
    (id && vessels.find((vessel) => vessel.id === id)?.name) || "À affecter";
  const recurrence = asRecurrence(draft);
  const dates = draft.weekdays.length ? nextDates(recurrence, today(), 8) : [];

  const rulesKey = ["admin", "schedule-dates", scheduleId];
  const rules = useQuery({
    queryKey: rulesKey,
    enabled: Boolean(scheduleId),
    queryFn: async () => {
      const { data, error } = await db
        .from("schedule_exceptions")
        .select("exception_date,exception_type,new_vessel_id")
        .eq("schedule_id", scheduleId!)
        .gte("exception_date", today());
      if (error) throw new Error(error.message);
      return new Map((data as DateRule[]).map((row) => [row.exception_date, row]));
    },
  });
  const setDate = useMutation({
    mutationFn: async (input: { day: string; vessel: string | null; skip: boolean }) => {
      const { error } = await db.rpc("bw_schedule_set_date", {
        _schedule: scheduleId,
        _day: input.day,
        _vessel: input.vessel,
        _skip: input.skip,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: rulesKey });
      void client.invalidateQueries({ queryKey: ["departures"] });
      toast.success("Date mise à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setRotation = (next: string[]) =>
    onChange({ vessel_rotation: next, default_vessel_id: next[0] ?? draft.default_vessel_id });

  return (
    <div className="mt-4 grid gap-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Fréquence</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Fréquence">
          {FREQUENCIES.map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              role="radio"
              aria-checked={draft.every_weeks === n}
              variant={draft.every_weeks === n ? "default" : "outline"}
              disabled={!ready && n > 1}
              onClick={() => onChange({ every_weeks: n })}
            >
              {n === 1 ? "Chaque semaine" : `Toutes les ${n} semaines`}
            </Button>
          ))}
        </div>
        {draft.every_weeks > 1 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Comptées à partir de la semaine du {shortDate(draft.valid_from)} (1re semaine de
            départ).
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Navire</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Navire">
          <Button
            type="button"
            size="sm"
            role="radio"
            aria-checked={!rotating}
            variant={rotating ? "outline" : "default"}
            onClick={() => setRotation([])}
          >
            Toujours le même
          </Button>
          <Button
            type="button"
            size="sm"
            role="radio"
            aria-checked={rotating}
            variant={rotating ? "default" : "outline"}
            disabled={!ready}
            onClick={() =>
              !rotating &&
              setRotation([draft.default_vessel_id || vessels[0]?.id || ""].filter(Boolean))
            }
          >
            Change selon la semaine
          </Button>
        </div>
        {!ready ? (
          <p className="mt-1 text-[11px] text-amber-800">
            Fréquence et alternance : exécutez d'abord le script « calendrier_recurrent ».
          </p>
        ) : null}
        {rotating ? (
          <ol className="mt-2 grid gap-1.5">
            {draft.vessel_rotation.map((id, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-xs text-muted-foreground">
                  {index + 1}
                  {index === 0 ? "re" : "e"} semaine de départ
                </span>
                <select
                  aria-label={`Navire de la semaine ${index + 1}`}
                  value={id}
                  onChange={(event) =>
                    setRotation(
                      draft.vessel_rotation.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                  className="h-9 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm"
                >
                  {vessels.map((vessel) => (
                    <option key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Retirer la semaine ${index + 1}`}
                  disabled={draft.vessel_rotation.length === 1}
                  onClick={() => setRotation(draft.vessel_rotation.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
            <li>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.vessel_rotation.length >= 12 || !vessels.length}
                onClick={() =>
                  setRotation([
                    ...draft.vessel_rotation,
                    vessels.find((v) => !draft.vessel_rotation.includes(v.id))?.id ??
                      vessels[0]!.id,
                  ])
                }
              >
                <Plus className="size-4" /> Ajouter une semaine
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Puis l'alternance recommence. Pour une seule date différente, réglez-la dans
                l'aperçu ci-dessous.
              </p>
            </li>
          </ol>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Prochains départs</p>
        {!dates.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Choisissez au moins un jour et une période valide.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border">
            {dates.map((day) => {
              const rule = rules.data?.get(day);
              const skipped = rule?.exception_type === "cancellation";
              const chosen = rule?.new_vessel_id ?? null;
              const planned = plannedVessel(recurrence, day);
              return (
                <li key={day} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                  <span className={`w-28 shrink-0 ${skipped ? "line-through opacity-60" : ""}`}>
                    {shortDate(day)}
                  </span>
                  {scheduleId && ready && !skipped ? (
                    <select
                      aria-label={`Navire du ${shortDate(day)}`}
                      value={chosen ?? ""}
                      disabled={setDate.isPending}
                      onChange={(event) =>
                        setDate.mutate({ day, vessel: event.target.value || null, skip: false })
                      }
                      className={`h-8 min-w-0 flex-1 rounded-md border px-2 text-sm ${chosen ? "border-sky-400 bg-sky-50" : "bg-white"}`}
                    >
                      <option value="">{vesselName(planned)} (prévu)</option>
                      {vessels.map((vessel) => (
                        <option key={vessel.id} value={vessel.id}>
                          {vessel.name}, pour cette date
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {skipped ? "Date sautée" : vesselName(chosen ?? planned)}
                    </span>
                  )}
                  {scheduleId && ready ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={setDate.isPending}
                      onClick={() => setDate.mutate({ day, vessel: null, skip: !skipped })}
                    >
                      {skipped ? "Rétablir" : "Sauter"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!scheduleId && dates.length ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Après l'enregistrement, chaque date pourra recevoir un autre navire ou être sautée.
          </p>
        ) : null}
      </div>
    </div>
  );
}
