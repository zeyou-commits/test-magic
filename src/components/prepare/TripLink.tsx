import { ArrowRight, Heart, Ship } from "lucide-react";
import { useTravelAction } from "@/hooks/useTravelAction";
import {
  favoriteWhen,
  useFavoriteCrossings,
  type FavoriteCrossing,
} from "@/lib/ferry/favoriteCrossings";
import { useMyTrip } from "@/lib/ferry/myTrip";

/** La traversée déjà déclarée « Ma traversée » : ce que « Mon voyage » suit. */
export function useLinkedTrip() {
  const { trip } = useMyTrip();
  if (!trip?.from || !trip.to) return null;
  return {
    id: trip.departure.id,
    label: `${trip.from.name} → ${trip.to.name}`,
    at: trip.departure.departure_at,
    fromPortId: trip.from.id,
    toPortId: trip.to.id,
  };
}

/** Les favoris de la ligne préparée d'abord, puis les autres. */
export function sortFavorites(
  list: FavoriteCrossing[],
  fromPortId: string | null,
  toPortId: string | null,
) {
  const score = (item: FavoriteCrossing) =>
    (item.fromPortId === fromPortId ? 0 : 2) + (item.toPortId === toPortId ? 0 : 1);
  return [...list].sort(
    (a, b) => score(a) - score(b) || a.departureAt.localeCompare(b.departureAt),
  );
}

export const openMyVoyage = () => window.location.assign("/?voyage=1");

/**
 * Le pont entre « Préparer » et « Mon voyage » : la traversée déjà suivie comme la sienne, ou les
 * traversées en favori à transformer en « Ma traversée » d'un geste.
 */
export function TripLink({
  fromPortId,
  toPortId,
  className = "",
}: {
  fromPortId: string | null;
  toPortId: string | null;
  className?: string;
}) {
  const linked = useLinkedTrip();
  const favorites = useFavoriteCrossings();
  const request = useTravelAction();
  if (linked)
    return (
      <section className={`bw-triplink bw-triplink--mine ${className}`} aria-label="Ma traversée">
        <span className="bw-triplink__icon" aria-hidden>
          <Ship size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <small>Ma traversée · suivie dans Mon voyage</small>
          <b>{linked.label}</b>
          <span>{favoriteWhen(linked.at)}</span>
        </span>
        <button type="button" className="bw-triplink__go" onClick={openMyVoyage}>
          Mon voyage <ArrowRight size={14} aria-hidden />
        </button>
      </section>
    );
  if (!favorites.length) return null;
  const list = sortFavorites(favorites, fromPortId, toPortId).slice(0, 3);
  return (
    <section className={`bw-triplink ${className}`} aria-labelledby="triplink-title">
      <p id="triplink-title" className="bw-triplink__head">
        <Heart size={14} className="fill-current" aria-hidden /> Dans vos favoris
      </p>
      <p className="bw-triplink__hint">
        Vous avez déjà votre billet pour l'une d'elles ? Faites-en votre traversée : « Mon voyage »
        la suivra pas à pas, avec ce que vous avez préparé ici.
      </p>
      <ul>
        {list.map((item) => (
          <li key={item.id}>
            <span className="min-w-0 flex-1">
              <b>{item.label}</b>
              <span>
                {item.vesselName ? `${item.vesselName} · ` : ""}
                {favoriteWhen(item.departureAt)}
              </span>
            </span>
            <button
              type="button"
              className="bw-triplink__go"
              onClick={() =>
                request({
                  type: "follow",
                  kind: "departure",
                  targetId: item.id,
                  label: item.label,
                  traveller: true,
                  purpose: "voyageur",
                })
              }
            >
              C'est ma traversée
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
