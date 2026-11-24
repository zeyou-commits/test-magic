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
import { tr } from "@/lib/i18n";

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
    get title() { return tr("ui.homeTour.preparer"); },
    get text() { return tr("ui.homeTour.unGuidePasAPas"); },
    get pill() { return tr("ui.homeTour.rappelVosPapiersAVerifier"); },
    link: { get label() { return tr("ui.homeTour.preparerMesPapiers"); }, to: "/papiers-voyage-algerie" },
    phone: {
      src: "/images/accueil/papiers-mobile.webp",
      height: 1560,
      get alt() { return tr("ui.homeTour.ecranMesPapiersDeBledway"); },
    },
    desktop: 0,
  },
  {
    key: "reserver",
    icon: Ticket,
    get title() { return tr("ui.homeTour.reserver"); },
    get text() { return tr("ui.homeTour.lesDepartsDeToutesLes"); },
    get pill() { return tr("ui.homeTour.alerteVosDatesSontEn"); },
    link: { get label() { return tr("ui.homeTour.voirLesDeparts"); }, to: "/horaires" },
    phone: {
      src: "/images/espace-compagnie/horaires.webp",
      height: 1560,
      get alt() { return tr("ui.homeTour.listeDesDepartsDesFerries"); },
    },
    desktop: 1,
  },
  {
    key: "suivre",
    icon: MapIcon,
    get title() { return tr("ui.homeTour.suivre"); },
    get text() { return tr("ui.homeTour.laCarteDesNaviresEt"); },
    get pill() { return tr("ui.homeTour.votreNavireEstEnMer"); },
    link: { get label() { return tr("ui.homeTour.naviresEnDirect"); }, to: "/bateaux" },
    phone: {
      src: "/images/espace-compagnie/suivre.webp",
      height: 1560,
      get alt() { return tr("ui.homeTour.carteBledwayDesNaviresEn"); },
    },
    desktop: 2,
  },
  {
    key: "echanger",
    icon: MessagesSquare,
    get title() { return tr("ui.homeTour.echanger"); },
    get text() { return tr("ui.homeTour.unSalonParTraverseeDes"); },
    get pill() { return tr("ui.homeTour.nouveauMessageDansLeSalon"); },
    link: { get label() { return tr("ui.homeTour.lesPortsEtLeursSalons"); }, to: "/ports" },
    phone: {
      src: "/images/espace-compagnie/salons.webp",
      height: 1560,
      get alt() { return tr("ui.homeTour.choixDuSalonDeSa"); },
    },
    desktop: 2,
  },
  {
    key: "arriver",
    icon: Flag,
    get title() { return tr("ui.homeTour.arriver"); },
    get text() { return tr("ui.homeTour.desDossiersPratiquesPourLa"); },
    get pill() { return tr("ui.homeTour.dossierPratiqueLaSortieDu"); },
    link: { get label() { return tr("ui.homeTour.arriveeEtFormalites"); }, to: "/guide/arrivee-algerie-port-formalites" },
    phone: {
      src: "/images/accueil/arriver-mobile.webp",
      height: 1100,
      get alt() { return tr("ui.homeTour.dossierPratiqueArriverEnAlgerie"); },
    },
    desktop: 3,
  },
];

const DESKTOP = [
  { src: "/images/accueil/papiers.webp", get alt() { return tr("ui.homeTour.parcoursMesPapiersSurOrdinateur"); } },
  { src: "/images/accueil/reserver.webp", get alt() { return tr("ui.homeTour.rechercheDeTraverseesSurOrdinateur"); } },
  { src: "/images/accueil/traverser.webp", get alt() { return tr("ui.homeTour.carteEnDirectDesNavires"); } },
  { src: "/images/accueil/arriver.webp", get alt() { return tr("ui.homeTour.dossierPratiqueSurOrdinateur"); } },
];

/** Durée d'affichage de chaque écran. */
const SLIDE_MS = 5000;

/**
 * « Des papiers au débarquement » : les écrans de BledWay défilent dans un ordinateur et un téléphone.
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
          <p className="bw-eyebrow">{tr("ui.homeTour.apresLaReservation")}</p>
          <h2 id="tour-title">
            {tr("ui.homeTour.desPapiersAuDebarquement")}<em>{tr("ui.homeTour.toutSeSuitIci")}</em>
          </h2>
        </div>
        <button
          type="button"
          className="bw-tour__pause"
          onClick={() => setStopped((value) => !value)}
          aria-label={stopped ? tr("ui.homeTour.reprendreLeDefilement") : tr("ui.homeTour.mettreLeDefilementEnPause")}
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
          aria-label={tr("ui.homeTour.lesEcransDeBledway")}
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
                <span>{tr("ui.homeTour.bledwayCom")}</span>
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
      <p className="bw-tour__note">{tr("ui.homeTour.capturesReellesDeLApplication")}</p>
    </section>
  );
}
