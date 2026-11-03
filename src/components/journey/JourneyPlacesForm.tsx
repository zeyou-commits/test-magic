import { useState, type FormEvent } from "react";
import { MapPin } from "lucide-react";
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
}: {
  europePort: Port;
  algeriaPort: Port;
  places: JourneyPlaces | null;
  onChange: (places: JourneyPlaces | null) => void;
}) {
  const [home, setHome] = useState(places?.home ?? "");
  const [bled, setBled] = useState(places?.bled ?? "");
  const [open, setOpen] = useState(!places);
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

  if (places && !open)
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
      <strong>Un trajet sur mesure ? (facultatif)</strong>
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
      <small>
        Utilisé seulement pour le calcul, gardé sur cet appareil, jamais visible des autres.
      </small>
    </form>
  );
}
