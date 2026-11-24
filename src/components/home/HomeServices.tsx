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
import { tr, intlLocale } from "@/lib/i18n";
import { lazyConst } from "@/lib/i18n/translate";

const COMMUNITY = [
  {
    icon: Megaphone,
    get title() { return tr("ui.homeServices.vousSignalez"); },
    get text() { return tr("ui.homeServices.fileAuPortRetardNavire"); },
  },
  {
    icon: MessagesSquare,
    get title() { return tr("ui.homeServices.vousEchangez"); },
    get text() { return tr("ui.homeServices.chaqueTraverseeEtChaquePort"); },
  },
  {
    icon: Ship,
    get title() { return tr("ui.homeServices.vousConfirmez"); },
    get text() { return tr("ui.homeServices.aBordLesPassagersConfirment"); },
  },
];

const TRUST = lazyConst(() => ([
  {
    icon: Clock3,
    get title() { return tr("ui.homeServices.lesHoraires"); },
    get text() { return tr("ui.homeServices.ceuxPubliesParLesCompagnies"); },
  },
  {
    icon: Navigation,
    get title() { return tr("ui.homeServices.lesPositions"); },
    get text() { return tr("ui.homeServices.positionReelleSiLeSignal"); },
  },
  {
    icon: Receipt,
    get title() { return tr("ui.homeServices.lesPrix"); },
    text: tr("ui.homeServices.desReperesDeBudgetPas", { short: TICKETING.short }),
  },
]));

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
    { value: activeRoutes.length, label: tr("ui.homeServices.lignesSuivies") },
    { value: ports.filter((port) => servedPorts.has(port.id)).length, label: tr("ui.homeServices.portsRelies") },
    {
      value: servedCompanies.size || companies.length,
      label: tr("ui.homeServices.compagniesComparees"),
    },
  ].filter((stat) => stat.value > 0);
  const latest = news.slice(0, 3);

  return (
    <div ref={root} className="bw-services" aria-label={tr("ui.homeServices.lesServicesDeBledway")}>
      {/* Juste sous la carte : les écrans du site, puis le récit « Tout le voyage ». */}
      <HomeTour />

      <section className="bw-container bw-services-hero" data-reveal aria-labelledby="services-title">
        <div>
          <p className="bw-eyebrow">{tr("ui.homeServices.bledwayDuPremierProjetAu")}</p>
          <h2 id="services-title">
            {tr("ui.homeServices.toutLeVoyageVersLe")}<em>{tr("ui.homeServices.auMemeEndroit")}</em>
          </h2>
          <p>
            {tr("ui.homeServices.preparerLesPapiersEtLe")}
          </p>
          <div className="bw-services-actions">
            <button type="button" className="bw-primary-link" onClick={onBook}>
              {tr("ui.homeServices.chercherUneTraversee")}
              <span>
                <ArrowUpRight size={19} aria-hidden />
              </span>
            </button>
            <Link to="/preparer-mon-voyage" className="bw-text-link">
              {tr("ui.homeServices.preparerMonVoyage")}
              <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
        {stats.length ? (
          <dl className="bw-services-stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value.toLocaleString(intlLocale())}</dd>
              </div>
            ))}
            <div>
              <dt>{tr("ui.homeServices.pourChercherEtComparer")}</dt>
              <dd>{tr("ui.homeServices.gratuit")}</dd>
            </div>
          </dl>
        ) : null}
      </section>


      <section className="bw-services-community" data-reveal aria-labelledby="community-title">
        <div className="bw-container">
          <div className="bw-section-heading">
            <div>
              <p className="bw-eyebrow">{tr("ui.homeServices.laCommunaute")}</p>
              <h2 id="community-title">
                {tr("ui.homeServices.ceuxQuiSontAuPort")}<em>{tr("ui.homeServices.ceuxQuiArrivent")}</em>
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
          <p className="bw-eyebrow">{tr("ui.homeServices.dOuViennentLesInformations")}</p>
          <h2 id="trust-title">{tr("ui.homeServices.ceQueBledwaySaitEt")}</h2>
          <p>
            {tr("ui.homeServices.chaqueInformationPorteSaSource")}
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
              <p className="bw-eyebrow">{tr("ui.homeServices.lesActualites")}</p>
              <h2 id="news-title">{tr("ui.homeServices.ceQuiBougeSurLes")}</h2>
            </div>
            <Link to="/actualites" className="bw-text-link">
              {tr("ui.homeServices.toutesLesActualites")}
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

      <section className="bw-container bw-services-final" data-reveal aria-label={tr("ui.homeServices.commencer")}>
        <Waves size={26} strokeWidth={1.6} aria-hidden />
        <p>{tr("ui.homeServices.leProchainChapitreCommencePar")}</p>
        <button type="button" className="bw-primary-link" onClick={onBook}>
          {tr("ui.homeServices.chercherUneTraversee")}
          <span>
            <ArrowUpRight size={19} aria-hidden />
          </span>
        </button>
        <Link to="/decouvrir" className="bw-text-link">
          {tr("ui.homeServices.decouvrirBledwayEnDetail")}
          <ArrowUpRight size={18} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
