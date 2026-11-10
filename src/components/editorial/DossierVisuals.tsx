import type { Article, LineGlance, Section } from "@/content/types";
import { primaryLink } from "./Editorial";

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

/** La ligne du dossier vue en perspective : deux rives, le tracé, un bateau qui avance. */
export function LinePerspective({ line }: { line: LineGlance }) {
  return (
    <section aria-label={`La ligne ${line.from} → ${line.to}`} className="mt-8 overflow-hidden rounded-2xl border bg-card">
      <div className="bw-line3d" aria-hidden>
        <div className="bw-line3d__plane">
          <svg viewBox="0 0 800 460" className="bw-line3d__svg">
            <defs>
              <linearGradient id="bw-sea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#7cc4e4" />
                <stop offset="1" stopColor="#1d6b9a" />
              </linearGradient>
              <pattern id="bw-swell" width="60" height="26" patternUnits="userSpaceOnUse">
                <path d="M0 13 Q15 7 30 13 T60 13" fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="2" />
              </pattern>
            </defs>
            <rect width="800" height="460" fill="url(#bw-sea)" />
            <rect width="800" height="460" fill="url(#bw-swell)" />
            {/* Rive nord (France), au loin */}
            <path d="M0 0 H800 V70 C720 92 660 60 590 84 C520 108 470 72 400 92 C340 108 300 80 240 96 C170 114 90 84 0 104 Z" fill="#efe4c8" />
            <path d="M0 0 H800 V40 C700 58 620 36 520 52 C420 68 330 44 230 58 C140 70 70 50 0 64 Z" fill="#cfdcb0" />
            {/* Rive sud (Algérie), au premier plan */}
            <path d="M0 460 H800 V372 C730 352 680 384 610 366 C540 348 490 380 420 362 C350 344 300 376 220 360 C140 344 70 372 0 356 Z" fill="#ecd5a6" />
            <path d="M0 460 H800 V412 C700 396 640 420 540 404 C440 390 360 418 260 404 C160 392 80 416 0 404 Z" fill="#d9c08a" />
            <path id="bw-route" d="M330 96 C360 190 470 250 452 366" fill="none" stroke="#ffffff" strokeWidth="6" strokeDasharray="14 12" strokeLinecap="round" />
            <circle cx="330" cy="96" r="13" fill="#0f2a3d" stroke="#fff" strokeWidth="5" />
            <circle cx="452" cy="366" r="13" fill="#157a43" stroke="#fff" strokeWidth="5" />
            <g className="bw-line3d__tag" transform="translate(220 92) scale(1 1.8)">
              <rect x="-78" y="-20" width="156" height="38" rx="19" fill="#fff" />
              <text y="7" textAnchor="middle" fontSize="23" fontWeight="700" fill="#0f2a3d">{line.from}</text>
            </g>
            <g className="bw-line3d__tag" transform="translate(560 380) scale(1 1.6)">
              <rect x="-60" y="-19" width="120" height="36" rx="18" fill="#157a43" />
              <text y="7" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff">{line.to}</text>
            </g>
            <g className="bw-line3d__boat">
              <ellipse cx="-30" cy="0" rx="30" ry="5" fill="#ffffff" opacity="0.45" />
              <path d="M-22 -5 H22 L15 8 H-15 Z" fill="#0f2a3d" />
              <rect x="-16" y="-13" width="30" height="9" rx="2" fill="#ffffff" />
              <rect x="-10" y="-20" width="18" height="8" rx="2" fill="#ffffff" />
              <rect x="2" y="-26" width="5" height="7" fill="#f0682c" />
              <animateMotion dur="10s" repeatCount="indefinite" rotate="auto">
                <mpath href="#bw-route" />
              </animateMotion>
            </g>
          </svg>
        </div>
        <span className="bw-line3d__badge">1 nuit en mer</span>
      </div>
      <div className="flex flex-col gap-5 p-5 md:p-7">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">La ligne en un coup d'œil</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {line.from} → {line.to}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {line.facts.map((f) => (
              <div key={f.label} className="rounded-xl bg-secondary px-3 py-3">
                <dt className="text-xs leading-snug text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 font-display text-base font-bold leading-tight md:text-lg">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={`/lignes/${line.slug}`} className={`${primaryLink} sm:flex-1`}>
            Voir la ligne et les départs
          </a>
          <a href="/" className="rounded-lg border sm:flex-1 px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-secondary">
            Suivre un bateau en direct
          </a>
        </div>
      </div>
    </section>
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
