// Veille : repère les nouveaux articles, sans IA ni clé. Claude les analyse ensuite (fonction watch-api).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  articleMeta,
  isRecent,
  latestPostSitemap,
  matchesKeywords,
  pageLinks,
  rssEntries,
  sitemapEntries,
  type FoundArticle,
} from "./parse.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const USER_AGENT = "BledWay-Veille/1.0 (+https://www.bledway.com)";
/** Pages d'articles lues par passage, pour rester discret auprès des sites. */
const MAX_ARTICLE_FETCHES = 8;
/** Articles gardés par navire ou compagnie : un même événement est repris par beaucoup de journaux. */
const MAX_PER_NAME = 3;

interface Source {
  id: string;
  url: string;
  kind: "sitemap" | "rss" | "page";
  keywords: string[];
  check_minutes: number;
  last_checked_at: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

/** Une recherche d'actualités par navire et par compagnie : leur nom figure toujours dans le titre retenu. */
async function readByName(db: SupabaseClient, source: Source, now: number) {
  const [vessels, companies] = await Promise.all([
    db.from("vessels").select("name").eq("status", "active"),
    db.from("companies").select("name"),
  ]);
  const names = [
    ...(vessels.data ?? []).map((row: { name: string }) => row.name),
    ...(companies.data ?? []).map((row: { name: string }) => row.name.split(" - ")[0]!),
  ];
  const articles = new Map<string, FoundArticle>();
  for (const name of new Set(names)) {
    try {
      const found = rssEntries(await fetchText(source.url.replace("{name}", encodeURIComponent(name))))
        .filter(
          (article) =>
            isRecent(article.publishedAt, now) &&
            article.title.toLowerCase().includes(name.toLowerCase()),
        )
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .slice(0, MAX_PER_NAME);
      for (const article of found) articles.set(article.url, article);
    } catch (error) {
      console.error("[watch-collect] recherche illisible", name, String(error));
    }
  }
  return [...articles.values()];
}

async function readSource(db: SupabaseClient, source: Source, now: number): Promise<FoundArticle[]> {
  if (source.url.includes("{name}")) return await readByName(db, source, now);
  if (source.kind === "rss") {
    return rssEntries(await fetchText(source.url)).filter(
      (article) =>
        isRecent(article.publishedAt, now) &&
        matchesKeywords(`${article.title} ${article.excerpt ?? ""}`, source.keywords),
    );
  }
  const index = await fetchText(source.url);
  const entries =
    source.kind === "page"
      ? pageLinks(source.url, index).map((url) => ({ url, lastmod: null }))
      : sitemapEntries(await fetchText(latestPostSitemap(index) ?? source.url))
          .filter((entry) => !entry.lastmod || isRecent(entry.lastmod, now))
          .slice(-40);
  const { data: seen } = await db
    .from("bw_watch_items")
    .select("url")
    .in("url", entries.map((entry) => entry.url));
  const known = new Set((seen ?? []).map((row: { url: string }) => row.url));
  const articles: FoundArticle[] = [];
  for (const entry of entries.filter((item) => !known.has(item.url)).slice(-MAX_ARTICLE_FETCHES)) {
    try {
      const article = articleMeta(entry.url, await fetchText(entry.url));
      if (
        article &&
        isRecent(article.publishedAt, now) &&
        matchesKeywords(`${article.title} ${article.excerpt ?? ""}`, source.keywords)
      )
        articles.push(article);
    } catch (error) {
      console.error("[watch-collect] article illisible", entry.url, String(error));
    }
  }
  return articles;
}

Deno.serve(async (request) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  ) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
  if (allowed !== true) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";
  const runId = params.get("run");
  const now = Date.now();
  const { data: sources, error } = await db
    .from("bw_watch_sources")
    .select("id,url,kind,keywords,check_minutes,last_checked_at")
    .eq("active", true);
  if (error) return json({ error: "Sources illisibles" }, 500);

  let found = 0;
  let errors = 0;
  for (const source of (sources ?? []) as Source[]) {
    const last = source.last_checked_at ? Date.parse(source.last_checked_at) : 0;
    if (!force && now - last < (source.check_minutes - 2) * 60_000) continue;
    let lastError: string | null = null;
    try {
      const articles = await readSource(db, source, now);
      if (articles.length) {
        const { data } = await db
          .from("bw_watch_items")
          .upsert(
            articles.map((article) => ({
              source_id: source.id,
              url: article.url,
              title: article.title.slice(0, 300),
              excerpt: article.excerpt,
              published_at: article.publishedAt,
            })),
            { onConflict: "url", ignoreDuplicates: true },
          )
          .select("id");
        found += data?.length ?? 0;
      }
    } catch (failure) {
      errors += 1;
      lastError = String(failure).slice(0, 200);
      console.error("[watch-collect]", source.url, lastError);
    }
    await db
      .from("bw_watch_sources")
      .update({ last_checked_at: new Date(now).toISOString(), last_error: lastError })
      .eq("id", source.id);
  }

  // Articles sans suite : inutile de les garder au-delà de 60 jours.
  const { data: kept } = await db.from("bw_watch_proposals").select("item_id");
  const keptIds = (kept ?? []).map((row: { item_id: string }) => row.item_id);
  let purge = db
    .from("bw_watch_items")
    .delete()
    .lt("found_at", new Date(now - 60 * 86_400_000).toISOString())
    .not("analyzed_at", "is", null);
  if (keptIds.length) purge = purge.not("id", "in", `(${keptIds.join(",")})`);
  await purge;

  const finished = { finished_at: new Date().toISOString(), items_found: found, errors };
  if (runId) await db.from("bw_watch_runs").update(finished).eq("id", runId);
  else await db.from("bw_watch_runs").insert(finished);
  await db
    .from("bw_watch_runs")
    .delete()
    .lt("requested_at", new Date(now - 30 * 86_400_000).toISOString());
  return json({ found, errors });
});
