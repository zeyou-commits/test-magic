import { CONSULATS_EUROPE_CHECKED, europePosts } from "./consulatsEurope.data";

/**
 * Les postes d'Algérie dans les autres pays d'Europe (la France est détaillée par département dans
 * consulats.ts). Source : ministère algérien des Affaires étrangères ; données générées par
 * scripts/consulats-europe.mjs.
 */

export { CONSULATS_EUROPE_CHECKED };

export interface EuropePost {
  name: string;
  address: string;
  phone: string;
  email: string;
  site: string;
  /** [longitude, latitude] de l'adresse, pour classer du plus proche au plus loin. */
  point: [number, number] | null;
}

export interface EuropeCountryPosts {
  country: string;
  name: string;
  posts: EuropePost[];
}

export const MFA_REPRESENTATIONS_URL = "https://www.mfa.gov.dz/fr/embassys-locations-list";

const km = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const isConsulate = (post: EuropePost) => /consulat/i.test(post.name);

/**
 * Où faire ses démarches dans ce pays : les consulats, du plus proche au plus loin ; sans
 * consulat, l'ambassade. null : pays absent de la liste officielle reprise ici.
 */
export function europeConsulates(country: string, home: [number, number] | null = null) {
  const entry = europePosts.find((c) => c.country === country);
  if (!entry) return null;
  const consulates = entry.posts.filter(isConsulate);
  const posts = (consulates.length ? consulates : entry.posts).map((post) => ({
    ...post,
    km: home && post.point ? Math.round(km(home, post.point)) : null,
  }));
  posts.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  return { country: entry.name, embassyOnly: !consulates.length, posts };
}
