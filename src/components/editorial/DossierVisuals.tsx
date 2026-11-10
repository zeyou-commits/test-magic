import type { Article, Section } from "@/content/types";

/** En-tête compact : titre et chiffres clés à gauche, illustration contenue à droite. */
export function DossierHero({ article, updated }: { article: Article; updated: string }) {
  const ill = article.illustration;
  return (
    <header className="grid items-center gap-6 py-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-10 md:py-10">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Carnet de route</p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight md:text-[2.6rem]">
          {article.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{article.description}</p>
        {article.keyFacts?.length ? (
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {article.keyFacts.map((f) => (
              <div key={f.label} className="rounded-xl border bg-card px-3 py-3 text-center">
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-display text-xl font-bold leading-none md:text-2xl">{f.value}</dd>
                <dd className="mt-1 text-xs leading-snug text-muted-foreground">{f.label}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-5 text-sm text-muted-foreground">BledWay · Mis à jour le {updated}</p>
      </div>
      {ill ? (
        <figure className="mx-auto w-full max-w-md md:max-w-none">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-amber-50 dark:from-sky-950/40 dark:to-amber-950/20">
            <img
              src={ill.src}
              alt={ill.alt}
              width={ill.width}
              height={ill.height}
              fetchPriority="high"
              decoding="async"
              className="mx-auto h-auto max-h-56 w-auto object-contain md:max-h-72"
            />
          </div>
          <figcaption className="mt-2 text-center text-xs italic leading-relaxed text-muted-foreground">
            {ill.caption}
          </figcaption>
        </figure>
      ) : null}
    </header>
  );
}

/** Barres horizontales : la durée de chaque navire se compare d'un coup d'œil. */
export function DurationBars({ bars, title }: { bars: NonNullable<Section["bars"]>; title: string }) {
  const max = Math.max(...bars.rows.map((r) => r.value));
  const min = Math.min(...bars.rows.map((r) => r.value));
  const floor = Math.max(0, min - (max - min) * 2 - 2);
  return (
    <figure className="mt-5 rounded-2xl border bg-card p-4 md:p-6">
      <ul className="space-y-4" aria-label={title}>
        {bars.rows.map((r) => {
          const pct = 35 + ((r.value - floor) / (max - floor)) * 65;
          return (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {r.label} <span className="font-normal text-muted-foreground">· {r.sub}</span>
                </span>
                <span className="shrink-0 font-display font-bold">{r.display}</span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {bars.note ? <figcaption className="mt-4 text-xs leading-relaxed text-muted-foreground">{bars.note}</figcaption> : null}
    </figure>
  );
}
