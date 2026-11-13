import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  Compass,
  MapPin,
  Ship,
  BookOpen,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { Port, RouteLine } from "@/lib/ferry/types";
import { JourneyArtwork } from "./JourneyArtwork";
import { FaqSchema } from "@/components/editorial/Editorial";
import { tr } from "@/lib/i18n";

const questions = [
  [
    "Comment réserver ma traversée ?",
    "Cliquez sur « Réserver » : choisissez votre ligne, vos dates et votre véhicule, BledWay affiche les départs connus et vous dirige vers la compagnie ou le distributeur indiqué. La réservation et le paiement se font sur leur site.",
  ],
  [
    "Les positions des navires sont-elles en temps réel ?",
    "Pas toujours, et BledWay l’indique à chaque fois. « Position réelle » : le signal du navire a été reçu il y a moins de 30 minutes. « Estimation » : le signal n’est pas capté, souvent en pleine mer ou près des côtes algériennes, et l’avancement est calculé d’après l’horaire. Ces repères ne constituent pas un suivi GPS de navigation.",
  ],
  [
    "Puis-je voyager avec ma voiture ?",
    "Les conditions varient selon la compagnie, le navire et le véhicule. Renseignez votre véhicule dans la recherche, puis vérifiez ses dimensions, les documents et les conditions auprès de la compagnie.",
  ],
  [
    "À quoi correspondent les prix affichés ?",
    "Les montants estimés sont des repères de budget, pas des offres disponibles. Le prix final et les prestations incluses doivent être vérifiés sur le site de réservation.",
  ],
];

