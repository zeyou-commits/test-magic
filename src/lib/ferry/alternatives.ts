type AltDeparture = {
  id: string;
  route_id: string;
  vessel_id: string | null;
  departure_at: string;
  status: string;
};
type AltRoute = { id: string; departure_port_id: string; arrival_port_id: string };
type AltNews = {
  kind: string;
  route_ids: string[];
  departure_ids: string[];
  vessel_id?: string | null | undefined;
  starts_at?: string | undefined;
  ends_at?: string | null | undefined;
};

const DAY = 86_400_000;
const MAX_PER_GROUP = 3;

/**
 * Le départ est-il touché par une perturbation ou une alerte publiée ? Une alerte sur un navire ne
 * touche que ce navire : les autres compagnies de la ligne restent de vraies alternatives.
 */
export function isDisrupted(
  departure: { id: string; route_id: string },
  news: AltNews[],
  now = Date.now(),
) {
  return news.some(
    (item) =>
      (item.kind === "alerte" ||
        (item.kind === "perturbation" &&
          // Comme le bandeau : une perturbation sans date de fin ne compte que 48 h.
          (Boolean(item.ends_at) ||
            !item.starts_at ||
            now - Date.parse(item.starts_at) < 48 * 3_600_000))) &&
      (item.departure_ids.includes(departure.id) ||
        (!item.vessel_id && item.route_ids.includes(departure.route_id))),
  );
}

/**
 * Départs à proposer autour d'un départ touché : d'abord la même ligne, puis les lignes qui partent
 * du même port ou arrivent au même port. Jamais un navire en alerte ni un départ lui-même touché.
 */
export function findAlternatives<D extends AltDeparture>(
  target: AltDeparture,
  departures: D[],
  routes: AltRoute[],
  isVesselAlerted: (vesselId: string) => boolean,
  news: AltNews[] = [],
  now = Date.now(),
  windowDays = 7,
) {
  const line = routes.find((route) => route.id === target.route_id);
  const start = Date.parse(target.departure_at);
  const distance = (departure: D) => Math.abs(Date.parse(departure.departure_at) - start);
  const usable = departures
    .filter(
      (departure) =>
        departure.id !== target.id &&
        departure.status !== "cancelled" &&
        Date.parse(departure.departure_at) > now &&
        distance(departure) <= windowDays * DAY &&
        !(departure.vessel_id && isVesselAlerted(departure.vessel_id)) &&
        !isDisrupted(departure, news, now),
    )
    .sort((a, b) => distance(a) - distance(b));
  const sameLine = usable.filter((departure) => departure.route_id === target.route_id);
  const nearby = usable.filter((departure) => {
    if (departure.route_id === target.route_id || !line) return false;
    const route = routes.find((item) => item.id === departure.route_id);
    return (
      route?.departure_port_id === line.departure_port_id ||
      route?.arrival_port_id === line.arrival_port_id
    );
  });
  return { sameLine: sameLine.slice(0, MAX_PER_GROUP), nearby: nearby.slice(0, MAX_PER_GROUP) };
}
