// Fil public d'actualités : seules les informations rattachées à une source citée y figurent.
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { looksInternal, newsKey, newsSchema, type NewsItem } from "./flash";

const db = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;

/**
 * Une information sans source, ou un essai, reste hors du fil et de l'index des moteurs.
 * Une annonce de l'équipe BledWay (bêta, nouveauté…) n'a pas d'article source et peut parler de test.
 */
export function isPublicNews(
  item: Pick<NewsItem, "title" | "summary" | "source_url"> & Partial<Pick<NewsItem, "origin">>,
) {
  const text = `${item.title} ${item.summary}`;
  if (item.origin === "bledway") return !looksInternal(text);
  return (
    Boolean(item.source_url?.startsWith("https://")) &&
    !/\btest\b/i.test(text) &&
    !looksInternal(text)
  );
}

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");

export const newsSlug = (item: Pick<NewsItem, "id" | "title">) =>
  `${slugify(item.title)}-${item.id}`;
export const newsPath = (item: Pick<NewsItem, "id" | "title">) => `/actualites/${newsSlug(item)}`;

/** L'identifiant termine l'adresse : le titre peut changer sans casser le lien. */
export const newsIdFromSlug = (slug: string) =>
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(slug)?.[0] ?? null;

export async function newsFeedItems(): Promise<NewsItem[]> {
  const { data, error } = await db
    .from("bw_news")
    .select("*")
    .eq("published", true)
    .order("starts_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Les actualités sont momentanément indisponibles.");
  return z.array(newsSchema).parse(data).filter(isPublicNews);
}

export type NewsDeparture = {
  id: string;
  departure_at: string;
  status: string;
  route_id: string;
  vessel_id: string | null;
};
/** Les traversées citées par une actualité, passées comprises : chacune s'ouvre sur la carte. */
export const newsDeparturesQuery = (ids: string[]) =>
  queryOptions({
    queryKey: [...newsKey, "departures", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<NewsDeparture[]> => {
      const { data, error } = await db
        .from("departures")
        .select("id,departure_at,status,route_id,vessel_id")
        .in("id", ids);
      if (error) return [];
      return (data as NewsDeparture[]).sort((a, b) => a.departure_at.localeCompare(b.departure_at));
    },
  });

export const newsFeedQuery = queryOptions({
  queryKey: [...newsKey, "feed"],
  queryFn: newsFeedItems,
  staleTime: 60_000,
});

export const newsDay = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

/** Sans accents ni ponctuation, mots séparés par une espace : « Algérie Ferries » → « algerie ferries ». */
const plainWords = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Les compagnies d'une actualité : celles rattachées par l'équipe, sinon l'armateur du navire,
 * sinon une compagnie nommée dans le titre (actualité de la veille pas encore rattachée).
 */
export function newsCompanyIds(
  item: Pick<NewsItem, "company_ids" | "vessel_id" | "title">,
  vessels: { id: string; company_id: string | null }[],
  companies: { id: string; name: string }[] = [],
) {
  if (item.company_ids.length) return item.company_ids;
  const owner = vessels.find((vessel) => vessel.id === item.vessel_id)?.company_id;
  if (owner) return [owner];
  const title = ` ${plainWords(item.title)} `;
  return companies
    .filter((company) =>
      // « Naviera Armas - Trasmediterránea » se reconnaît aussi par chacun de ses noms.
      company.name
        .split(/\s+-\s+/)
        .map(plainWords)
        .filter((name) => name.length >= 3)
        .some((name) => title.includes(` ${name} `)),
    )
    .map((company) => company.id);
}
