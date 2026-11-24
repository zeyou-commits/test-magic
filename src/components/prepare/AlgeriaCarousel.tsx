import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ALGERIA_PHOTOS, LICENSE_URLS, photoSrc } from "@/content/photosAlgerie";
import { tr } from "@/lib/i18n";

/** Le temps passé sur chaque photo avant la suivante. */
const DELAY = 5200;

/**
 * Les photos d'Algérie qui défilent en tête de « Préparer mon voyage » : un glissé du doigt change
 * de photo, le survol ou le toucher met le défilement en pause. Auteur et licence sur chaque photo.
 */
export function AlgeriaCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resume = useRef<number | undefined>(undefined);
  const count = ALGERIA_PHOTOS.length;

  const go = useCallback(
    (next: number) => {
      const el = track.current;
      if (!el) return;
      const target = (next + count) % count;
      el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
    },
    [count],
  );

  // Défilement automatique, sauf si la personne préfère moins d'animations.
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => go(index + 1), DELAY);
    return () => window.clearTimeout(timer);
  }, [index, paused, go]);
  useEffect(() => () => window.clearTimeout(resume.current), []);

  // Un toucher : pause, puis le défilement reprend un peu après.
  const holdThenResume = () => {
    setPaused(true);
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => setPaused(false), 9000);
  };

  return (
    <section
      className="bw-algeria"
      aria-roledescription="carrousel"
      aria-label={tr("ui.algeriaCarousel.lAlgerieEnPhotos")}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPaused(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setPaused(false);
      }}
      onTouchStart={holdThenResume}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={track}
        className="bw-algeria__track"
        onScroll={(event) => {
          const el = event.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== index) setIndex(next);
        }}
      >
        {ALGERIA_PHOTOS.map((photo, i) => (
          <figure
            key={photo.slug}
            className="bw-algeria__slide"
            data-active={i === index || undefined}
            role="group"
            aria-roledescription="photo"
            aria-label={`${i + 1} sur ${count} : ${photo.title}, ${photo.place}`}
            aria-hidden={i !== index}
          >
            <img
              src={photoSrc(photo, 1280)}
              srcSet={`${photoSrc(photo, 640)} 640w, ${photoSrc(photo, 1280)} 1280w`}
              sizes="(min-width: 768px) 768px, 100vw"
              alt={`${photo.title}, ${photo.place}`}
              width={1280}
              height={853}
              loading={i < 2 ? "eager" : "lazy"}
              decoding="async"
              {...(i === 0 ? { fetchPriority: "high" as const } : {})}
            />
            <figcaption>
              <span className="bw-algeria__place">{photo.place}</span>
              <span className="bw-algeria__title">{photo.title}</span>
            </figcaption>
            <small className="bw-algeria__credit">
              {tr("ui.algeriaCarousel.photo")}{" "}
              <a
                href={photo.source}
                target="_blank"
                rel="noreferrer"
                tabIndex={i === index ? 0 : -1}
              >
                {photo.author}
              </a>{" "}
              ·{" "}
              <a
                href={LICENSE_URLS[photo.license] ?? photo.source}
                target="_blank"
                rel="noreferrer"
                tabIndex={i === index ? 0 : -1}
              >
                {photo.license}
              </a>
            </small>
          </figure>
        ))}
      </div>
      <button
        type="button"
        className="bw-algeria__nav"
        data-side="prev"
        aria-label={tr("ui.algeriaCarousel.photoPrecedente")}
        onClick={() => go(index - 1)}
      >
        <ChevronLeft size={20} aria-hidden />
      </button>
      <button
        type="button"
        className="bw-algeria__nav"
        data-side="next"
        aria-label={tr("ui.algeriaCarousel.photoSuivante")}
        onClick={() => go(index + 1)}
      >
        <ChevronRight size={20} aria-hidden />
      </button>
      <div className="bw-algeria__dots">
        {ALGERIA_PHOTOS.map((photo, i) => (
          <button
            key={photo.slug}
            type="button"
            aria-label={tr("ui.algeriaCarousel.voir", { place: photo.place })}
            aria-current={i === index || undefined}
            data-running={(i === index && !paused) || undefined}
            onClick={() => go(i)}
          >
            {i === index && !paused ? (
              <span style={{ animationDuration: `${DELAY}ms` }} aria-hidden />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
