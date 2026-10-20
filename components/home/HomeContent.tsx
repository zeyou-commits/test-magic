import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
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

const questions = [
  [
    "Est-ce que je réserve mon billet sur BledWay ?",
    "BledWay vous aide à explorer les lignes et les départs connus. Les liens d’offres vous dirigent vers la compagnie ou le distributeur indiqué. La réservation et le paiement se font sur leur site.",
  ],
  [
    "Les positions des bateaux sont-elles en temps réel ?",
    "Cela dépend des données disponibles. Une position AIS est accompagnée de sa fraîcheur ; une position estimée est calculée à partir des horaires. Consultez la fiche du bateau pour connaître la source et la dernière mise à jour.",
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
      <div className="bw-scroll-invitation">
        <span>La traversée n’est que le début.</span>
        <a href="#le-voyage">
          Préparons la suite <ArrowDown size={16} />
        </a>
      </div>
      <section
        className="bw-intro bw-container"
        id="le-voyage"
        aria-labelledby="journey-title"
        data-reveal
      >
        <div>
          <p className="bw-eyebrow">D’une rive à l’autre</p>
          <h2 id="journey-title">
            Le voyage commence
            <br />
            bien avant <em>le départ.</em>
          </h2>
        </div>
        <div className="bw-intro-copy">
          <p>
            La voiture chargée, les retrouvailles en tête, la mer devant soi. BledWay rassemble les
            repères utiles pour préparer votre traversée vers l’Algérie — et votre retour.
          </p>
          <div className="bw-inline-note">
            <ShieldCheck size={20} />
            <span>Un guide indépendant. Des informations expliquées.</span>
          </div>
        </div>
      </section>
      <section className="bw-container bw-route-section" aria-labelledby="routes-title" data-reveal>
        <div className="bw-section-heading">
          <div>
            <p className="bw-eyebrow">Un trait d’union sur la Méditerranée</p>
            <h2 id="routes-title">À chaque voyage, sa traversée.</h2>
          </div>
          <Link to="/lignes" className="bw-text-link">
            Toutes les lignes <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="bw-route-layout">
          <div className="bw-coast-art">
            <JourneyArtwork />
            <span className="bw-art-caption">
              <MapPin size={16} /> L’autre rive vous attend.
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
                    Découvrir la ligne
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
                <h3>Deux rives, de nombreuses possibilités.</h3>
                <p>Explorez les ports et les lignes pour trouver votre point de départ.</p>
                <Link to="/lignes" className="bw-text-link">
                  Explorer les lignes <ArrowRight size={18} />
                </Link>
              </div>
            )}
            <p className="bw-route-note">
              Les départs et les compagnies varient selon la ligne et la saison.
            </p>
          </div>
        </div>
      </section>
      <section className="bw-vessel-section" aria-labelledby="vessels-title" data-reveal>
        <div className="bw-container bw-vessel-grid">
          <div className="bw-vessel-copy">
            <p className="bw-eyebrow">Rencontrez votre bateau</p>
            <h2 id="vessels-title">
              Il fait déjà
              <br />
              partie du voyage.
            </h2>
            <p>
              Un nom sur le billet, une silhouette à l’horizon. Découvrez les navires, leurs
              services et les informations de position disponibles.
            </p>
            <Link to="/bateaux" className="bw-primary-link">
              Découvrir les bateaux{" "}
              <span>
                <ArrowUpRight size={19} />
              </span>
            </Link>
            <span className="bw-data-note">
              <Ship size={16} /> Source et fraîcheur précisées dans les fiches.
            </span>
          </div>
          <div className="bw-vessel-art">
            <JourneyArtwork variant="ferry" />
            <span className="bw-art-stamp">
              CAP SUR
              <br />
              <strong>LE BLED</strong>
              <span>ET LE RETOUR.</span>
            </span>
            <span className="bw-illustration-label">Illustration BledWay · navire générique</span>
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
            <p className="bw-eyebrow">Moins de questions, plus de sérénité</p>
            <h2 id="guides-title">On prépare les bagages ?</h2>
          </div>
          <Link to="/guide" className="bw-text-link">
            Tous les guides <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="bw-guide-grid">
          <Link to="/voyage-algerie" className="bw-guide-feature">
            <JourneyArtwork variant="luggage" />
            <div>
              <span className="bw-eyebrow">Le carnet de voyage</span>
              <h3>
                Les bons repères.
                <br />
                Avant de prendre la mer.
              </h3>
              <p>Billet, embarquement, cabine : préparez votre traversée étape par étape.</p>
              <span className="bw-text-link">
                Préparer mon départ <ArrowUpRight size={18} />
              </span>
            </div>
          </Link>
          <div className="bw-guide-side">
            <Link to="/vehicules-moins-3-ans" className="bw-guide-small">
              <span className="bw-guide-icon">
                <Compass size={26} strokeWidth={1.6} />
              </span>
              <span className="bw-eyebrow">La voiture aussi fait le voyage</span>
              <h3>Un projet d’importation ?</h3>
              <p>
                Âge du véhicule, documents et budget : les points à vérifier avant de vous lancer.
              </p>
              <span className="bw-text-link">
                Comprendre les démarches <ArrowUpRight size={18} />
              </span>
            </Link>
            <Link to="/simulateurs" className="bw-guide-small bw-guide-tools">
              <span className="bw-eyebrow">Vos chiffres, votre voyage</span>
              <h3>Un budget plus clair.</h3>
              <p>Comparez vos options avec des calculs dont les hypothèses restent visibles.</p>
              <span className="bw-text-link">
                Ouvrir les simulateurs <ArrowUpRight size={18} />
              </span>
            </Link>
          </div>
        </div>
      </section>
      <section className="bw-container bw-faq" aria-labelledby="faq-title" data-reveal>
        <div>
          <p className="bw-eyebrow">Avant de larguer les amarres</p>
          <h2 id="faq-title">On vous répond.</h2>
          <p>
            Encore une question ?<br />
            <Link to="/contact" className="bw-text-link">
              Écrivez-nous <ArrowUpRight size={17} />
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
        <p>Le prochain chapitre commence sur l’autre rive.</p>
        <a href="#carte" className="bw-text-link">
          Retour à la carte <ArrowUpRight size={18} />
        </a>
      </div>
    </div>
  );
}