export function HomeContent({
  ports,
  routes,
  onExplore,
}: {
  ports: Port[];
  routes: RouteLine[];
  onExplore: (route: RouteLine) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    root.current.querySelectorAll("[data-reveal]").forEach((element) => {
      element.classList.add("will-reveal");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  const pairs = [
    ["Marseille", "Alger"],
    ["Alicante", "Oran"],
    ["Sète", "Béjaïa"],
  ];
  const featured = pairs.flatMap(([from, to]) => {
    const departure = ports.find((p) => p.name === from);
    const arrival = ports.find((p) => p.name === to);
    const route = routes.find(
      (r) =>
        r.status === "active" &&
        r.departure_port_id === departure?.id &&
        r.arrival_port_id === arrival?.id,
    );
    return route && departure && arrival ? [{ route, departure, arrival }] : [];
  });
  return (
    <div ref={root} className="bw-home-content" id="preparer">
      <section
        className="bw-intro bw-container"
        id="le-voyage"
        aria-labelledby="journey-title"
        data-reveal
      >
        <div className="bw-intro-copy">
          <p className="bw-eyebrow">{tr("ui.homeContent.dUneRiveAL")}</p>
          <h2 id="journey-title">
            {tr("ui.homeContent.leVoyageCommence")}
            <br />
            {tr("ui.homeContent.bienAvant")}<em>{tr("ui.homeContent.leDepart")}</em>
          </h2>
          <p>
            {tr("ui.homeContent.laVoitureChargeeLesRetrouvailles")}
          </p>
          <div className="bw-inline-note">
            <ShieldCheck size={20} />
            <span>{tr("ui.homeContent.unGuideIndependantDesInformations")}</span>
          </div>
        </div>
        <figure className="bw-intro-art">
          <img
            src="/images/bledway-horizon-algerien.webp"
            alt={tr("ui.homeContent.illustrationDeDunesDUn")}
            loading="lazy"
            decoding="async"
            width={1536}
            height={1024}
          />
          <figcaption>{tr("ui.homeContent.laTraverseeNEstQue")}</figcaption>
        </figure>
      </section>
      <section className="bw-container bw-route-section" aria-labelledby="routes-title" data-reveal>
        <div className="bw-section-heading">
          <div>
            <p className="bw-eyebrow">{tr("ui.homeContent.unTraitDUnionSur")}</p>
            <h2 id="routes-title">{tr("ui.homeContent.aChaqueVoyageSaTraversee")}</h2>
          </div>
          <Link to="/lignes" className="bw-text-link">
            {tr("ui.homeContent.toutesLesLignes")}<ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="bw-route-layout">
          <div className="bw-coast-art">
            <JourneyArtwork />
            <span className="bw-art-caption">
              <MapPin size={16} />{tr("ui.homeContent.lAutreRiveVousAttend")}
            </span>
          </div>
          <div className="bw-route-list">
            {featured.map(({ route, departure, arrival }, index) => (
              <article key={route.id} className="bw-route-row">
                <span className="bw-route-number">0{index + 1}</span>
                <div>
                  <span className="bw-route-country">
                    {departure.country_name} → {arrival.country_name}
                  </span>
                  <h3>
                    {departure.name} <ArrowRight size={19} /> {arrival.name}
                  </h3>
                  <Link
                    to="/lignes/$slug"
                    params={{ slug: route.slug }}
                    className="bw-route-detail"
                  >
                    {tr("ui.homeContent.decouvrirLaLigne")}
                  </Link>
                </div>
                <button
                  className="bw-icon-button"
                  type="button"
                  aria-label={`Explorer ${departure.name} vers ${arrival.name} sur la carte`}
                  onClick={() => onExplore(route)}
                >
                  <ArrowUpRight size={22} />
                </button>
              </article>
            ))}
            {!featured.length && (
              <div className="bw-route-empty">
                <Compass size={30} />
                <h3>{tr("ui.homeContent.deuxRivesDeNombreusesPossibilites")}</h3>
                <p>{tr("ui.homeContent.explorezLesPortsEtLes")}</p>
                <Link to="/lignes" className="bw-text-link">
                  {tr("ui.homeContent.explorerLesLignes")}<ArrowRight size={18} />
                </Link>
              </div>
            )}
            <p className="bw-route-note">
              {tr("ui.homeContent.lesDepartsEtLesCompagnies")}
            </p>
          </div>
        </div>
      </section>
      <section className="bw-vessel-section" aria-labelledby="vessels-title" data-reveal>
        <div className="bw-container bw-vessel-grid">
          <div className="bw-vessel-copy">
            <p className="bw-eyebrow">{tr("ui.homeContent.rencontrezVotreNavire")}</p>
            <h2 id="vessels-title">
              {tr("ui.homeContent.ilFaitDeja")}
              <br />
              {tr("ui.homeContent.partieDuVoyage")}
            </h2>
            <p>
              {tr("ui.homeContent.unNomSurLeBillet")}
            </p>
            <Link to="/bateaux" className="bw-primary-link">
              {tr("ui.homeContent.decouvrirLesNavires")}{" "}
              <span>
                <ArrowUpRight size={19} />
              </span>
            </Link>
            <span className="bw-data-note">
              <Ship size={16} />{tr("ui.homeContent.sourceEtFraicheurPreciseesDans")}
            </span>
          </div>
          <div className="bw-vessel-art">
            <JourneyArtwork variant="ferry" />
            <span className="bw-art-stamp">
              {tr("ui.homeContent.capSur")}
              <br />
              <strong>{tr("ui.homeContent.leBled")}</strong>
              <span>{tr("ui.homeContent.etLeRetour")}</span>
            </span>
            <span className="bw-illustration-label">{tr("ui.homeContent.illustrationBledwayNavireGenerique")}</span>
          </div>
        </div>
      </section>
      <section
        className="bw-container bw-guides-section"
        aria-labelledby="guides-title"
        data-reveal
      >
        <div className="bw-section-heading">
          <div>
            <p className="bw-eyebrow">{tr("ui.homeContent.moinsDeQuestionsPlusDe")}</p>
            <h2 id="guides-title">{tr("ui.homeContent.onPrepareLesBagages")}</h2>
          </div>
          <Link to="/guide" className="bw-text-link">
            {tr("ui.homeContent.tousLesGuides")}<ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="bw-guide-grid">
          <Link to="/voyage-algerie" className="bw-guide-feature">
            <JourneyArtwork variant="luggage" />
            <div>
              <span className="bw-eyebrow">{tr("ui.homeContent.leCarnetDeVoyage")}</span>
              <h3>
                {tr("ui.homeContent.lesBonsReperes")}
                <br />
                {tr("ui.homeContent.avantDePrendreLaMer")}
              </h3>
              <p>{tr("ui.homeContent.billetEmbarquementCabinePreparezVotre")}</p>
              <span className="bw-text-link">
                {tr("ui.homeContent.preparerMonDepart")}<ArrowUpRight size={18} />
              </span>
            </div>
          </Link>
          <div className="bw-guide-side">
            <Link to="/vehicules-moins-3-ans" className="bw-guide-small">
              <span className="bw-guide-icon">
                <Compass size={26} strokeWidth={1.6} />
              </span>
              <span className="bw-eyebrow">{tr("ui.homeContent.laVoitureAussiFaitLe")}</span>
              <h3>{tr("ui.homeContent.unProjetDImportation")}</h3>
              <p>
                {tr("ui.homeContent.ageDuVehiculeDocumentsEt")}
              </p>
              <span className="bw-text-link">
                {tr("ui.homeContent.comprendreLesDemarches")}<ArrowUpRight size={18} />
              </span>
            </Link>
            <Link to="/simulateurs" className="bw-guide-small bw-guide-tools">
              <span className="bw-eyebrow">{tr("ui.homeContent.vosChiffresVotreVoyage")}</span>
              <h3>{tr("ui.homeContent.unBudgetPlusClair")}</h3>
              <p>{tr("ui.homeContent.comparezVosOptionsAvecDes")}</p>
              <span className="bw-text-link">
                {tr("ui.homeContent.ouvrirLesSimulateurs")}<ArrowUpRight size={18} />
              </span>
            </Link>
          </div>
        </div>
      </section>
      <section className="bw-container bw-faq" aria-labelledby="faq-title" data-reveal>
        <FaqSchema faq={questions.map(([q, a]) => ({ q: q!, a: a! }))} path="/" />
        <div>
          <p className="bw-eyebrow">{tr("ui.homeContent.avantDeLarguerLesAmarres")}</p>
          <h2 id="faq-title">{tr("ui.homeContent.onVousRepond")}</h2>
          <p>
            {tr("ui.homeContent.encoreUneQuestion")}<br />
            <Link to="/contact" className="bw-text-link">
              {tr("ui.homeContent.ecrivezNous")}<ArrowUpRight size={17} />
            </Link>
            <br />
            <Link to="/questions-frequentes" className="bw-text-link">
              {tr("ui.homeContent.toutesLesReponses")}<ArrowUpRight size={17} />
            </Link>
          </p>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={20} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="bw-container bw-final-invitation" data-reveal>
        <BookOpen size={24} strokeWidth={1.6} />
        <p>{tr("ui.homeContent.leProchainChapitreCommenceSur")}</p>
        <a href="#carte" className="bw-text-link">
          {tr("ui.homeContent.retourALaCarte")}<ArrowUpRight size={18} />
        </a>
      </div>
    </div>
  );
}
