import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { isPublicNews, newsSlug } from "@/lib/ferry/newsFeed";
import { newsQuery, useIgnoredFlash } from "@/lib/ferry/flash";

/** Mêmes règles que le fil du bandeau : actualités publiques de moins de 7 jours, hors alertes. */
const RAIL_MS = 7 * 24 * 3_600_000;
const STEP_MS = 6000;

/**
 * Haut de l'accueil : le fil d'actualités tient dans une pastille « En direct » qui fait défiler
 * les titres un par un. Lien vers l'actualité affichée ; flèche pour passer à la suivante.
 * Rien s'il n'y a pas d'actualité récente.
 */
export function HomeLivePill({ compact = false }: { compact?: boolean }) {
  const { data: news } = useQuery(newsQuery);
  const ignored = useIgnoredFlash();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const items = (news ?? [])
    .filter(
      (item) =>
        item.kind !== "alerte" &&
        isPublicNews(item) &&
        !ignored.has(`n-${item.id}`) &&
        Date.now() - Date.parse(item.starts_at) < RAIL_MS,
    )
    .slice(0, 8);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), STEP_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const current = items[index % count]!;
  return (
    <div
      className="bw-live-pill"
      data-compact={compact || undefined}
      role="region"
      aria-label="Actualités en direct"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link to="/actualites" className="bw-live-pill__tag">
        <i aria-hidden />
        En direct
      </Link>
      <Link
        key={current.id}
        to="/actualites/$slug"
        params={{ slug: newsSlug(current) }}
        className="bw-live-pill__text"
      >
        {current.title}
      </Link>
      {count > 1 ? (
        <button
          type="button"
          className="bw-live-pill__next"
          onClick={() => setIndex((value) => (value + 1) % count)}
          aria-label={`Actualité suivante (${(index % count) + 1} sur ${count})`}
        >
          <span aria-hidden>
            {(index % count) + 1} / {count}
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
