import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculateRoadAccess, calculateRoadGeometry } from "@/lib/ferry/itinerary.functions";
import { legWithPauses } from "@/lib/ferry/itinerary";
import { durationLabel } from "@/lib/ferry/journeySteps";
import { thinLine, type JourneyPlaces } from "@/lib/ferry/journeyTrips";
import type { Port } from "@/lib/ferry/types";

/**
 * « D'où partez-vous ? Où allez-vous au bled ? » : facultatif. Les villes servent seulement au
 * calcul (même service que le simulateur) puis restent sur cet appareil.
 */
export function JourneyPlacesForm({
  europePort,
  algeriaPort,
  places,
  onChange,
  bare = false,
  onSkip,
}: {
  europePort: Port;
  algeriaPort: Port;
  places: JourneyPlaces | null;
  onChange: (places: JourneyPlaces | null) => void;
  /** Dans la fenêtre : le formulaire seul, sans titre ni résumé. */
  bare?: boolean;
  /** « Plus tard » : l'invitation se range dans le bouton du voyage. */
  onSkip?: () => void;
}) {
  const [home, setHome] = useState(places?.home ?? "");
  const [bled, setBled] = useState(places?.bled ?? "");
  const [open, setOpen] = useState(bare || !places);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (home.trim().length < 2 || bled.trim().length < 2) {
      setError("Indiquez une ville de départ et une ville au bled.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const point = (port: Port) => ({
        id: port.id,
        longitude: port.longitude,
        latitude: port.latitude,
      });
      const access = await calculateRoadAccess({
        data: {
          origin: home.trim(),
          destination: bled.trim(),
          departurePorts: [point(europePort)],
          arrivalPorts: [point(algeriaPort)],
        },
      });
      const europe = access.toDeparturePorts[0];
      const algeria = access.fromArrivalPorts[0];
      if (!europe || !algeria) throw new Error("Trajet introuvable.");
      // Le tracé est un plus : sans lui, la durée reste utile.
      const lines = await calculateRoadGeometry({
        data: {
          origin: access.originPoint,
          destination: access.destinationPoint,
          departurePort: [europePort.longitude, europePort.latitude],
          arrivalPort: [algeriaPort.longitude, algeriaPort.latitude],
        },
      }).catch(() => null);
      const next: JourneyPlaces = {
        home: access.origin,
        bled: access.destination,
        homePoint: access.originPoint,
        bledPoint: access.destinationPoint,
        europeMin: legWithPauses(europe.durationMin),
        algeriaMin: legWithPauses(algeria.durationMin),
        europeLine: lines ? thinLine(lines.toPort) : [],
        algeriaLine: lines ? thinLine(lines.fromPort) : [],
      };
      onChange(next);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Calcul impossible pour le moment. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  if (places && !open && !bare)
    return (
      <div className="bw-journey-places" data-filled>
        <MapPin size={15} aria-hidden />
        <p>
          <strong>Trajet sur mesure</strong> {places.home.split(",")[0]} → {europePort.name} ≈{" "}
          {durationLabel(places.europeMin)} · {algeriaPort.name} → {places.bled.split(",")[0]} ≈{" "}
          {durationLabel(places.algeriaMin)}
        </p>
        <button type="button" onClick={() => setOpen(true)}>
          Modifier
        </button>
      </div>
    );

  return (
    <form className="bw-journey-places" onSubmit={(event) => void submit(event)}>
      {bare ? null : <strong>Un trajet sur mesure ? (facultatif)</strong>}
      <div>
        <label>
          D'où partez-vous ?
          <input
            value={home}
            onChange={(event) => setHome(event.target.value)}
            placeholder="Ville, en Europe"
            autoComplete="address-level2"
          />
        </label>
        <label>
          Où allez-vous au bled ?
          <input
            value={bled}
            onChange={(event) => setBled(event.target.value)}
            placeholder="Ville, en Algérie"
            autoComplete="off"
          />
        </label>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="submit" disabled={pending}>
          {pending ? "Calcul…" : "Personnaliser mon parcours"}
        </button>
        {onSkip && !places ? (
          <button type="button" data-variant="ghost" onClick={onSkip}>
            Plus tard
          </button>
        ) : null}
        {places ? (
          <button
            type="button"
            data-variant="ghost"
            onClick={() => {
              onChange(null);
              setHome("");
              setBled("");
            }}
          >
            Revenir au parcours général
          </button>
        ) : null}
      </div>
      <small>Gardé sur cet appareil, jamais visible des autres.</small>
    </form>
  );
}

const inviteKey = (departureId: string) => `bledway:places-invite:${departureId}`;
const invited = (departureId: string) => {
  try {
    return window.localStorage.getItem(inviteKey(departureId)) !== null;
  } catch {
    return true;
  }
};
const markInvited = (departureId: string) => {
  try {
    window.localStorage.setItem(inviteKey(departureId), "1");
  } catch {
    /* sans stockage, l'invitation reviendra : elle reste ignorable */
  }
};

/**
 * Le trajet sur mesure, transverse au voyage : une invitation à la première visite (une fois par
 * traversée, ignorable), puis un bouton discret en tête de « Ma traversée » pour le faire ou le
 * modifier à tout moment.
 */
export function JourneyPlacesEntry({
  departureId,
  europePort,
  algeriaPort,
  places,
  onChange,
  invite = true,
  compact = false,
}: {
  departureId: string;
  europePort: Port;
  algeriaPort: Port;
  places: JourneyPlaces | null;
  onChange: (places: JourneyPlaces | null) => void;
  /** L'invitation n'a de sens qu'avant le départ ; ensuite, le bouton seul reste. */
  invite?: boolean;
  /** Téléphone : un bouton rond (point vert une fois rempli) plutôt qu'une pastille. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!invite || places || invited(departureId)) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
    // L'invitation ne dépend que de la traversée : un trajet rempli ensuite ne la relance pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureId]);
  const close = () => {
    markInvited(departureId);
    setOpen(false);
  };
  const city = (value: string) => value.split(",")[0];
  return (
    <>
      {compact ? (
        <button
          type="button"
          className="bw-round-button"
          data-filled={places ? "" : undefined}
          onClick={() => setOpen(true)}
          aria-label={
            places
              ? `Mon trajet : ${city(places.home)} → ${city(places.bled)}, modifier`
              : "Personnaliser mon trajet"
          }
          title={places ? `${city(places.home)} → ${city(places.bled)}` : "Personnaliser mon trajet"}
        >
          <MapPin size={16} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="bw-places-chip"
          data-filled={places ? "" : undefined}
          onClick={() => setOpen(true)}
          title={places ? "Modifier mon trajet sur mesure" : "Personnaliser mon trajet"}
        >
          <MapPin size={14} aria-hidden />
          <span>
            {places ? `${city(places.home)} → ${city(places.bled)}` : "Personnaliser mon trajet"}
          </span>
          {places ? <Pencil size={12} aria-hidden /> : null}
        </button>
      )}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          className="bw-places-dialog"
          // Une invitation : pas de clavier qui surgit avant que la personne ait choisi.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogTitle>Mon trajet, de porte à porte</DialogTitle>
          <DialogDescription>
            Mes villes de départ et d’arrivée : la route, l’heure de départ conseillée et la suite
            après le port sont calculées pour moi.
          </DialogDescription>
          <JourneyPlacesForm
            bare
            europePort={europePort}
            algeriaPort={algeriaPort}
            places={places}
            onChange={(next) => {
              onChange(next);
              close();
            }}
            onSkip={close}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
