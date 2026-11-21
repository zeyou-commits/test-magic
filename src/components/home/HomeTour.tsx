import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ClipboardList,
  Flag,
  Map as MapIcon,
  MessagesSquare,
  Pause,
  Play,
  Ticket,
  type LucideIcon,
} from "lucide-react";

type Screen = {
  key: string;
  icon: LucideIcon;
  title: string;
  text: string;
  pill: string;
  link: { label: string; to: string };
  phone: { src: string; height: number; alt: string };
  /** Index dans DESKTOP : l'écran ordinateur montré en même temps. */
  desktop: number;
};

/** Vraies captures de l'appli : téléphone (public/images/espace-compagnie) et ordinateur (public/images/accueil). */
const SCREENS: Screen[] = [
  {
    key: "preparer",
    icon: ClipboardList,
    title: "Préparer",
    text: "Un guide pas à pas : papiers voyageur par voyageur, calendrier à rebours, budget et rappels.",
    pill: "Rappel : vos papiers à vérifier",
    link: { label: "Préparer mon voyage", to: "/preparer-mon-voyage" },
    phone: {
      src: "/images/espace-compagnie/preparer.webp",
      height: 1560,
      alt: "Écran « Préparer mon voyage » de BledWay sur téléphone",
    },
    desktop: 0,
  },
  {
    key: "reserver",
    icon: Ticket,
    title: "Réserver",
    text: "Les départs de toutes les compagnies au même endroit, puis la réservation chez la compagnie ou le distributeur indiqué.",
    pill: "Alerte : vos dates sont en vente",
    link: { label: "Voir les départs", to: "/horaires" },
    phone: {
      src: "/images/espace-compagnie/horaires.webp",
      height: 1560,
      alt: "Liste des départs des ferries sur BledWay, sur téléphone",
    },
    desktop: 1,
  },
  {
    key: "suivre",
    icon: MapIcon,
    title: "Suivre",
    text: "La carte des navires et des ports, les changements d'horaire et les alertes sur la traversée suivie.",
    pill: "Votre navire est en mer",
    link: { label: "Navires en direct", to: "/bateaux" },
    phone: {
      src: "/images/espace-compagnie/suivre.webp",
      height: 1560,
      alt: "Carte BledWay des navires en Méditerranée, sur téléphone",
    },
    desktop: 2,
  },
  {
    key: "echanger",
    icon: MessagesSquare,
    title: "Échanger",
    text: "Un salon par traversée, des signalements faits sur place et des avis sur les navires.",
    pill: "Nouveau message dans le salon",
    link: { label: "Les ports et leurs salons", to: "/ports" },
    phone: {
      src: "/images/espace-compagnie/salons.webp",
      height: 1560,
      alt: "Choix du salon de sa traversée sur BledWay, sur téléphone",
    },
    desktop: 2,
  },
  {
    key: "arriver",
    icon: Flag,
    title: "Arriver",
    text: "Des dossiers pratiques pour la sortie du port, les papiers du véhicule et la suite du trajet.",
    pill: "Dossier pratique : la sortie du port",
    link: { label: "Arrivée et formalités", to: "/guide/arrivee-algerie-port-formalites" },
    phone: {
      src: "/images/accueil/arriver-mobile.webp",
      height: 1100,
      alt: "Dossier pratique « Arriver en Algérie en ferry » sur téléphone",
    },
    desktop: 3,
  },
];

const DESKTOP = [
  { src: "/images/accueil/preparer.webp", alt: "Préparer mon voyage sur ordinateur" },
  { src: "/images/accueil/reserver.webp", alt: "Recherche de traversées sur ordinateur" },
  { src: "/images/accueil/traverser.webp", alt: "Carte en direct des navires sur ordinateur" },
  { src: "/images/accueil/arriver.webp", alt: "Dossier pratique sur ordinateur" },
];

/** Durée d'affichage de chaque écran. */
const SLIDE_MS = 5000;

/**
 * « Voyez ce qui vous attend » : les écrans de BledWay défilent dans un ordinateur et un téléphone.
 * La barre de progression pilote le défilement : elle ne tourne que si la section est à l'écran,
 * s'arrête au survol, au clavier et avec le bouton pause, et reste immobile si le système
 * demande moins d'animations.
 */
