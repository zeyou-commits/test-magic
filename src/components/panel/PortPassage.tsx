import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { CabasImg } from "@/components/CabasImg";
import { useAuth } from "@/hooks/useAuth";
import {
  mergeTripSteps,
  presenceKey,
  presenceQuery,
  setTripStatus,
  tripStepsQuery,
  type TripStatus,
} from "@/lib/ferry/presence";
import { formatDocked, passageQuestion } from "@/lib/ferry/portPassage";
import { postToRoom } from "@/lib/ferry/chat";
import { roomKey } from "./LiveRoom";

const voyageurs = (n: number) => `${n} voyageur${n > 1 ? "s" : ""} BledWay`;
const STEPS: TripStatus[] = ["landing", "controls", "arrived"];

/** Carte de l'arrivée : depuis combien de temps à quai, qui reste dans le port, une question à un doigt. */
export function PortPassage({
  departureId,
  portName,
  minutes,
  status,
}: {
  departureId: string;
  portName: string;
  minutes: number | null;
  status: TripStatus | null;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [answered, setAnswered] = useState(false);
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const row = useQuery(presenceQuery).data?.find((item) => item.departure_id === departureId);
  const inPort = (row?.landing ?? 0) + (row?.controls ?? 0);
  const out = row?.arrived ?? 0;
  const { question, answers } = passageQuestion(status);
  const step = useMutation({
    mutationFn: (next: TripStatus) => setTripStatus(departureId, next),
    onSuccess: () => {
      setAnswered(false);
      void client.invalidateQueries({ queryKey: presenceKey });
    },
  });
  const answer = useMutation({
    mutationFn: (text: string) => postToRoom("crossing", departureId, text),
    onSuccess: () => {
      setAnswered(true);
      void client.invalidateQueries({ queryKey: roomKey("crossing", departureId) });
    },
  });
  return (
    <div className="bw-passage">
      <p className="bw-passage__time">
        <strong>
          {minutes === null ? `Au port de ${portName}` : `À quai depuis ${formatDocked(minutes)}`}
        </strong>
        {inPort || out ? (
          <small>
            {inPort ? `${voyageurs(inPort)} encore dans le port` : ""}
            {inPort && out ? " · " : ""}
            {out ? `${out} sorti${out > 1 ? "s" : ""}` : ""}
          </small>
        ) : (
          <small>{minutes === null ? "" : `Port de ${portName}`}</small>
        )}
      </p>
      {user ? (
        <div className="bw-passage__steps" role="group" aria-label="Où en êtes-vous ?">
          {STEPS.map((id) => {
            const item = steps.find((entry) => entry.id === id)!;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={status === id}
                disabled={step.isPending}
                onClick={() => step.mutate(id)}
              >
                <CabasImg src={item.image} alt="" width={28} height={28} loading="lazy" />
                {item.short}
              </button>
            );
          })}
        </div>
      ) : null}
      {user && status !== "arrived" ? (
        answered ? (
          <p className="bw-passage__thanks" role="status">
            <Check size={14} aria-hidden /> Merci, c'est partagé dans le salon.
          </p>
        ) : (
          <div className="bw-passage__ask">
            <b>{question}</b>
            <span>
              {answers.map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate(text)}
                >
                  {text}
                </button>
              ))}
            </span>
          </div>
        )
      ) : null}
      {answer.error || step.error ? (
        <p role="alert" className="bw-passage__error">
          {(answer.error ?? step.error)?.message}
        </p>
      ) : null}
    </div>
  );
}
