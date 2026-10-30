import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, LocateFixed, MapPin, Megaphone, X } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  availableSituations,
  communityKey,
  currentPosition,
  lifetimeLabel,
  optionsFor,
  portServices,
  reportTravel,
  situationOf,
  useSignalCatalog,
  type AlertCategory,
  type CommunityKind,
  type Level,
} from "@/lib/ferry/community";
import { newsQuery } from "@/lib/ferry/flash";
import type { FleetShip } from "@/lib/ferry/fleet";
import { haversineKm } from "@/lib/ferry/tracking";
import type { Departure, Port, Selection } from "@/lib/ferry/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OptionIcon, SituationBadge } from "@/components/panel/SituationIcon";

// Suivis du compte (table bw_follows), absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const PENDING_KEY = "bledway:pending-quick-report";
/** Ouverture demandée depuis l'onglet « Signaler » ou un bouton « Signaler » d'une fiche. */
export const QUICK_REPORT_EVENT = "bledway:quick-report";
/** Même demande depuis une autre page : la carte s'ouvre puis le signalement. */
export const QUICK_REPORT_ON_LOAD = "bledway:open-quick-report";
/** Rayon dans lequel « Me localiser » retient le port le plus proche. */
const NEAR_PORT_KM = 30;

let mounted = 0;
/** Cible d'un signalement ; pour une traversée, son port de départ et son navire si connus. */
export type ReportTarget = Selection & { portId?: string | null; vesselId?: string | null };
/**
 * Point d'entrée unique pour signaler une situation, depuis n'importe quel écran.
 * `target` préremplit le port, le navire ou la traversée concernés.
 */
export function requestQuickReport(target?: ReportTarget) {
  if (mounted) {
    window.dispatchEvent(new CustomEvent(QUICK_REPORT_EVENT, { detail: target ?? null }));
    return;
  }
  window.sessionStorage.setItem(QUICK_REPORT_ON_LOAD, JSON.stringify(target ?? null));
  window.location.assign("/");
}

type Draft = {
  category: AlertCategory | null;
  detail: string | null;
  delay: number | null;
  portId: string | null;
  vesselId: string | null;
  departureId: string | null;
  focus: CommunityKind | null;
  /** Services du port : service choisi avant son état (ouvert / fermé). */
  service: string | null;
};
const emptyDraft: Draft = {
  category: null,
  detail: null,
  delay: null,
  portId: null,
  vesselId: null,
  departureId: null,
  focus: null,
  service: null,
};

function distanceKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const failure = (message?: string) =>
  message && /Patientez|Maximum|déjà signalé|introuvable|sur place|Vos signalements concernent/.test(message)
    ? message
    : "L’envoi n’a pas abouti. Réessayez dans quelques instants.";

/**
 * Signaler une situation, façon Waze : « Que voyez-vous ? », une précision, envoyer.
 * Le lieu est déduit de la fiche ou de la traversée ; la position (si autorisée) sert à
 * vérifier « sur place » et à trouver le port, elle n'est jamais enregistrée.
 */
