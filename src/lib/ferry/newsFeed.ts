// Fil public d'actualités : seules les informations rattachées à une source citée y figurent.
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { newsKey, newsSchema, type NewsItem } from "./flash";

const db = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;

/** Une information sans source, ou un essai, reste hors du fil et de l'index des moteurs. */
export function isPublicNews(item: Pick<NewsItem, "title" | "summary" | "source_url">) {
  return (
    Boolean(item.source_url?.startsWith("https://")) &&
    !/\btest\b/i.test(`${item.title} ${item.summary}`)
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