export function HomeTour() {
  const root = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const paused = !visible || hovered || stopped;
  const current = SCREENS[active]!;

  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Téléphone : la liste glisse de côté pour garder l'écran actif visible, sans bouger la page.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const item = list.children[active] as HTMLElement | undefined;
    if (!item) return;
    const left =
      list.scrollLeft + item.getBoundingClientRect().left - list.getBoundingClientRect().left - 20;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  const next = () => setActive((index) => (index + 1) % SCREENS.length);

  return (
    <section ref={root} className="bw-container bw-tour" data-reveal aria-labelledby="tour-title">
      <div className="bw-section-heading">
        <div>
          <p className="bw-eyebrow">BledWay en vrai</p>
          <h2 id="tour-title">
            Voyez ce qui vous attend, <em>écran par écran.</em>
          </h2>
        </div>
        <button
          type="button"
          className="bw-tour__pause"
          onClick={() => setStopped((value) => !value)}
          aria-label={stopped ? "Reprendre le défilement" : "Mettre le défilement en pause"}
        >
          {stopped ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
        </button>
      </div>

      <div
        className="bw-tour__body"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <div
          ref={listRef}
          className="bw-tour__list"
          role="tablist"
          aria-label="Les écrans de BledWay"
        >
          {SCREENS.map((screen, index) => {
            const selected = index === active;
            const Icon = screen.icon;
            return (
              <div key={screen.key} className="bw-tour__item" data-active={selected || undefined}>
                <button
                  type="button"
                  role="tab"
                  id={`tour-tab-${screen.key}`}
                  aria-selected={selected}
                  aria-controls="tour-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ArrowDown" &&
                      event.key !== "ArrowUp" &&
                      event.key !== "ArrowRight" &&
                      event.key !== "ArrowLeft"
                    )
                      return;
                    event.preventDefault();
                    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
                    const target = (index + (forward ? 1 : SCREENS.length - 1)) % SCREENS.length;
                    setActive(target);
                    document.getElementById(`tour-tab-${SCREENS[target]!.key}`)?.focus();
                  }}
                >
                  <span className="bw-tour__icon" aria-hidden>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  {screen.title}
                </button>
                {selected ? (
                  <div className="bw-tour__detail">
                    <p>{screen.text}</p>
                    <Link to={screen.link.to as never} className="bw-text-link">
                      {screen.link.label}
                      <ArrowUpRight size={16} aria-hidden />
                    </Link>
                  </div>
                ) : null}
                <span className="bw-tour__bar" aria-hidden>
                  {selected ? (
                    <span
                      key={active}
                      className="bw-tour__fill"
                      style={{
                        animationDuration: `${SLIDE_MS}ms`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                      onAnimationEnd={next}
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className="bw-tour__stage"
          role="tabpanel"
          id="tour-panel"
          aria-labelledby={`tour-tab-${current.key}`}
        >
          <span className="bw-tour__halo" aria-hidden />
          <figure className="bw-tour__laptop">
            <div className="bw-tour__laptop-screen">
              <span className="bw-tour__bar-url" aria-hidden>
                <i />
                <i />
                <i />
                <span>bledway.com</span>
              </span>
              <div className="bw-tour__shots bw-tour__shots--desktop">
                {DESKTOP.map((shot, index) => {
                  const on = index === current.desktop;
                  return (
                    <img
                      key={shot.src}
                      src={shot.src}
                      alt={on ? shot.alt : ""}
                      aria-hidden={on ? undefined : true}
                      width={1200}
                      height={760}
                      loading="lazy"
                      decoding="async"
                      data-on={on || undefined}
                    />
                  );
                })}
              </div>
            </div>
            <span className="bw-tour__laptop-base" aria-hidden />
          </figure>
          <figure className="bw-tour__phone">
            <div className="bw-tour__shots bw-tour__shots--phone">
              {SCREENS.map((screen, index) => {
                const on = index === active;
                return (
                  <img
                    key={screen.key}
                    src={screen.phone.src}
                    alt={on ? screen.phone.alt : ""}
                    aria-hidden={on ? undefined : true}
                    width={780}
                    height={screen.phone.height}
                    loading="lazy"
                    decoding="async"
                    data-on={on || undefined}
                    data-short={screen.phone.height < 1560 || undefined}
                  />
                );
              })}
              <span className="bw-tour__island" aria-hidden />
            </div>
          </figure>
          {/* Téléphone : le texte de l'écran actif sous la capture. */}
          <div key={`${current.key}-caption`} className="bw-tour__caption">
            <p>{current.text}</p>
            <Link to={current.link.to as never} className="bw-text-link">
              {current.link.label}
              <ArrowUpRight size={16} aria-hidden />
            </Link>
          </div>
          <p key={current.key} className="bw-tour__pill" aria-hidden>
            <span />
            {current.pill}
          </p>
        </div>
      </div>
      <p className="bw-tour__note">Captures réelles de l'application BledWay.</p>
    </section>
  );
}