export function QuickReport({
  ports,
  fleet,
  departures,
  selection,
}: {
  ports: Port[];
  fleet: FleetShip[];
  departures: Departure[];
  selection: Selection | null;
}) {
  const isMobile = useIsMobile();
  // Point vert sur le bouton quand on est près d'un port (moins de 3 km). Seulement si la position
  // est déjà autorisée : on ne la demande jamais pour ça. Rien n'est enregistré.
  const [nearPort, setNearPort] = useState<string | null>(null);
  // Mobile : le bouton flotte juste au-dessus du bord du volet (replié ou à mi-hauteur) et ne se
  // cache que lorsque le volet est en plein écran.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobile) return;
    const wrap = wrapRef.current;
    const panel = document.querySelector<HTMLElement>(".bw-map-panel");
    const stage = document.querySelector<HTMLElement>(".bw-map-stage");
    if (!wrap) return;
    const place = () => {
      const full = stage?.dataset["panelFull"] === "true";
      const top = panel ? panel.getBoundingClientRect().top : window.innerHeight - 56;
      const hidden = full || top < window.innerHeight * 0.3;
      wrap.toggleAttribute("data-hidden", hidden);
      wrap.style.setProperty("--fab-bottom", `${Math.round(window.innerHeight - top + 12)}px`);
    };
    place();
    const resize = new ResizeObserver(place);
    if (panel) resize.observe(panel);
    const attributes = new MutationObserver(place);
    if (stage)
      attributes.observe(stage, { attributes: true, attributeFilter: ["data-panel-full"] });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      resize.disconnect();
      attributes.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [isMobile]);
  useEffect(() => {
    if (!isMobile || !ports.length || !("permissions" in navigator) || !navigator.geolocation)
      return;
    let stopped = false;
    const check = () =>
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((state) => {
          if (state.state !== "granted" || stopped) return;
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (stopped) return;
              const here: [number, number] = [position.coords.longitude, position.coords.latitude];
              const near = ports
                .map((port) => ({ port, km: haversineKm(here, [port.longitude, port.latitude]) }))
                .filter((item) => item.km < 3)
                .sort((a, b) => a.km - b.km)[0];
              setNearPort(near?.port.name ?? null);
            },
            () => undefined,
            { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
          );
        })
        .catch(() => undefined);
    void check();
    const timer = window.setInterval(check, 3 * 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isMobile, ports]);
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  // Scripts SQL exécutés : 26/10 (situations récentes), 29/10 (formalités, « sur place »).
  const upgraded = useQuery(newsQuery).data != null;
  // Version 4 : le catalogue vient de la base et se gère dans l'admin.
  const { version: catalog } = useSignalCatalog();
  const level: Level = catalog >= 4 ? 4 : catalog >= 3 ? 3 : catalog >= 2 ? 2 : upgraded ? 1 : 0;
  const services = portServices();
  const follows = useQuery({
    queryKey: ["my-follows", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_follows")
        .select("id,target_kind,target_id,created_at")
        .eq("user_id", user!.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; target_kind: string; target_id: string; created_at: string }[];
    },
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "detail" | "done">("pick");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "far" | "denied">("idle");
  const [sentOnSite, setSentOnSite] = useState(false);
  const [sentForReview, setSentForReview] = useState(false);

  const vessels = fleet.filter(
    (ship, index) =>
      ship.vesselId && fleet.findIndex((s) => s.vesselId === ship.vesselId) === index,
  );
  const portName = (id: string | null) => ports.find((p) => p.id === id)?.name;

  /** Lieu probable : écran demandé, sinon fiche ouverte, sinon traversée suivie. */
  const guess = (target: ReportTarget | null): Pick<Draft, "portId" | "vesselId" | "departureId" | "focus"> => {
    const fromShip = (ship: FleetShip | undefined) =>
      ship
        ? {
            vesselId: ship.vesselId,
            departureId: ship.departureId,
            portId: ship.state === "docked" ? ship.portId : null,
            focus: "vessel" as const,
          }
        : null;
    const from = target ?? selection;
    if (from?.type === "port") return { portId: from.id, vesselId: null, departureId: null, focus: "port" };
    if (from?.type === "vessel")
      return (
        fromShip(fleet.find((s) => s.vesselId === from.id)) ?? {
          portId: null,
          vesselId: from.id,
          departureId: null,
          focus: "vessel",
        }
      );
    if (from?.type === "departure") {
      const found = fromShip(fleet.find((s) => s.departureId === from.id));
      if (found) return found;
      if (target?.portId || target?.vesselId)
        return { portId: target.portId ?? null, vesselId: target.vesselId ?? null, departureId: from.id, focus: null };
    }
    for (const follow of follows.data ?? []) {
      if (follow.target_kind !== "departure") continue;
      const found = fromShip(fleet.find((s) => s.departureId === follow.target_id));
      if (found) return { ...found, focus: null };
    }
    return { portId: null, vesselId: null, departureId: null, focus: null };
  };

  const start = (target: ReportTarget | null = null) => {
    setStep("pick");
    setLocating("idle");
    setDraft({ ...emptyDraft, ...guess(target) });
    mutation.reset();
    setOpen(true);
  };
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    mounted += 1;
    const onRequest = (event: Event) =>
      startRef.current((event as CustomEvent<ReportTarget | null>).detail ?? null);
    window.addEventListener(QUICK_REPORT_EVENT, onRequest);
    const onLoad = window.sessionStorage.getItem(QUICK_REPORT_ON_LOAD);
    if (onLoad) {
      window.sessionStorage.removeItem(QUICK_REPORT_ON_LOAD);
      let target: ReportTarget | null = null;
      try {
        target = JSON.parse(onLoad) as ReportTarget | null;
      } catch {
        /* ancienne valeur « 1 » : sans cible */
      }
      startRef.current(target && typeof target === "object" ? target : null);
    }
    return () => {
      mounted -= 1;
      window.removeEventListener(QUICK_REPORT_EVENT, onRequest);
    };
  }, []);

  // Retour de la page de connexion : on reprend le signalement là où il en était.
  useEffect(() => {
    if (loading || !user) return;
    const saved = window.sessionStorage.getItem(PENDING_KEY);
    if (!saved) return;
    window.sessionStorage.removeItem(PENDING_KEY);
    try {
      setDraft({ ...emptyDraft, ...(JSON.parse(saved) as Partial<Draft>) });
      setStep("detail");
      setOpen(true);
    } catch {
      /* brouillon illisible : ignoré */
    }
  }, [loading, user]);

  const situation = draft.category ? situationOf(draft.category) : undefined;
  const options = draft.category ? optionsFor(draft.category, level) : [];
  const chosen = options.find(
    (option) => option.code === draft.detail || (option.delay && option.delay === draft.delay),
  );
  const impact = Boolean(chosen?.onSite);
  const target = situation?.where === "port" ? draft.portId : draft.vesselId;
  const selectedDeparture = departures.find((item) => item.id === draft.departureId);
  const selectedShip = fleet.find((ship) => ship.departureId === draft.departureId && ship.vesselId === draft.vesselId);
  const now = Date.now();
  const phaseAllowed = (category: AlertCategory | null) => {
    if (!category || situationOf(category).where === "port") return true;
    if (!selectedDeparture || selectedDeparture.vessel_id !== draft.vesselId || selectedDeparture.status === "cancelled") return false;
    const start = Date.parse(selectedDeparture.departure_at);
    const end = selectedDeparture.arrival_at ? Date.parse(selectedDeparture.arrival_at) : NaN;
    if (category === "boarding") return selectedShip?.state === "docked" && now >= start - 6 * 3_600_000 && now <= start + 30 * 60_000;
    if (category === "disembarking") return selectedShip?.state === "docked" && Number.isFinite(end) && now >= end - 30 * 60_000 && now <= end + 2 * 3_600_000;
    return now >= start - 24 * 3_600_000 && (!Number.isFinite(end) || now <= end + 2 * 3_600_000);
  };
  const ready = Boolean(
    situation &&
    target &&
    (!situation.required || chosen || (draft.category === "service" && draft.detail)),
  );

  const mutation = useMutation({
    mutationFn: async (input: Draft) => {
      const category = input.category!;
      const where = situationOf(category).where;
      // Position demandée au moment d'envoyer (mobile), ou obligatoire pour un signalement impactant.
      let here = position;
      if (!here && level >= 2 && (isMobile || impact)) here = await currentPosition();
      if (impact && !here)
        throw new Error(
          "Ce signalement doit être fait sur place : autorisez la localisation puis réessayez.",
        );
      const result = await reportTravel({
        kind: where,
        target: (where === "port" ? input.portId : input.vesselId)!,
        category,
        delay: input.delay,
        detail: input.detail,
        position: here,
        departureId: input.departureId,
      });
      if (result.error) throw new Error(failure(result.error.message));
      return result;
    },
    onSuccess: (result) => {
      setSentOnSite(result.onSite);
      setSentForReview(result.pendingReview);
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: communityKey });
    },
  });

  const locate = async () => {
    setLocating("busy");
    const here = await currentPosition(10_000);
    if (!here) return setLocating("denied");
    setPosition(here);
    const nearest = ports
      .map((port) => ({ port, km: distanceKm(here, [port.latitude, port.longitude]) }))
      .sort((a, b) => a.km - b.km)[0];
    if (!nearest || nearest.km > NEAR_PORT_KM) return setLocating("far");
    const docked = fleet.filter((s) => s.state === "docked" && s.portId === nearest.port.id);
    setDraft((current) => ({
      ...current,
      portId: nearest.port.id,
      vesselId: docked.length === 1 ? (docked[0]!.vesselId ?? current.vesselId) : current.vesselId,
      departureId: docked.length === 1 ? docked[0]!.departureId : current.departureId,
    }));
    setLocating("idle");
  };

  const send = () => {
    if (!ready) return;
    if (!user) {
      // La position n'est pas conservée : elle sera redemandée à l'envoi.
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(draft));
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    mutation.mutate(draft);
  };

  const available = availableSituations(level);
  const group = (where: CommunityKind, title: string) => (
    <section className="bw-report-group" aria-label={title} key={where}>
      <h3>{title}</h3>
      <div className="bw-report-tiles">
        {available
          .filter((key) => situationOf(key).where === where)
          .map((key) => (
            <button
              key={key}
              type="button"
              className="bw-report-tile"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  category: key,
                  detail: null,
                  delay: null,
                  service: null,
                }));
                setStep("detail");
              }}
            >
              <SituationBadge category={key} size={24} className="bw-report-tile__badge" />
              {situationOf(key).label}
            </button>
          ))}
      </div>
    </section>
  );
  const groups = [group("port", "Au port"), group("vessel", "Le bateau")];
  if (draft.focus === "vessel") groups.reverse();

  let body: ReactNode;
  if (step === "done")
    body = (
      <div className="bw-report-done" role="status">
        <span aria-hidden>
          <Check size={30} />
        </span>
        <strong>{sentForReview ? "Merci, l’équipe va vérifier" : "Merci, c’est partagé !"}</strong>
        {sentOnSite ? (
          <span className="bw-onsite-chip">
            <MapPin size={13} aria-hidden /> Sur place
          </span>
        ) : null}
        <p>{sentForReview
          ? "L’horaire ou la position connue ne correspond pas à votre observation. Votre signalement est transmis à l’équipe, sans publication automatique."
          : `${draft.category ? `Visible environ ${lifetimeLabel(draft.category)}. ` : ""}${impact
              ? "Il apparaîtra sur la carte dès qu’un autre voyageur le confirme."
              : "Les autres voyageurs peuvent le confirmer ou dire que ce n’est plus le cas."}`}</p>
        <button type="button" className="bw-report-send" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    );
  else if (step === "pick" || !situation || !draft.category)
    body = (
      <div className="bw-report-pick">
        {draft.portId || draft.vesselId ? (
          <p className="bw-report-where">
            {[portName(draft.portId), vessels.find((s) => s.vesselId === draft.vesselId)?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {groups}
        <p className="bw-report-note">
          Votre nom n’est jamais affiché. {user ? "" : "Une connexion sera demandée pour envoyer."}
        </p>
      </div>
    );
  else
    body = (
      <form
        className="bw-report-detail"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="bw-report-detail__head">
          <button
            type="button"
            className="bw-report-back"
            aria-label="Changer de situation"
            onClick={() => setStep("pick")}
          >
            <ArrowLeft size={18} aria-hidden />
          </button>
          <SituationBadge category={draft.category} size={20} className="bw-report-detail__badge" />
          <strong>{situation.label}</strong>
        </div>

        <fieldset className="bw-report-field" disabled={mutation.isPending}>
          <legend>{situation.where === "port" ? "Où êtes-vous ?" : "Quel navire ?"}</legend>
          {situation.where === "port" ? (
            <div className="bw-report-where-row">
              <select
                value={draft.portId ?? ""}
                onChange={(e) => setDraft({ ...draft, portId: e.target.value || null })}
                aria-label="Port"
              >
                <option value="">Choisir le port…</option>
                {[...ports]
                  .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                  .map((port) => (
                    <option key={port.id} value={port.id}>
                      {port.name} ({port.country_name})
                    </option>
                  ))}
              </select>
              <button type="button" onClick={() => void locate()} disabled={locating === "busy"}>
                <LocateFixed size={16} aria-hidden />
                {locating === "busy" ? "…" : "Me localiser"}
              </button>
            </div>
          ) : (
            <select
              value={draft.vesselId ?? ""}
              onChange={(e) => {
                const ship = fleet.find((item) => item.vesselId === e.target.value);
                setDraft({ ...draft, vesselId: e.target.value || null, departureId: ship?.departureId ?? null });
              }}
              aria-label="Bateau"
            >
              <option value="">Choisir le navire…</option>
              {draft.portId ? (
                <optgroup label={`À quai à ${portName(draft.portId) ?? "ce port"}`}>
                  {vessels
                    .filter((s) => s.state === "docked" && s.portId === draft.portId)
                    .map((s) => (
                      <option key={s.vesselId} value={s.vesselId!}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              <optgroup label="Tous les bateaux">
                {[...vessels]
                  .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                  .map((s) => (
                    <option key={s.vesselId} value={s.vesselId!}>
                      {s.name} ·{" "}
                      {s.state === "sea"
                        ? "en mer"
                        : `à quai${s.portId ? ` à ${portName(s.portId) ?? ""}` : ""}`}
                    </option>
                  ))}
              </optgroup>
            </select>
          )}
          {locating === "far" ? (
            <small>Aucun port à moins de {NEAR_PORT_KM} km : choisissez-le dans la liste.</small>
          ) : locating === "denied" ? (
            <small>Position indisponible : choisissez dans la liste.</small>
          ) : null}
        </fieldset>

        {situation.where === "vessel" && draft.vesselId && !phaseAllowed(draft.category) ? (
          <p role="status" className="bw-report-note">
            Cette observation ne correspond pas à la phase affichée. Vous pouvez l’envoyer pour vérification par l’équipe.
          </p>
        ) : null}

        {options.length ? (
          <fieldset className="bw-report-field" disabled={mutation.isPending}>
            <legend>
              {situation.question} {situation.required ? null : <span>facultatif</span>}
            </legend>
            <div className="bw-report-options">
              {options.map((option) => {
                const selected = chosen?.code === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    aria-pressed={selected}
                    data-impact={option.onSite ? "true" : undefined}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        delay: option.delay && !selected ? option.delay : null,
                        detail: !option.delay && !selected ? option.code : null,
                      })
                    }
                  >
                    <OptionIcon name={option.icon} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {draft.category === "service" ? (
          <>
            <fieldset className="bw-report-field" disabled={mutation.isPending}>
              <legend>{situation.question}</legend>
              <div className="bw-report-options">
                {services.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={draft.service === item.code}
                    onClick={() => setDraft({ ...draft, service: item.code, detail: null })}
                  >
                    <OptionIcon name={item.icon} />
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {draft.service ? (
              <fieldset className="bw-report-field" disabled={mutation.isPending}>
                <legend>En ce moment</legend>
                <div className="bw-report-options">
                  {(["open", "closed"] as const).map((state) => {
                    const item = services.find((service) => service.code === draft.service);
                    if (!item) return null;
                    const code = `service_${item.code}_${state}`;
                    const text = state === "open" ? item.open : item.closed;
                    return (
                      <button
                        key={state}
                        type="button"
                        aria-pressed={draft.detail === code}
                        data-state={state}
                        onClick={() => setDraft({ ...draft, detail: code })}
                      >
                        <OptionIcon name={state === "open" ? "circle-check" : "circle-x"} />
                        {text.charAt(0).toUpperCase() + text.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </>
        ) : null}

        {impact ? (
          <p className="bw-report-impact" role="note">
            <MapPin size={15} aria-hidden />
            Signalement important : il faut être sur place, localisation activée. Il s’affiche sur
            la carte quand un second voyageur le confirme.
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="bw-community-error">
            {mutation.error.message}
          </p>
        ) : null}
        <button type="submit" className="bw-report-send" disabled={!ready || mutation.isPending}>
          {mutation.isPending ? "Envoi…" : user ? "Envoyer" : "Se connecter et envoyer"}
        </button>
        <p className="bw-report-note">
          {level >= 2
            ? "Si vous l’autorisez, votre position indique « Sur place ». Elle n’est pas enregistrée."
            : "Uniquement ce que vous constatez ou ce qui est annoncé sur place."}
        </p>
      </form>
    );

  const trigger = (
    <button type="button" className="bw-report-fab" aria-label="Signaler une situation">
      <Megaphone size={20} aria-hidden />
      <span>Signaler</span>
    </button>
  );
  const title = step === "done" ? "Signalement envoyé" : "Que voyez-vous ?";

  return (
    <div className="bw-report" ref={wrapRef}>
      {isMobile ? (
        /* Sur mobile : bouton jaune fixe au-dessus de la barre du bas, comme Waze. Le volet le recouvre
           quand il monte. Point vert : vous êtes près d'un port. */
        <>
          <button
            type="button"
            className="bw-report-fab bw-report-fab--mobile"
            aria-label={
              nearPort ? `Signaler une situation à ${nearPort}` : "Signaler une situation"
            }
            data-near={nearPort ? true : undefined}
            onClick={() => start()}
          >
            <Megaphone size={22} aria-hidden />
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="bw-report-sheet">
              <SheetHeader className="text-left">
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription className="sr-only">
                  Signaler une situation au port ou à bord, visible par les autres voyageurs.
                </SheetDescription>
              </SheetHeader>
              {body}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) start();
            else setOpen(false);
          }}
        >
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent side="left" align="start" sideOffset={10} className="bw-report-popover">
            <div className="bw-report-popover__head">
              <strong>{title}</strong>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}>
                <X size={16} aria-hidden />
              </button>
            </div>
            {body}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
