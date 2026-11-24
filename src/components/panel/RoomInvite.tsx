import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  BadgeCheck,
  LocateFixed,
  MessagesSquare,
  ShieldQuestion,
  UtensilsCrossed,
  Waves,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useBackClose } from "@/lib/ferry/backStack";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { dockedSinceQuery, myTripStatusQuery } from "@/lib/ferry/presence";
import { activeInvite, activeWave, stageInvite, voyageStage } from "@/lib/ferry/roomInvites";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import { chatFeedQuery } from "./LiveRoom";
import { AboardScene } from "./AboardScene";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { tr } from "@/lib/i18n";
import { currentPosition } from "@/lib/ferry/community";
import { setTripStatus } from "@/lib/ferry/presence";
import {
  confirmAtSea,
  recalledSeaCheck,
  rememberSeaCheck,
  seaCheck,
  type SeaCheck,
} from "@/lib/ferry/atSea";

const DEFAULT_LEAD_MINUTES = 240;
const CHECK_MS = 30_000;
const SETTLE_MS = 4_000;

const seenKey = (user: string, departure: string, step: string) =>
  `bledway:room-invite:${user}:${departure}:${step}`;
function alreadySeen(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Sans mémoire possible, on s'abstient plutôt que de répéter la fenêtre.
    return true;
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* stockage facultatif */
  }
}

