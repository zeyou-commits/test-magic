import { useQuery } from "@tanstack/react-query";
import { usageDb } from "@/lib/usage";

type Row = { day: string; event: string; path: string };
const DAYS = 7;

/** La semaine en chiffres : pages vues, puis ce que devient une recherche. */
export function UsageAdmin() {
  const { data, error, isPending } = useQuery({
    queryKey: ["admin", "usage"],
    queryFn: async () => {
      const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await usageDb
          .from("bw_usage_events")
          .select("day, event, path")
          .gte("day", since)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw new Error(result.error.message);
        rows.push(...((result.data ?? []) as Row[]));
        if ((result.data ?? []).length < 1000) break;
      }
      return rows;
    },
  });
  if (isPending) return <p className="text-sm text-muted-foreground">Lecture de la semaine…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">Mesure indisponible : {error.message}</p>;
  const count = (event: string) => data.filter((row) => row.event === event).length;
  const pages = new Map<string, number>();
  for (const row of data)
    if (row.event === "page_view") pages.set(row.path, (pages.get(row.path) ?? 0) + 1);
  const funnel = [
    ["Résultats de recherche affichés", count("search_results")],
    ["Traversée choisie", count("search_choice")],
    ["Sortie vers une compagnie", count("booking_click")],
  ] as const;
  return (
    <div className="grid max-w-3xl gap-5">
      <p className="text-sm text-muted-foreground">
        {DAYS} derniers jours, en mesure anonyme : ni compte, ni adresse IP, ni cookie. Les visites
        de l'espace équipe ne sont pas comptées.
      </p>
      <section className="bw-admin-surface p-4">
        <h2 className="text-sm font-semibold">Parcours de recherche</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {funnel.map(([label, value]) => (
            <li key={label} className="flex justify-between py-2">
              {label} <b className="tabular-nums">{value}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="bw-admin-surface p-4">
        <h2 className="text-sm font-semibold">Pages les plus vues · {count("page_view")} vues</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {[...pages.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([path, value]) => (
              <li key={path} className="flex justify-between gap-3 py-2">
                <span className="truncate">{path}</span> <b className="tabular-nums">{value}</b>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
