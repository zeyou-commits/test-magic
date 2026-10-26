import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, LocateFixed, Megaphone, X } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  alertDetails,
  communityKey,
  legacyAlertCategories,
  reportTravel,
  type AlertCategory,
} from "@/lib/ferry/community";
import { newsQuery } from "@/lib/ferry/flash";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Port, Selection } from "@/lib/ferry/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AlertIcon } from "@/components/panel/TravelCommunity";

// Suivis du compte (table bw_follows), absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const PENDING_KEY = "bledway:pending-quick-report";
/** Ouverture demandée depuis l'onglet « Signaler » de la barre mobile. */
export const QUICK_REPORT_EVENT = "bledway:quick-report";
/** Même demande depuis une autre page : la carte s'ouvre puis le signalement. */
export const QUICK_REPORT_ON_LOAD = "bledway:open-quick-report";
/** Rayon dans lequel « Me localiser » retient le port le plus proche. */
const NEAR_PORT_KM = 30;

const tiles: { category: AlertCategory; label: string; where: "port" | "vessel" }[] = [
  { category: "queue", label: "File d’attente", where: "port" },
  { category: "access", label: "Accès difficile", where: "port" },
  { category: "parking", label: "Parking complet", where: "port" },
  { category: "fluid", label: "Ça passe bien", where: "port" },
  { category: "delay", label: "Retard", where: "vessel" },
  { category: "boarding", label: "Embarquement", where: "vessel" },
  { category: "disembarking", label: "Débarquement", where: "vessel" },
];
const delays = [
  { value: 30, label: "≈ 30 min" },
  { value: 60, label: "≈ 1 h" },
  { value: 120, label: "2 h et plus" },
];

type Draft = {
  category: AlertCategory | null;
  detail: string | null;
  delay: number | null;
  portId: string | null;
  vesselId: string | null;
};
const emptyDraft: Draft = { category: null, detail: null, delay: null, portId: null, vesselId: null };

function distanceKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const failure = (message?: string) =>
  message && /Patientez|Maximum|déjà signalé|introuvable/.test(message)
    ? message
    : "L’envoi n’a pas abouti. Réessayez dans quelques instants.";

/**
 * Bouton « Signaler » de la carte, façon Waze : « Que voyez-vous ? », une précision, envoyer.
 * Le lieu est déduit de la fiche ouverte ou de la traversée suivie ; sinon « Me localiser »
 * (position utilisée une fois, jamais enregistrée) ou un choix dans la liste.
 */