/** Fenêtre dans l'appli : le salon de ma traversée, une fois par état du voyage. */
export function RoomInvite({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const ships = useLiveShips();
  const departureId = trip?.departure.id ?? "";
  const status = useQuery(myTripStatusQuery(departureId, user?.id)).data ?? null;
  const docked = useQuery(dockedSinceQuery(departureId)).data ?? null;
  const room = useQuery({
    ...chatFeedQuery("crossing", departureId, user?.id),
    refetchInterval: 60_000,
  }).data;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<{
    key: string;
    title: string;
    body: string;
    examples: string[];
    /** En mer : on demande d'abord si la personne est bien à bord. */
    askAboard?: boolean;
  } | null>(null);
  // « À bord ? » : la question, puis la vérification facultative par la position.
  const [aboard, setAboard] = useState<"ask" | "sea" | "quay">("ask");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<SeaCheck | null>(null);
  useBackClose(open !== null, () => setOpen(null));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || !trip || open || room === null || status === "arrived") return;
    if (trip.departure.status === "cancelled") return;
    const { departure } = trip;
    const live = ships.find((ship) => ship.departure.id === departure.id) ?? null;
    const progress =
      trip.from && trip.to ? crossingProgress(departure, trip.from, trip.to, live, now) : null;
    const departed =
      Boolean(departure.reported_departed_at ?? departure.web_departed_at) ||
      (progress?.trust === "live" && (progress.ratio ?? 0) > 0);
    const stage = voyageStage({
      departureAt: departure.departure_at,
      leadMinutes: DEFAULT_LEAD_MINUTES,
      departed,
      arrivedAt: departure.reported_arrived_at ?? departure.web_arrived_at ?? docked,
      postponed: Boolean(departure.reported_postponed_at),
      now,
    });
    const others = room?.messages.filter((message) => !message.me).length ?? 0;
    const wave = stage ? activeWave(others) : 0;
    const stageKey = stage ? seenKey(user.id, departure.id, stage) : null;
    const waveKey = wave ? seenKey(user.id, departure.id, `active-${wave}`) : null;
    const next =
      stage && stageKey && !alreadySeen(stageKey)
        ? { key: stageKey, ...stageInvite(stage), askAboard: stage === "sea" }
        : waveKey && !alreadySeen(waveKey)
          ? { key: waveKey, ...activeInvite(others), askAboard: false }
          : null;
    if (!next) return;
    // Jamais par-dessus une autre fenêtre : on réessaiera au prochain passage.
    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      markSeen(next.key);
      const known = next.askAboard ? recalledSeaCheck(user.id, departure.id) : null;
      setAboard(known ? "sea" : "ask");
      setCheck(known ? { state: known, reason: null } : null);
      setOpen(next);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [user, trip, open, room, status, docked, ships, now]);

  const ship = ships.find((item) => item.departure.id === departureId) ?? null;
  // La scène : le navire de la traversée, ses ports et son avancement (rien n'est affiché s'il manque).
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const sceneDeparture =
    trip?.departure.id === departureId ? trip.departure : (ship?.departure ?? null);
  const sceneRoute = routes.find((item) => item.id === sceneDeparture?.route_id);
  const sceneFrom =
    trip?.departure.id === departureId
      ? (trip.from ?? null)
      : (ports.find((item) => item.id === sceneRoute?.departure_port_id) ?? null);
  const sceneTo =
    trip?.departure.id === departureId
      ? (trip.to ?? null)
      : (ports.find((item) => item.id === sceneRoute?.arrival_port_id) ?? null);
  const sceneVessel =
    ship?.vessel ?? vessels.find((item) => item.id === sceneDeparture?.vessel_id) ?? null;
  const sceneProgress =
    sceneDeparture && sceneFrom && sceneTo
      ? crossingProgress(sceneDeparture, sceneFrom, sceneTo, ship, now)
      : null;
  const scenePercent = sceneProgress?.ratio == null ? null : Math.round(sceneProgress.ratio * 100);
  const goToRoom = () => {
    setOpen(null);
    onSelect({ type: "departure", id: departureId });
    enterRoom("crossing", departureId);
  };
  // « En mer » vient d'un signal qui peut se tromper : la personne à bord dit si le navire est parti.
  const sayAboard = (where: "sea" | "quay") => {
    setAboard(where);
    // Déclaratif, comme « Ma traversée » : l'étape « À bord » est cochée pour cette traversée.
    if (user) void setTripStatus(departureId, "onboard").catch(() => undefined);
  };
  // Facultatif, sur un geste de la personne : la position sert à comparer, puis elle est oubliée.
  const verify = async () => {
    setChecking(true);
    const here = await currentPosition();
    const local = seaCheck(
      here,
      ship
        ? {
            latitude: ship.position.latitude,
            longitude: ship.position.longitude,
            ageMinutes: ship.ageMinutes,
          }
        : null,
    );
    const result = await confirmAtSea(departureId, here, local).catch(() => local);
    setCheck(result);
    if (user) rememberSeaCheck(user.id, departureId, result.state);
    setChecking(false);
  };
  const asking = Boolean(open?.askAboard) && aboard === "ask";

  return (
    <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
      <DialogContent className="bw-room-invite" data-scene={open?.askAboard || undefined}>
        {open?.askAboard ? (
          <AboardScene
            vessel={sceneVessel}
            from={sceneFrom}
            to={sceneTo}
            percent={scenePercent}
            aboard={!asking}
            atQuay={aboard === "quay"}
            verified={check?.state === "verified"}
          />
        ) : (
          <img
            src="/cabas/persos/voiture_504.webp"
            alt=""
            width={92}
            height={92}
            className="bw-room-invite__car"
          />
        )}
        <DialogTitle>
          {open?.askAboard
            ? asking
              ? tr("ui.roomInvite.vousEtesABord")
              : aboard === "quay"
                ? tr("ui.roomInvite.leDepartApproche")
                : tr("ui.roomInvite.bonneTraversee")
            : open?.title}
        </DialogTitle>
        {/* En mer, l'image parle : la phrase reste pour les lecteurs d'écran. */}
        <DialogDescription className={open?.askAboard ? "sr-only" : undefined}>
          {open?.askAboard
            ? tr("ui.roomInvite.leNavireAPrisLa", { v: sceneVessel ? ` ${sceneVessel.name}` : "", body: open.body })
            : open?.body}
        </DialogDescription>
        {asking ? (
          <>
            {/* On cite la source au lieu d'affirmer : le signal peut avoir de l'avance. */}
            <p className="bw-aboard-source">{tr("ui.roomInvite.dApresLeSuiviLe")}</p>
            <div className="bw-aboard-ask__row">
              <button type="button" className="bw-action-primary" onClick={() => sayAboard("sea")}>
                <Waves size={18} aria-hidden />{tr("ui.roomInvite.aBordEnMer")}
              </button>
              <button type="button" className="bw-aboard-ask__no" onClick={() => sayAboard("quay")}>
                <Anchor size={17} aria-hidden />{tr("ui.roomInvite.aBordEncoreAQuai")}
              </button>
              <button
                type="button"
                className="bw-aboard-ask__no bw-aboard-ask__none"
                onClick={() => setOpen(null)}
              >
                <X size={17} aria-hidden />{tr("ui.roomInvite.non")}
              </button>
            </div>
          </>
        ) : (
          <>
            {open?.askAboard && aboard !== "quay" ? (
              check ? (
                <p
                  className="bw-sea-badge"
                  data-state={check.state}
                  role="status"
                  title={check.reason ?? undefined}
                >
                  {check.state === "verified" ? (
                    <>
                      <BadgeCheck size={18} aria-hidden />{tr("ui.roomInvite.verifieEnMer")}
                    </>
                  ) : (
                    <>
                      <ShieldQuestion size={16} aria-hidden />{tr("ui.roomInvite.nonVerifie")}
                      {check.reason ? <span className="sr-only"> : {check.reason}</span> : null}
                    </>
                  )}
                </p>
              ) : (
                <div className="bw-aboard-check">
                  <button type="button" onClick={verify} disabled={checking}>
                    <LocateFixed size={16} aria-hidden />
                    {checking ? tr("ui.roomInvite.verification") : tr("ui.roomInvite.verifierMaPosition")}
                  </button>
                  <small>{tr("ui.roomInvite.facultatifRienNEstEnregistre")}</small>
                </div>
              )
            ) : null}
            {open?.examples.length ? (
              <ul>
                {open.examples.map((example, index) => {
                  const Icon = open.askAboard ? [UtensilsCrossed, Waves][index] : null;
                  // Encore à quai : la question utile est « on part quand ? », pas l'état de la mer.
                  if (aboard === "quay" && index === 1) example = tr("ui.roomInvite.onPartQuand");
                  return (
                    <li key={example}>
                      {Icon ? <Icon size={14} aria-hidden /> : null}
                      {example}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <button type="button" className="bw-action-primary w-full" onClick={goToRoom}>
              <MessagesSquare size={18} aria-hidden /> {tr("ui.roomInvite.allerAuSalon")}
            </button>
          </>
        )}
        <button type="button" className="bw-room-invite__later" onClick={() => setOpen(null)}>
          {tr("ui.roomInvite.plusTard")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
