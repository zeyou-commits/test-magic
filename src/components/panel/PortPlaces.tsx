import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Car,
  Clock3,
  Cross,
  Fuel,
  MapPin,
  Navigation,
  ParkingCircle,
  Smartphone,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import {
  placeDirectionsUrl,
  placeKinds,
  portPlacesQuery,
  type PlaceKind,
  type PortPlace,
} from "@/lib/ferry/flash";

const icons: Record<PlaceKind, LucideIcon> = {
  fuel: Fuel,
  parking: ParkingCircle,
  food: UtensilsCrossed,
  pharmacy: Cross,
  exchange: Banknote,
  atm: Banknote,
  sim: Smartphone,
  other: MapPin,
};

function PlaceRow({ place, portName }: { place: PortPlace; portName: string }) {
  const Icon = icons[place.kind] ?? MapPin;
  return (
    <li className="bw-place">
      <span className="bw-place-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="bw-place-kind">
          {placeKinds[place.kind].label}
          {place.distance_label ? ` · ${place.distance_label}` : ""}
        </p>
        <strong>{place.name}</strong>
        {place.address ? <p className="bw-place-line">{place.address}</p> : null}
        {place.hours ? (
          <p className="bw-place-line">
            <Clock3 size={12} aria-hidden /> {place.hours}
          </p>
        ) : null}
        {place.note ? <p className="bw-place-note">{place.note}</p> : null}
      </div>
      <a
        className="bw-place-go"
        href={placeDirectionsUrl(place, portName)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Navigation size={14} aria-hidden /> Y aller
        <span className="sr-only"> (itinéraire dans un nouvel onglet)</span>
      </a>
    </li>
  );
}

/** Lieux pratiques autour du terminal, regroupés « avant le départ » et « à l'arrivée ». */
export function PortPlaces({ portId, portName }: { portId: string; portName: string }) {
  const places = useQuery(portPlacesQuery(portId));
  if (places.isPending || places.data === null) return null;
  if (places.isError)
    return (
      <p className="bw-community-error" role="status">
        Les lieux pratiques sont momentanément indisponibles.{" "}
        <button type="button" onClick={() => void places.refetch()}>
          Réessayer
        </button>
      </p>
    );
  const list = places.data ?? [];
  const groups = [
    {
      id: "before",
      title: "Avant le terminal",
      hint: "Plein, stationnement, repas, pharmacie",
      icon: Car,
      items: list.filter((place) => placeKinds[place.kind].group === "before"),
    },
    {
      id: "after",
      title: "À l’arrivée",
      hint: "Change, distributeurs, cartes SIM",
      icon: Banknote,
      items: list.filter((place) => placeKinds[place.kind].group === "after"),
    },
  ].filter((group) => group.items.length);
  return (
    <section className="bw-places" aria-labelledby={`places-${portId}`}>
      <div className="port-section-heading">
        <div>
          <h3 id={`places-${portId}`}>Lieux pratiques</h3>
          <p>Repérés par l’équipe BledWay autour du port.</p>
        </div>
      </div>
      {groups.length ? (
        groups.map((group) => (
          <div key={group.id} className="bw-places-group">
            <h4>
              <group.icon size={14} aria-hidden /> {group.title}
              <small>{group.hint}</small>
            </h4>
            <ul>
              {group.items.map((place) => (
                <PlaceRow key={place.id} place={place} portName={portName} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">
          Les lieux pratiques de ce port arrivent bientôt.
        </p>
      )}
      <p className="bw-community-caption">
        Horaires indicatifs : vérifiez sur place. L’itinéraire s’ouvre dans Google Maps.
      </p>
    </section>
  );
}
