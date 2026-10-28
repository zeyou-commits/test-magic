import { useEffect, useState } from "react";
import {
  communityKey as travellersKey,
  moodsFor,
  moodsQuery,
  myTravellerQuery,
  setMood,
} from "@/lib/community/travellers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  avatarFor,
  myTripStatusQuery,
  presenceKey,
  presenceQuery,
  mergeTripSteps,
  setTripStatus,
  tripStepsQuery,
  type TripStatus,
} from "@/lib/ferry/presence";
import {
  catalogQuery,
  communityKey,
  optionsFor,
  reportTravel,
  situationOf,
} from "@/lib/ferry/community";
import { requestQuickReport } from "@/components/map/QuickReport";
import { OptionIcon } from "./SituationIcon";

const PENDING_STATUS = "bledway:pending-trip-status";

/** Trois cabas empilés et un nombre : la présence des voyageurs BledWay, sans jamais dire qui. */
export function CabasStack({
  count,
  seed,
  size = 26,
}: {
  count: number;
  seed: string;
  size?: number;
}) {
  return (
    <span className="bw-cabas-stack" aria-hidden>
      {Array.from({ length: Math.min(3, count) }, (_, index) => (
        <img
          key={index}
          src={avatarFor(seed, index)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
        />
      ))}
    </span>
  );
}

const voyageurs = (n: number) => `${n} voyageur${n > 1 ? "s" : ""} BledWay`;

/** Fiche port : combien de voyageurs BledWay y sont en ce moment, ou en route. */
export function PortPresence({ portId }: { portId: string }) {
  const rows = useQuery(presenceQuery).data;
  if (!rows) return null;
  const atPort = rows
    .filter((row) => row.departure_port_id === portId)
    .reduce((sum, row) => sum + row.at_port, 0);
  const enRoute = rows
    .filter((row) => row.departure_port_id === portId)
    .reduce((sum, row) => sum + row.en_route, 0);
  const arrived = rows
    .filter((row) => row.arrival_port_id === portId)
    .reduce((sum, row) => sum + row.arrived, 0);
  if (!atPort && !enRoute && !arrived) return null;
  return (
    <p className="bw-presence">
      <CabasStack count={atPort || enRoute || arrived} seed={portId} />
      <span>
        {atPort ? <strong>{voyageurs(atPort)} au port</strong> : null}
        {enRoute ? (
          <span>
            {atPort ? " · " : ""}
            {enRoute} en route
          </span>
        ) : null}
        {arrived ? (
          <span>
            {atPort || enRoute ? " · " : ""}
            {arrived} arrivé{arrived > 1 ? "s" : ""} ici
          </span>
        ) : null}
      </span>
    </p>
  );
}

/** Fiche navire : combien de voyageurs BledWay sont à bord. */
export function VesselPresence({ vesselId }: { vesselId: string }) {
  const rows = useQuery(presenceQuery).data;
  if (!rows) return null;
  const onboard = rows
    .filter((row) => row.vessel_id === vesselId)
    .reduce((sum, row) => sum + row.onboard, 0);
  if (!onboard) return null;
  return (
    <p className="bw-presence">
      <CabasStack count={onboard} seed={vesselId} />
      <strong>{voyageurs(onboard)} à bord</strong>
    </p>
  );
}

/**
 * « Ma traversée » : où j'en suis, en un toucher. Visible de moi seul ; les autres ne voient
 * que des compteurs anonymes. Après « Au port », une question rapide alimente les signalements.
 */
export function TripStatusPicker({
  departureId,
  departureAt,
  fromPortId,
}: {
  departureId: string;
  departureAt: string;
  fromPortId?: string | undefined;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const presence = useQuery(presenceQuery);
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const mine = useQuery(myTripStatusQuery(departureId, user?.id));
  const catalog = useQuery(catalogQuery).data ?? 0;
  const [asked, setAsked] = useState<"queue" | "thanks" | null>(null);
  // Étape choisie : on propose aussitôt 3 humeurs de ce moment (« Reste calme » au port…).
  const [moodFor, setMoodFor] = useState<TripStatus | null>(null);
  const update = useMutation({
    mutationFn: (status: TripStatus | null) => setTripStatus(departureId, status),
    onSuccess: (_, status) => {
      void client.invalidateQueries({ queryKey: presenceKey });
      setAsked(status === "port" && fromPortId ? "queue" : null);
      setMoodFor(status);
    },
  });
  const queue = useMutation({
    mutationFn: async (code: string) => {
      const result = await reportTravel({
        kind: "port",
        target: fromPortId!,
        category: "queue",
        delay: null,
        detail: code,
        position: null,
      });
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      setAsked("thanks");
      void client.invalidateQueries({ queryKey: communityKey });
    },
  });
  // Retour de la page de connexion : le statut choisi avant est enregistré.
  useEffect(() => {
    if (!user) return;
    const saved = window.sessionStorage.getItem(PENDING_STATUS);
    if (!saved) return;
    try {
      const pending = JSON.parse(saved) as { departureId: string; status: TripStatus };
      if (pending.departureId !== departureId) return;
      window.sessionStorage.removeItem(PENDING_STATUS);
      update.mutate(pending.status);
    } catch {
      window.sessionStorage.removeItem(PENDING_STATUS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, departureId]);
  // Module pas encore activé en base : rien à afficher.
  if (presence.data === null) return null;
  const hoursBefore = (Date.parse(departureAt) - Date.now()) / 3_600_000;
  const tooEarly = hoursBefore > 36;
  const tooLate = hoursBefore < -72;
  if (tooLate) return null;
  const row = presence.data?.find((item) => item.departure_id === departureId);
  const counts: Record<TripStatus, number> = {
    en_route: row?.en_route ?? 0,
    port: row?.at_port ?? 0,
    onboard: row?.onboard ?? 0,
    arrived: row?.arrived ?? 0,
  };
  const current = mine.data ?? null;
  const choose = (status: TripStatus) => {
    if (!user) {
      window.sessionStorage.setItem(PENDING_STATUS, JSON.stringify({ departureId, status }));
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    update.mutate(current === status ? null : status);
  };
  if (tooEarly)
    return (
      <p className="bw-trip-status-teaser">
        <span aria-hidden>
          {steps.map((step) => (
            <img key={step.id} src={step.image} alt="" width={26} height={26} loading="lazy" />
          ))}
        </span>
        <span>
          <strong>Où en êtes-vous ?</strong> En route, au port, à bord : à partir de la veille du
          départ.
        </span>
      </p>
    );
  const queueOptions =
    catalog >= 3 ? optionsFor("queue", 3).filter((option) => !option.code.match(/_\d+$/)) : [];
  return (
    <section className="bw-trip-status" aria-label="Où en êtes-vous ?">
      <div className="bw-trip-status__head">
        <h3>Où en êtes-vous ?</h3>
        <small>
          {tooEarly
            ? "S’active la veille du départ."
            : "Visible de vous seul. Les autres voient seulement des compteurs."}
        </small>
      </div>
      <ol className="bw-trip-status__steps">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              aria-pressed={current === step.id}
              disabled={tooEarly || update.isPending}
              onClick={() => choose(step.id)}
            >
              <img src={step.image} alt="" width={56} height={56} loading="lazy" />
              <span>{step.short}</span>
              {counts[step.id] ? <small>{counts[step.id]}</small> : null}
              {current === step.id ? (
                <span className="bw-trip-status__check" aria-hidden>
                  <Check size={12} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      {moodFor ? <QuickMoods moment={moodFor} onDone={() => setMoodFor(null)} /> : null}
      {update.isError ? (
        <p role="alert" className="bw-community-error">
          {update.error.message}
        </p>
      ) : null}
      {asked === "queue" ? (
        <div className="bw-trip-status__ask">
          <p>
            <strong>Vous êtes au port : la file avance ?</strong> Un toucher suffit, ça aide ceux
            qui arrivent.
          </p>
          {queueOptions.length ? (
            <div className="bw-report-options">
              {queueOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  disabled={queue.isPending}
                  onClick={() => queue.mutate(option.code)}
                >
                  <OptionIcon name={option.icon} /> {option.label}
                </button>
              ))}
              <button type="button" onClick={() => setAsked(null)}>
                Plus tard
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="bw-report-send"
              onClick={() => requestQuickReport({ type: "port", id: fromPortId! })}
            >
              Signaler ce que je vois
            </button>
          )}
          {queue.isError ? (
            <p role="alert" className="bw-community-error">
              {queue.error.message}
            </p>
          ) : null}
        </div>
      ) : asked === "thanks" ? (
        <p className="bw-community-success" role="status">
          <Check size={15} aria-hidden /> Merci ! « {situationOf("queue").label} » est partagé avec
          les voyageurs.
        </p>
      ) : null}
    </section>
  );
}

/** « Et votre humeur ? » : 3 humeurs du moment, en un toucher. */
function QuickMoods({ moment, onDone }: { moment: string; onDone: () => void }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const me = useQuery(myTravellerQuery(user?.id)).data;
  const moods = useQuery(moodsQuery).data ?? [];
  const save = useMutation({
    mutationFn: (code: string) => setMood(code),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: travellersKey });
      onDone();
    },
  });
  const choices = moodsFor(moods, moment)
    .filter((mood) => mood.moments.includes(moment))
    .slice(0, 3);
  if (!me || !choices.length) return null;
  return (
    <div className="bw-quick-moods" role="group" aria-label="Votre humeur">
      <span>Et votre humeur ?</span>
      {choices.map((mood) => (
        <button
          key={mood.code}
          type="button"
          disabled={save.isPending}
          aria-pressed={me.mood?.code === mood.code}
          onClick={() => save.mutate(mood.code)}
        >
          <img src={mood.image} alt="" width={22} height={22} loading="lazy" />
          {mood.label}
        </button>
      ))}
      <button
        type="button"
        className="bw-quick-moods__skip"
        onClick={onDone}
        aria-label="Plus tard"
      >
        ×
      </button>
    </div>
  );
}
