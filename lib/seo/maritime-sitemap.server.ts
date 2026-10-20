import { supabase } from "@/integrations/supabase/client";
export async function maritimeEntries() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  async function read(table: "ports" | "routes") {
    const all: { slug: string; updated_at: string }[] = [];
    const size = 1000;
    for (let page = 0; page < 50; page++) {
      let query = supabase
        .from(table)
        .select("slug, updated_at")
        .eq("is_demo", false)
        .order("slug")
        .range(page * size, (page + 1) * size - 1)
        .abortSignal(controller.signal);
      query = table === "ports" ? query.neq("status", "draft") : query.eq("status", "active");
      const { data, error } = await query;
      if (error) throw new Error("Catalogue maritime temporairement indisponible");
      all.push(...(data ?? []));
      if (!data || data.length < size) return all;
    }
    throw new Error("Catalogue trop volumineux : partitionner le sitemap maritime");
  }
  try {
    const [ports, lines] = await Promise.all([read("ports"), read("routes")]);
    return [
      ...ports.map((p) => ({
        path: `/ports/${encodeURIComponent(p.slug)}`,
        lastmod: p.updated_at,
      })),
      ...lines.map((l) => ({
        path: `/lignes/${encodeURIComponent(l.slug)}`,
        lastmod: l.updated_at,
      })),
    ];
  } finally {
    clearTimeout(timeout);
  }
}