export function QuickReport({
  ports,
  fleet,
  selection,
}: {
  ports: Port[];
  fleet: FleetShip[];
  selection: Selection | null;
}) {
  const isMobile = useIsMobile();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  // Le script SQL du 26/10/2026 active les situations récentes (débarquement, parking, fluide).
  const upgraded = useQuery(newsQuery).data != null;
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
  const [locating, setLocating] = useState<"idle" | "busy" | "far" | "denied">("idle");

  const vessels = fleet.filter(
    (ship, index) => ship.vesselId && fleet.findIndex((s) => s.vesselId === ship.vesselId) === index,
  );
  const portName = (id: string | null) => ports.find((p) => p.id === id)?.name;

  /** Lieu probable : fiche ouverte, sinon traversée suivie en cours ou toute proche. */
  const guess = (): Pick<Draft, "portId" | "vesselId"> => {
    const fromShip = (ship: FleetShip | undefined) =>
      ship ? { vesselId: ship.vesselId, portId: ship.state === "docked" ? ship.portId : null } : null;
    if (selection?.type === "port") return { portId: selection.id, vesselId: null };
    if (selection?.type === "vessel")
      return (
        fromShip(fleet.find((s) => s.vesselId === selection.id)) ?? {
          portId: null,
          vesselId: selection.id,
        }
      );
    if (selection?.type === "departure") {
      const found = fromShip(fleet.find((s) => s.departureId === selection.id));
      if (found) return found;
    }
    for (const follow of follows.data ?? []) {
      if (follow.target_kind !== "departure") continue;
      const found = fromShip(fleet.find((s) => s.departureId === follow.target_id));
      if (found) return found;
    }
    return { portId: null, vesselId: null };
  };

  const start = () => {
    setStep("pick");
    setLocating("idle");
    setDraft({ ...emptyDraft, ...guess() });
    mutation.reset();
    setOpen(true);
  };

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    const onRequest = () => startRef.current();
    window.addEventListener(QUICK_REPORT_EVENT, onRequest);
    if (window.sessionStorage.getItem(QUICK_REPORT_ON_LOAD)) {
      window.sessionStorage.removeItem(QUICK_REPORT_ON_LOAD);
      startRef.current();
    }
    return () => window.removeEventListener(QUICK_REPORT_EVENT, onRequest);
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

  const mutation = useMutation({
    mutationFn: async (input: Draft) => {
      const category = input.category!;
      const where = tiles.find((t) => t.category === category)!.where;
      const error = await reportTravel({
        kind: where,
        target: (where === "port" ? input.portId : input.vesselId)!,
        category,
        delay: input.delay,
        detail: input.detail,
      });
      if (error) throw new Error(failure(error.message));
    },
    onSuccess: () => {
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: communityKey });
    },
  });

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here: [number, number] = [position.coords.longitude, position.coords.latitude];
        const nearest = ports
          .map((port) => ({ port, km: distanceKm(here, [port.longitude, port.latitude]) }))
          .sort((a, b) => a.km - b.km)[0];
        if (!nearest || nearest.km > NEAR_PORT_KM) return setLocating("far");
        const docked = fleet.filter((s) => s.state === "docked" && s.portId === nearest.port.id);
        setDraft((current) => ({
          ...current,
          portId: nearest.port.id,
          vesselId: docked.length === 1 ? (docked[0]!.vesselId ?? current.vesselId) : current.vesselId,
        }));
        setLocating("idle");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const tile = draft.category ? tiles.find((t) => t.category === draft.category) : undefined;
  const precision = draft.category ? alertDetails[draft.category] : undefined;
  const target = tile?.where === "port" ? draft.portId : draft.vesselId;
  const ready = Boolean(tile && target && (draft.category !== "delay" || draft.delay));

  const send = () => {
    if (!ready) return;
    if (!user) {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(draft));
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    mutation.mutate(draft);
  };

  const available = tiles.filter((t) => upgraded || legacyAlertCategories.has(t.category));
  const group = (where: "port" | "vessel", title: string) => (
    <section className="bw-report-group" aria-label={title}>
      <h3>{title}</h3>
      <div className="bw-report-tiles">
        {available
          .filter((t) => t.where === where)
          .map((t) => (
            <button
              key={t.category}
              type="button"
              className="bw-report-tile"
              data-cat={t.category}
              onClick={() => {
                setDraft((current) => ({ ...current, category: t.category, detail: null, delay: null }));
                setStep("detail");
              }}
            >
              <span aria-hidden>
                <AlertIcon category={t.category} size={24} />
              </span>
              {t.label}
            </button>
          ))}
      </div>
    </section>
  );

  let body: ReactNode;
  if (step === "done")
    body = (
      <div className="bw-report-done" role="status">
        <span aria-hidden>
          <Check size={30} />
        </span>
        <strong>Merci, c’est partagé !</strong>
        <p>
          Votre signalement est visible sur la carte pendant 2 h. Les autres voyageurs peuvent le
          confirmer ou dire que ce n’est plus le cas.
        </p>
        <button type="button" className="bw-report-send" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    );
  else if (step === "pick" || !tile)
    body = (
      <div className="bw-report-pick">
        {draft.portId || draft.vesselId ? (
          <p className="bw-report-where">
            {[portName(draft.portId), vessels.find((s) => s.vesselId === draft.vesselId)?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {group("port", "Au port")}
        {group("vessel", "Le bateau")}
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
        <div className="bw-report-detail__head" data-cat={tile.category}>
          <button
            type="button"
            className="bw-report-back"
            aria-label="Changer de situation"
            onClick={() => setStep("pick")}
          >
            <ArrowLeft size={18} aria-hidden />
          </button>
          <span aria-hidden>
            <AlertIcon category={tile.category} size={22} />
          </span>
          <strong>{tile.label}</strong>
        </div>

        <fieldset className="bw-report-field" disabled={mutation.isPending}>
          <legend>{tile.where === "port" ? "Où êtes-vous ?" : "Quel bateau ?"}</legend>
          {tile.where === "port" ? (
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
              <button type="button" onClick={locate} disabled={locating === "busy"}>
                <LocateFixed size={16} aria-hidden />
                {locating === "busy" ? "…" : "Me localiser"}
              </button>
            </div>
          ) : (
            <select
              value={draft.vesselId ?? ""}
              onChange={(e) => setDraft({ ...draft, vesselId: e.target.value || null })}
              aria-label="Bateau"
            >
              <option value="">Choisir le bateau…</option>
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
                      {s.name} · {s.state === "sea" ? "en mer" : `à quai${s.portId ? ` à ${portName(s.portId) ?? ""}` : ""}`}
                    </option>
                  ))}
              </optgroup>
            </select>
          )}
          {locating === "far" ? (
            <small>Aucun port à moins de {NEAR_PORT_KM} km : choisissez-le dans la liste.</small>
          ) : locating === "denied" ? (
            <small>Position indisponible : choisissez le port dans la liste.</small>
          ) : tile.where === "port" ? (
            <small>Votre position sert seulement à trouver le port, elle n’est pas enregistrée.</small>
          ) : null}
        </fieldset>

        {draft.category === "delay" ? (
          <fieldset className="bw-report-field" disabled={mutation.isPending}>
            <legend>Retard annoncé sur place</legend>
            <div className="bw-report-options">
              {delays.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.delay === option.value}
                  onClick={() => setDraft({ ...draft, delay: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : precision ? (
          <fieldset className="bw-report-field" disabled={mutation.isPending}>
            <legend>
              {precision.question} <span>facultatif</span>
            </legend>
            <div className="bw-report-options">
              {precision.options.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={draft.detail === option.code}
                  onClick={() =>
                    setDraft({ ...draft, detail: draft.detail === option.code ? null : option.code })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
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
          Uniquement ce que vous constatez ou ce qui est annoncé sur place.
        </p>
      </form>
    );

  const trigger = (
    <button
      type="button"
      className="bw-report-fab"
      aria-label="Signaler une situation"
    >
      <Megaphone size={20} aria-hidden />
      <span>Signaler</span>
    </button>
  );
  const title = step === "done" ? "Signalement envoyé" : "Que voyez-vous ?";

  return (
    <div className="bw-report">
      {isMobile ? (
        <>
          {/* Sur mobile, le bouton est l'onglet « Signaler » de la barre du bas. */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="bw-report-sheet">
              <SheetHeader className="text-left">
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription className="sr-only">
                  Signaler une situation au port ou à bord, visible 2 h par les autres voyageurs.
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
