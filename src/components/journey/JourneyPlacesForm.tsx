import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { calculateRoadAccess, calculateRoadGeometry } from "@/lib/ferry/itinerary.functions";
import { legWithPauses } from "@/lib/ferry/itinerary";
import { durationLabel } from "@/lib/ferry/journeySteps";
import { thinLine, type JourneyPlaces } from "@/lib/ferry/journeyTrips";
import type { Port } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

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
  returning = false,
}: {
  europePort: Port;
  algeriaPort: Port;
  places: JourneyPlaces | null;
  onChange: (places: JourneyPlaces | null) => void;
  /** Dans la fenêtre : le formulaire seul, sans titre ni résumé. */
  bare?: boolean;
  /** Retour Algérie → Europe : on part du bled, on arrive en Europe (champs dans cet ordre). */
  returning?: boolean;
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
      setError(
        returning
          ? "Indiquez votre ville de départ au bled et votre ville d'arrivée en Europe."
          : "Indiquez une ville de départ et une ville au bled.",
      );
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

  const homeField = (label: string) => (
    <label>
      {label}
      <input
        value={home}
        onChange={(event) => setHome(event.target.value)}
        placeholder={tr("ui.journeyPlacesForm.villeEnEurope")}
        autoComplete="address-level2"
      />
    </label>
  );
  const bledField = (label: string) => (
    <label>
      {label}
      <input
        value={bled}
        onChange={(event) => setBled(event.target.value)}
        placeholder={tr("ui.journeyPlacesForm.villeEnAlgerie")}
        autoComplete="off"
      />
    </label>
  );

  if (places && !open && !bare)
    return (
      <div className="bw-journey-places" data-filled>
        <MapPin size={15} aria-hidden />
        <p>
          <strong>{tr("ui.journeyPlacesForm.trajetSurMesure")}</strong>{" "}
          {returning ? (
            <>
              {places.bled.split(",")[0]} → {algeriaPort.name} ≈ {durationLabel(places.algeriaMin)}{" "}
              · {europePort.name} → {places.home.split(",")[0]} ≈ {durationLabel(places.europeMin)}
            </>
          ) : (
            <>
              {places.home.split(",")[0]} → {europePort.name} ≈ {durationLabel(places.europeMin)} ·{" "}
              {algeriaPort.name} → {places.bled.split(",")[0]} ≈ {durationLabel(places.algeriaMin)}
            </>
          )}
        </p>
        <button type="button" onClick={() => setOpen(true)}>
          {tr("ui.journeyPlacesForm.modifier")}
        </button>
      </div>
    );

  return (
    <form className="bw-journey-places" onSubmit={(event) => void submit(event)}>
      {bare ? null : <strong>{tr("ui.journeyPlacesForm.unTrajetSurMesureFacultatif")}</strong>}
      {/* Aller : Europe puis bled. Retour : bled puis Europe. Les données restent les mêmes. */}
      <div>
        {returning ? (
          <>
            {bledField("D'où partez-vous au bled ?")}
            {homeField("Où arrivez-vous en Europe ?")}
          </>
        ) : (
          <>
            {homeField("D'où partez-vous ?")}
            {bledField("Où allez-vous au bled ?")}
          </>
        )}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="submit" disabled={pending}>
          {pending ? tr("ui.journeyPlacesForm.calcul") : tr("ui.journeyPlacesForm.personnaliserMonParcours")}
        </button>
        {onSkip && !places ? (
          <button type="button" data-variant="ghost" onClick={onSkip}>
            {tr("ui.journeyPlacesForm.plusTard")}
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
            {tr("ui.journeyPlacesForm.revenirAuParcoursGeneral")}
          </button>
        ) : null}
      </div>
      <small>{tr("ui.journeyPlacesForm.gardeSurCetAppareilJamais")}</small>
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
  returning = false,
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
  /** Traversée retour (Algérie → Europe). */
  returning?: boolean;
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
  // Dans le sens du voyage : au retour, du bled vers l'Europe.
  const trip = places
    ? returning
      ? `${city(places.bled)} → ${city(places.home)}`
      : `${city(places.home)} → ${city(places.bled)}`
    : null;
  return (
    <>
      {compact ? (
        <button
          type="button"
          className="bw-round-button"
          data-filled={places ? "" : undefined}
          onClick={() => setOpen(true)}
          aria-label={trip ? `Mon trajet : ${trip}, modifier` : tr("ui.journeyPlacesForm.personnaliserMonTrajet")}
          title={trip ?? tr("ui.journeyPlacesForm.personnaliserMonTrajet")}
        >
          <MapPin size={16} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="bw-places-chip"
          data-filled={places ? "" : undefined}
          onClick={() => setOpen(true)}
          title={places ? tr("ui.journeyPlacesForm.modifierMonTrajetSurMesure") : tr("ui.journeyPlacesForm.personnaliserMonTrajet")}
        >
          <MapPin size={14} aria-hidden />
          <span>{trip ?? tr("ui.journeyPlacesForm.personnaliserMonTrajet")}</span>
          {places ? <Pencil size={12} aria-hidden /> : null}
        </button>
      )}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          className="bw-places-dialog"
          // Une invitation : pas de clavier qui surgit avant que la personne ait choisi.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogTitle>{tr("ui.journeyPlacesForm.monTrajetDePorteA")}</DialogTitle>
          <DialogDescription>
            {tr("ui.journeyPlacesForm.mesVillesDeDepartEt")}
          </DialogDescription>
          <JourneyPlacesForm
            bare
            returning={returning}
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
