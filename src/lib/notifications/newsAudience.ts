// Qui prévenir d'une actualité : ceux qui suivent le navire, sa compagnie, ou une traversée concernée.
// Une « info » qui ne touche aucun départ précis (flotte, ligne en projet…) s'affiche sur les pages
// compagnie et navire sans notifier personne.
export type AudienceFollow = { user_id: string; target_kind: string; target_id: string };
export type AudienceVessel = { id: string; company_id: string | null };
export type AudienceDeparture = { id: string; vessel_id: string | null; company_id: string | null };
export type AudienceNews = {
  kind?: string | null;
  vessel_id?: string | null;
  company_ids: string[];
  departure_ids: string[];
};

export function newsAudience(
  news: AudienceNews,
  follows: AudienceFollow[],
  vessels: AudienceVessel[],
  departures: AudienceDeparture[],
) {
  if (news.kind === "info" && news.departure_ids.length === 0) return [];
  const companies = new Set(news.company_ids);
  const concernsVessel = (id: string | null) =>
    Boolean(id) &&
    (id === news.vessel_id ||
      companies.has(vessels.find((vessel) => vessel.id === id)?.company_id ?? ""));
  const users = follows.filter((follow) => {
    if (follow.target_kind === "company") return companies.has(follow.target_id);
    if (follow.target_kind === "vessel") return concernsVessel(follow.target_id);
    if (follow.target_kind !== "departure") return false;
    if (news.departure_ids.includes(follow.target_id)) return true;
    const departure = departures.find((item) => item.id === follow.target_id);
    return Boolean(
      departure &&
        (concernsVessel(departure.vessel_id) || companies.has(departure.company_id ?? "")),
    );
  });
  return [...new Set(users.map((follow) => follow.user_id))];
}
