import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Clock3,
  Megaphone,
  MessagesSquare,
  Navigation,
  Receipt,
  Ship,
  Waves,
} from "lucide-react";
import type { Company, Port, RouteLine } from "@/lib/ferry/types";
import { newsDay, newsFeedQuery, newsSlug } from "@/lib/ferry/newsFeed";
import { TICKETING } from "@/lib/seo/pitch";
import { HomeTour } from "./HomeTour";

const COMMUNITY = [
  {
    icon: Megaphone,
    title: "Vous signalez",
    text: "File au port, retard, navire changé, contrôle : un signalement en quelques gestes, visible sur la carte.",
  },
  {
    icon: MessagesSquare,
    title: "Vous échangez",
    text: "Chaque traversée et chaque port a son salon. On y pose ses questions à ceux qui sont déjà sur place.",
  },
  {
    icon: Ship,
    title: "Vous confirmez",
    text: "« À bord ? » : les passagers confirment le départ réel. La carte devient plus juste pour tout le monde.",
  },
];

const TRUST = [
  {
    icon: Clock3,
    title: "Les horaires",
    text: "Ceux publiés par les compagnies. Au-delà des ventes ouvertes, la rotation habituelle des navires est marquée « Estimé ».",
  },
  {
    icon: Navigation,
    title: "Les positions",
    text: "« Position réelle » si le signal du navire a moins de 30 minutes. Sinon, une estimation d'après l'horaire, annoncée comme telle.",
  },
  {
    icon: Receipt,
    title: "Les prix",
    text: `Des repères de budget, pas des offres. ${TICKETING.short}`,
  },
];

/**
 * Sous le module de réservation (ordinateur) : ce que BledWay apporte, moment par moment.
 * Les chiffres sont calculés depuis la base ; les écrans sont de vraies captures de l'application.
 */
export function HomeServices({
  ports,
  routes,
  companies,
  onBook,
}: {
  ports: Port[];
  routes: RouteLine[];
  companies: Company[];
  onBook: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { data: news = [] } = useQuery(newsFeedQuery);

  useEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }),
      { threshold: 0.08 },
    );
    root.current.querySelectorAll("[data-reveal]").forEach((element) => {
      element.classList.add("will-reveal");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  const activeRoutes = routes.filter((route) => route.status === "active");
  const servedPorts = new Set(
    activeRoutes.flatMap((route) => [route.departure_port_id, route.arrival_port_id]),
  );
  const servedCompanies = new Set(
    activeRoutes.flatMap((route) => route.company_ids ?? []),
  );
  const stats = [
    { value: activeRoutes.length, label: "lignes suivies" },
    { value: ports.filter((port) => servedPorts.has(port.id)).length, label: "ports reliés" },
    {
      value: servedCompanies.size || companies.length,
      label: "compagnies comparées",
    },
  ].filter((stat) => stat.value > 0);
  const latest = news.slice(0, 3);

  return (
    <div ref={root} className="bw-services" aria-label="Les services de BledWay">
      <section className="bw-container bw-services-hero" data-reveal aria-labelledby="services-title">
        <div>
          <p className="bw-eyebrow">BledWay, du premier projet au retour</p>
          <h2 id="services-title">
            Tout le voyage vers le bled, <em>au même endroit.</em>
          </h2>
          <p>
            Préparer les papiers et le budget, comparer les traversées, suivre le navire, passer le
            port : BledWay vous accompagne à chaque étape. Indépendant et gratuit.
          </p>
          <div className="bw-services-actions">
            <button type="button" className="bw-primary-link" onClick={onBook}>
              Chercher une traversée
              <span>
                <ArrowUpRight size={19} aria-hidden />
              </span>
            </button>
            <Link to="/preparer-mon-voyage" className="bw-text-link">
              Préparer mon voyage
              <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
        {stats.length ? (
          <dl className="bw-services-stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value.toLocaleString("fr-FR")}</dd>
              </div>
            ))}
            <div>
              <dt>pour chercher et comparer</dt>
              <dd>Gratuit</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <HomeTour />

      <section className="bw-services-community" data-reveal aria-labelledby="community-title">
        <div className="bw-container">
          <div className="bw-section-heading">
            <div>
              <p className="bw-eyebrow">La communauté</p>
              <h2 id="community-title">
                Ceux qui sont au port renseignent <em>ceux qui arrivent.</em>
              </h2>
            </div>
          </div>
          <ol className="bw-community-steps">
            {COMMUNITY.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <span className="bw-community-steps__icon">
                  <Icon size={22} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="bw-community-steps__num">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bw-container bw-services-trust" data-reveal aria-labelledby="trust-title">
        <div>
          <p className="bw-eyebrow">D'où viennent les informations</p>
          <h2 id="trust-title">Ce que BledWay sait, et ce qu'il estime.</h2>
          <p>
            Chaque information porte sa source et sa fraîcheur. Quand une donnée est estimée,
            c'est écrit, au même endroit que la donnée.
          </p>
        </div>
        <ul>
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon size={20} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>{title}</strong>
                {text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {latest.length ? (
        <section className="bw-container bw-services-news" data-reveal aria-labelledby="news-title">
          <div className="bw-section-heading">
            <div>
              <p className="bw-eyebrow">Les actualités</p>
              <h2 id="news-title">Ce qui bouge sur les lignes.</h2>
            </div>
            <Link to="/actualites" className="bw-text-link">
              Toutes les actualités
              <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
          <div className="bw-services-news__grid">
            {latest.map((item) => (
              <Link key={item.id} to="/actualites/$slug" params={{ slug: newsSlug(item) }}>
                <span className="bw-services-news__day">{newsDay(item.starts_at)}</span>
                <h3>{item.title}</h3>
                {item.summary ? <p>{item.summary}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bw-container bw-services-final" data-reveal aria-label="Commencer">
        <Waves size={26} strokeWidth={1.6} aria-hidden />
        <p>Le prochain chapitre commence par une date et un port.</p>
        <button type="button" className="bw-primary-link" onClick={onBook}>
          Chercher une traversée
          <span>
            <ArrowUpRight size={19} aria-hidden />
          </span>
        </button>
        <Link to="/decouvrir" className="bw-text-link">
          Découvrir BledWay en détail
          <ArrowUpRight size={18} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
