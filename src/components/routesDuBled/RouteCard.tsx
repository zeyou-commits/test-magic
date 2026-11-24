import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Coffee,
  Wallet,
  House,
  MoonStar,
  Navigation,
  Plus,
  Ship,
  Waypoints,
} from "lucide-react";
import { tr, intlLocale, placeName } from "@/lib/i18n";
import { KIND_COLOR, mapsLink, type BledRoute, type StopFeature } from "@/lib/routesDuBled/data";
import {
  anonyme,
  dureeRonde,
  ecartKm,
  PAUSE_MIN,
  PLACE_NAME,
  reprise,
  type ChainStop,
} from "@/lib/routesDuBled/trajets";
import { heuresEnTout, type Bout, type Chemin, type LonLat } from "@/lib/routesDuBled/porteAPorte";
import { heure, horaires, type Carnet, type Pas } from "@/lib/routesDuBled/carnet";
import { VILLES, nomVille } from "@/lib/routesDuBled/villes";
import { coutRoute, type Reglages } from "@/lib/routesDuBled/budget";
import { CostView } from "./CostView";
import { StopPhotos } from "./StopPhotos";
import { FeatureIcon, KindIcon, Mosque, featureLabel, kindLabel, sourceLabel } from "./StopVisuals";

export const fmt = (n: number) => Math.round(n).toLocaleString(intlLocale());
export const duree = (b: Bout) => (b.mesure ? dureeRonde(b.h) : `≈ ${dureeRonde(b.h)}`);
/** « 12 Rue X, 42000, Saint-Étienne, France » devient « Saint-Étienne ». */
export const courte = (label: string) => {
  const p = label.split(", ").filter((x) => !/^\d{4,5}$/.test(x));
  return p.length >= 3 ? (p[p.length - 2] ?? label) : (p[0] ?? label);
};
export const portDe = (p: string) => (/^[aeiouyéè]/i.test(p) ? `d'${p}` : `de ${p}`);
const routeName = (r: BledRoute) => r.name.replace(/ \(.*\)$/, "");
/** Le nom que les voyageurs donnent à la route qu'ils rejoignent. */
const NOM_ROUTE: Record<string, string> = {
  get E1() { return tr("ui.routeCard.lAutorouteDuSoleil"); },
  get E2() { return tr("ui.routeCard.laLanguedocienne"); },
  get E3() { return tr("ui.routeCard.laRouteDeLaMediterranee"); },
  get E4() { return tr("ui.routeCard.laRouteDAlmeria"); },
  get E5() { return tr("ui.routeCard.laRouteDeBordeauxEt"); },
  get E6() { return tr("ui.routeCard.laRouteDAlicante"); },
  get E7() { return tr("ui.routeCard.laRouteDAlmeriaPar"); },
  get E8() { return tr("ui.routeCard.laRouteDuPortDe"); },
};
/** La ville la plus proche (moins de 40 km), pour nommer une halte que la carte ne nomme pas. */
const villeProche = (s: { lat: number; lon: number }) => {
  let best: string | null = null;
  let d2 = Infinity;
  for (const [n, [lo, la]] of Object.entries(VILLES)) {
    const dx = (lo - s.lon) * Math.cos((la * Math.PI) / 180);
    const dy = la - s.lat;
    const d = dx * dx + dy * dy;
    if (d < d2) {
      d2 = d;
      best = n;
    }
  }
  return best && Math.sqrt(d2) * 111 < 40 ? nomVille(best) : null;
};

export const stopName = (s: ChainStop) => {
  if (!anonyme(s) && !/^hotel [a-z]$/i.test(s.n.trim())) return s.n;
  const ville = villeProche(s);
  if (ville && s.k === "priere") return tr("ui.pageRoutesDuBled.sansNomPrierePres", { ville });
  if (ville && s.k === "dormir") return tr("ui.pageRoutesDuBled.sansNomHotelPres", { ville });
  if (ville && s.k === "aire") return tr("ui.pageRoutesDuBled.sansNomAirePres", { ville });
  if (s.k === "priere") return tr("ui.pageRoutesDuBled.sansNomPriere");
  if (s.k === "dormir") return tr("ui.pageRoutesDuBled.sansNomHotel");
  if (s.k === "aire") return tr("ui.pageRoutesDuBled.sansNomAire");
  return kindLabel(s.k);
};

/** Deux ou trois services qui comptent pour une pause en famille (ou pour dormir), dans cet ordre. */
const PAUSE_UTILE: StopFeature[] = [
  "priere",
  "halal",
  "manger",
  "toilettes",
  "h24",
  "parking_sur",
  "douches",
  "cafe",
];
const NUIT_UTILE: StopFeature[] = ["parking_sur", "parking", "halal", "priere", "h24"];
const usefulFeatures = (s: ChainStop, nuit: boolean) =>
  (nuit ? NUIT_UTILE : PAUSE_UTILE).filter((f) => s.f.includes(f)).slice(0, 3);

/** Une route du bled proposée : le résumé, et le carnet d'étapes quand elle est dépliée. */
export function RouteCard({
  c,
  k,
  from,
  to,
  via,
  variante,
  first,
  open,
  onToggle,
  focusId,
  onFocus,
  onAdd,
  portStop,
  routes,
  showCost,
  onCost,
  depart,
  onDepart,
  reglages,
  onReglages,
  ligne,
}: {
  c: Chemin;
  k: Carnet;
  /** Heure de départ de la maison (elle place les nuits et les heures du carnet). */
  depart: number;
  onDepart: (h: number) => void;
  /** Le prix n'est calculé et montré que sur demande. */
  showCost: boolean;
  onCost: () => void;
  reglages: Reglages;
  onReglages: (r: Reglages) => void;
  /** Page de la ligne (prochains départs), si elle existe. */
  ligne: string | null;
  from: string;
  to: string;
  via: string[];
  variante: string | null;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  focusId: string | null;
  onFocus: (p: Pas) => void;
  onAdd: (routeId: string | undefined, point: LonLat | null) => void;
  portStop: ChainStop | null;
  routes: BledRoute[];
}) {
  const pauses = k.pas.filter((p) => p.k === "pause" || p.k === "priere" || p.k === "vide").length;
  const nuits = k.pas.filter((p) => p.k === "nuit" || p.k === "nuitvide").length;
  const enTout = heuresEnTout(c);
  const mesure = c.eu.approche.mesure && c.dz.dernier.mesure;
  const total: Bout = { km: c.km, h: c.h, mesure };
  const pe = PLACE_NAME[c.eu.port];
  const pd = PLACE_NAME[c.dz.port];
  // Avec une nuit sur la route ou en mer, des heures « porte à porte » sans le sommeil trompent : on compte en jours.
  const jours = k.pas.at(-1)?.jour ?? 1;
  const cout = useMemo(
    () => (showCost ? coutRoute(c, k, reglages) : null),
    [showCost, c, k, reglages],
  );
  return (
    <article className="rdb-rc" data-open={open || undefined}>
      <button type="button" className="rdb-rc__head" aria-expanded={open} onClick={onToggle}>
        {/* Le départ et l'arrivée sont déjà dans les champs : le titre dit ce qui distingue ce chemin, sa traversée. */}
        <span className="rdb-rc__title">
          <b className="rdb-rc__port">
            <Ship className="size-4" aria-hidden />
            {pe} → {pd}
          </b>
          {first ? (
            <span className="rdb-chemin__tag">{tr("ui.pageRoutesDuBled.lePlusCourt")}</span>
          ) : null}
        </span>
        <span className="rdb-rc__via">
          {via.length ? tr("ui.pageRoutesDuBled.parVilles", { villes: via.join(" · ") }) : ""}
          {variante ? (
            <span className="rdb-rc__variante">
              {via.length ? " · " : ""}
              {variante}
            </span>
          ) : null}
        </span>
        <span className="rdb-rc__facts">
          {jours > 1 ? (
            <strong>{tr("ui.pageRoutesDuBled.enJours", { n: jours })}</strong>
          ) : enTout != null ? (
            <strong>
              {tr("ui.pageRoutesDuBled.enTout", {
                duree: duree({ ...total, h: enTout + (pauses * PAUSE_MIN) / 60 }),
              })}
            </strong>
          ) : null}
          {jours > 1 || enTout != null ? " · " : ""}
          {tr("ui.pageRoutesDuBled.deRoute", { duree: duree(total) })}
          {c.mer != null
            ? ` + ${tr("ui.pageRoutesDuBled.deMer", { duree: dureeRonde(c.mer / 60) })}`
            : ""}
          {pauses
            ? ` · ${tr(pauses > 1 ? "ui.pageRoutesDuBled.nPauses" : "ui.pageRoutesDuBled.unePause", { n: pauses })}`
            : ""}
          {nuits
            ? ` · ${tr(nuits > 1 ? "ui.pageRoutesDuBled.nNuits" : "ui.pageRoutesDuBled.uneNuit", { n: nuits })}`
            : ""}
        </span>
        <span className="rdb-rc__toggle">
          {open ? tr("ui.pageRoutesDuBled.replier") : tr("ui.pageRoutesDuBled.voirLesEtapes")}
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </button>
      <div className="rdb-cost">
        {cout ? (
          <CostView
            cout={cout}
            de={pe}
            a={pd}
            ligne={ligne}
            reglages={reglages}
            onReglages={onReglages}
          />
        ) : (
          <button type="button" className="rdb-cost__ask" onClick={onCost}>
            <Wallet className="size-4" aria-hidden />
            {tr("ui.pageRoutesDuBled.combienCaCoute")}
          </button>
        )}
      </div>
      {open ? (
        <CarnetView
          c={c}
          k={k}
          to={to}
          focusId={focusId}
          onFocus={onFocus}
          onAdd={onAdd}
          portStop={portStop}
          routes={routes}
          depart={depart}
          onDepart={onDepart}
        />
      ) : null}
    </article>
  );
}

function CarnetView({
  c,
  k,
  to,
  focusId,
  onFocus,
  onAdd,
  portStop,
  routes,
  depart,
  onDepart,
}: {
  c: Chemin;
  k: Carnet;
  to: string;
  depart: number;
  onDepart: (h: number) => void;
  focusId: string | null;
  onFocus: (p: Pas) => void;
  onAdd: (routeId: string | undefined, point: LonLat | null) => void;
  portStop: ChainStop | null;
  routes: BledRoute[];
}) {
  const pe = PLACE_NAME[c.eu.port];
  const pd = PLACE_NAME[c.dz.port];
  // Après les routes relevées, la fin du chemin jusqu'au village reste à raconter.
  const finReleve = c.dz.chain?.h ?? 0;
  const todoId = k.aRaconter
    ? k.pas.find((p) => p.side === "dz" && p.k !== "portdz" && p.h > finReleve + 0.01)?.id
    : undefined;
  const mid = (a: Pas, b: Pas): LonLat => [
    (a.point[0] + b.point[0]) / 2,
    (a.point[1] + b.point[1]) / 2,
  ];
  const routeOf = (id?: string) => routes.find((r) => r.id === id);
  const clocks = useMemo(() => horaires(k.pas, depart), [k.pas, depart]);
  let jour = 1;
  return (
    <div className="rdb-book">
      <p className="rdb-book__day">{tr("ui.pageRoutesDuBled.jourN", { n: 1 })}</p>
      {k.pas.map((p, i) => {
        const prev = k.pas[i - 1];
        const out: React.ReactNode[] = [];
        if (prev) {
          if (prev.k === "port") {
            out.push(
              <div key={`l-${p.id}`} className="rdb-leg" data-k="mer">
                <div className="rdb-leg__in">
                  <Ship className="size-3.5" aria-hidden />
                  {c.mer != null
                    ? tr("ui.pageRoutesDuBled.enMer", { duree: dureeRonde(c.mer / 60) })
                    : tr("ui.pageRoutesDuBled.traversee")}
                  {` · ${pe} → ${pd} · `}
                  <Link to="/lignes" className="underline underline-offset-2">
                    {tr("ui.pageRoutesDuBled.voirLesLignes")}
                  </Link>
                </div>
              </div>,
            );
          } else {
            const dk = Math.max(0, p.km - prev.km);
            const dh = Math.max(0, p.h - prev.h);
            const todo =
              !!k.aRaconter && p.side === "dz" && prev.side === "dz" && p.h > finReleve + 0.01;
            const approche = prev.k === "depart" && c.eu.approche.km > 3;
            out.push(
              <div
                key={`l-${p.id}`}
                className="rdb-leg"
                data-side={p.side}
                data-k={todo ? "todo" : approche ? "approche" : undefined}
              >
                <div className="rdb-leg__in">
                  {dk > 1 ? (
                    <span>
                      {fmt(dk)}&nbsp;km · {dureeRonde(dh)}
                    </span>
                  ) : null}
                </div>
              </div>,
            );
          }
          if (p.id === todoId && k.aRaconter)
            out.push(
              <div key={`t-${p.id}`} className="rdb-todo">
                <b>{tr("ui.pageRoutesDuBled.aRaconterTitre", { km: fmt(k.aRaconter.km) })}</b>
                <p>{tr("ui.pageRoutesDuBled.aRaconterTexte", { lieu: to })}</p>
                <button type="button" onClick={() => onAdd(p.route, mid(prev, p))}>
                  {tr("ui.pageRoutesDuBled.ajouterPremier")}
                </button>
              </div>,
            );
        }
        if (p.k === "portdz" && p.jour !== jour) {
          jour = p.jour;
          out.push(
            <p key={`d-${p.id}`} className="rdb-book__day">
              {tr("ui.pageRoutesDuBled.jourBled", { n: p.jour })}
            </p>,
          );
        }
        out.push(
          <PasView
            key={p.id}
            p={p}
            c={c}
            focused={focusId === p.id}
            onFocus={() => onFocus(p)}
            onAdd={() => onAdd(p.route, p.point)}
            portStop={portStop}
            route={routeOf(p.route)}
            clock={clocks.get(p)}
            depart={depart}
            onDepart={onDepart}
          />,
        );
        if ((p.k === "nuit" || p.k === "nuitvide") && i < k.pas.length - 1) {
          jour = p.jour + 1;
          out.push(
            <p key={`n-${p.id}`} className="rdb-book__day">
              {p.side === "eu"
                ? tr("ui.pageRoutesDuBled.jourDepartA", { n: jour, heure: heure(reprise(depart)) })
                : tr("ui.pageRoutesDuBled.jourN", { n: jour })}
            </p>,
          );
        }
        return <Fragment key={`f-${p.id}`}>{out}</Fragment>;
      })}
      {/* Une seule invitation, à la fin : le carnet se lit d'abord comme un voyage. */}
      <button
        type="button"
        className="rdb-book__add"
        onClick={() => onAdd(c.eu.chain?.segs[0]?.route.id, null)}
      >
        <Plus className="size-4" aria-hidden />
        <span>
          {tr("ui.pageRoutesDuBled.unEndroitSurRoute")}{" "}
          <b>{tr("ui.pageRoutesDuBled.ajouterUnEndroit")}</b>
          <small>{tr("ui.pageRoutesDuBled.astuceClicDroit")}</small>
        </span>
      </button>
    </div>
  );
}


function PasView({
  p,
  c,
  focused,
  onFocus,
  onAdd,
  portStop,
  route,
  clock,
  depart,
  onDepart,
}: {
  p: Pas;
  c: Chemin;
  focused: boolean;
  onFocus: () => void;
  onAdd: () => void;
  portStop: ChainStop | null;
  route: BledRoute | undefined;
  /** Heure du moment côté Europe (heures depuis minuit le jour même). */
  clock: number | undefined;
  depart: number;
  onDepart: (h: number) => void;
}) {
  const [more, setMore] = useState(false);
  const pd = PLACE_NAME[c.dz.port];
  const pe = PLACE_NAME[c.eu.port];
  const quand =
    p.side === "dz"
      ? p.k === "portdz"
        ? c.mer != null
          ? tr("ui.pageRoutesDuBled.apresEnMer", { duree: dureeRonde(c.mer / 60) })
          : ""
        : p.h > 0.05
          ? tr("ui.pageRoutesDuBled.apresDepuisPort", { duree: dureeRonde(p.h) })
          : ""
      : clock != null && p.k !== "depart"
        ? tr("ui.pageRoutesDuBled.versHeure", { heure: heure(clock) })
        : p.h > 0.05
          ? tr("ui.pageRoutesDuBled.apresDeRoute", { duree: dureeRonde(p.h) })
          : "";
  const e = p.etape;
  const best = e?.best ?? p.lieu ?? null;
  const pray = p.priere ?? null;
  const numero =
    p.n != null
      ? p.k === "nuit" || p.k === "nuitvide"
        ? tr("ui.pageRoutesDuBled.nuitN", { n: p.n })
        : tr("ui.pageRoutesDuBled.pauseN", { n: p.n })
      : "";

  let icon: React.ReactNode = null;
  let title: React.ReactNode = p.name ?? "";
  let body: React.ReactNode = null;

  if (p.k === "depart") {
    icon = <img src="/cabas/persos/voiture_504.webp" alt="" width={30} height={30} />;
    body = (
      <p className="rdb-pas__text">
        <label className="rdb-depart" onClick={(ev) => ev.stopPropagation()}>
          {tr("ui.pageRoutesDuBled.departA")}
          <select value={depart} onChange={(ev) => onDepart(Number(ev.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {heure(h)}
              </option>
            ))}
          </select>
        </label>
        {tr("ui.pageRoutesDuBled.departConseil")}{" "}
        <Link to="/preparer-mon-voyage" className="underline underline-offset-2">
          {tr("ui.pageRoutesDuBled.preparerLien")}
        </Link>
      </p>
    );
  } else if (p.k === "ajout" && p.ajout) {
    // Un lieu ajouté : le tien (en attente, publié ou pas retenu) ou celui d'un autre voyageur.
    const a = p.ajout;
    icon = <KindIcon kind={a.k} className="size-4" />;
    title = a.n;
    body = (
      <>
        <p className="rdb-pas__chips">
          <span className="rdb-chip-ajout" data-etat={a.etat}>
            {tr(
              a.etat === "attente"
                ? "ui.pageRoutesDuBled.ajoutAttente"
                : a.etat === "mien"
                  ? "ui.pageRoutesDuBled.ajoutTonAjout"
                  : a.etat === "refuse"
                    ? "ui.pageRoutesDuBled.ajoutRefuse"
                    : "ui.pageRoutesDuBled.ajoutPublie",
            )}
          </span>
          <span className="rdb-pas__type">{kindLabel(a.k)}</span>
        </p>
        <p className="rdb-pas__text">
          {a.place}
          {a.etat === "attente" ? ` · ${tr("ui.pageRoutesDuBled.ajoutAttenteTexte")}` : ""}
          {a.etat === "refuse" && a.note ? ` · ${a.note}` : ""}
        </p>
        {a.f.length ? (
          <ul className="rdb-tags">
            {a.f.slice(0, 4).map((f) => (
              <li key={f}>
                <FeatureIcon feature={f} />
                {featureLabel(f)}
              </li>
            ))}
          </ul>
        ) : null}
        {a.etat !== "refuse" ? (
          <div className="rdb-step__acts">
            <a
              className="rdb-go"
              href={mapsLink(a)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
            >
              <Navigation className="size-4" aria-hidden />
              {tr("ui.pageRoutesDuBled.yAller")}
            </a>
          </div>
        ) : null}
      </>
    );
  } else if (p.k === "ville") {
    return (
      <div className="rdb-pas" data-k="ville" data-side={p.side} id={`pas-${p.id}`} data-pas={p.id}>
        <span className="rdb-pas__dot" aria-hidden />
        <p className="rdb-pas__ville">
          {placeName(p.name)}{" "}
          <span>
            ·{" "}
            {clock != null
              ? tr("ui.pageRoutesDuBled.versHeure", { heure: heure(clock) })
              : dureeRonde(p.h)}
          </span>
        </p>
      </div>
    );
  } else if (p.k === "joint") {
    icon = <Waypoints className="size-4" />;
    title = tr("ui.pageRoutesDuBled.tuRejoins", {
      route: NOM_ROUTE[p.route ?? ""] ?? (route ? routeName(route) : "l'autoroute"),
    });
    body = (
      <p className="rdb-pas__text">
        {tr(
          c.eu.approche.mesure
            ? "ui.pageRoutesDuBled.boutCalcule"
            : "ui.pageRoutesDuBled.boutEstime",
          {
            km: fmt(c.eu.approche.km),
          },
        )}
      </p>
    );
  } else if (p.k === "port") {
    icon = <Ship className="size-4" />;
    title = tr("ui.pageRoutesDuBled.portNom", { de: portDe(pe) });
    body = (
      <>
        {portStop ? (
          <p className="rdb-pas__text">
            {portStop.n}{" "}
            <a
              className="rdb-go rdb-go--inline"
              href={mapsLink(portStop)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="size-3.5" aria-hidden />
              {tr("ui.pageRoutesDuBled.yAller")}
            </a>
          </p>
        ) : null}
        <p className="rdb-pas__text">{tr("ui.pageRoutesDuBled.portConseil")}</p>
      </>
    );
  } else if (p.k === "portdz") {
    icon = <Ship className="size-4" />;
    title = tr("ui.pageRoutesDuBled.portNom", { de: portDe(pd) });
    body = <p className="rdb-pas__text">{tr("ui.pageRoutesDuBled.douane")}</p>;
  } else if (p.k === "arrivee") {
    icon = <House className="size-4" />;
    body = (
      <p className="rdb-pas__text">
        {c.dz.dernier.km > 3
          ? tr(
              c.dz.dernier.mesure
                ? "ui.pageRoutesDuBled.finCalculee"
                : "ui.pageRoutesDuBled.finEstimee",
              {
                km: fmt(c.dz.dernier.km),
                duree: duree(c.dz.dernier),
              },
            )
          : c.dz.chain
            ? tr("ui.pageRoutesDuBled.finAuBout")
            : tr("ui.pageRoutesDuBled.finAuPort", { port: portDe(pd) })}
        {c.mer != null
          ? ` ${tr(
              c.etapes.some((x) => x.type === "nuit")
                ? "ui.pageRoutesDuBled.enToutNuits"
                : "ui.pageRoutesDuBled.enToutTexte",
              {
                duree: duree({
                  km: 0,
                  h:
                    c.h +
                    c.mer / 60 +
                    (c.etapes.filter((x) => x.type === "pause").length * PAUSE_MIN) / 60,
                  mesure: c.eu.approche.mesure && c.dz.dernier.mesure,
                }),
              },
            )}`
          : ""}
      </p>
    );
  } else {
    // Pauses et nuits : la prière d'abord, puis le lieu retenu, ses services, et les autres options.
    const nuit = p.k === "nuit" || p.k === "nuitvide";
    icon =
      p.k === "priere" ? (
        <Mosque className="size-4" />
      ) : nuit ? (
        <MoonStar className="size-4" />
      ) : best ? (
        <KindIcon kind={best.k} className="size-4" />
      ) : (
        <Plus className="size-4" />
      );
    if (p.k === "vide" || p.k === "nuitvide") {
      title = e?.horsAxe
        ? tr("ui.pageRoutesDuBled.pauseAvantAutoroute")
        : nuit
          ? tr("ui.pageRoutesDuBled.nuitVide")
          : tr("ui.pageRoutesDuBled.pauseVide");
      body = (
        <p className="rdb-pas__text">
          {e?.horsAxe
            ? tr("ui.pageRoutesDuBled.pauseAvantTexte")
            : nuit
              ? tr("ui.pageRoutesDuBled.nuitOuDors")
              : tr("ui.pageRoutesDuBled.aucunLieuIci")}
        </p>
      );
    } else {
      const lead = p.k === "priere" && pray ? pray : best;
      // La nuit : « Nuit vers Tarragone » quand on connaît la ville, sinon le nom de l'hôtel seul.
      title =
        nuit && best?.place
          ? tr("ui.pageRoutesDuBled.nuitVers", { lieu: best.place })
          : lead
            ? stopName(lead)
            : "";
      // Les services affichés sont ceux du lieu en titre, pas ceux d'un voisin (« Aussi ici »).
      const tags = lead
        ? usefulFeatures(lead, nuit).filter((f) => !(p.k === "priere" && f === "priere"))
        : [];
      body = (
        <>
          {p.k === "priere" ? (
            <p className="rdb-pas__chips">
              <span className="rdb-chip-pray">
                <Mosque className="size-3.5" aria-hidden />
                {tr("ui.pageRoutesDuBled.priere")}
              </span>
            </p>
          ) : null}
          {best && ((nuit && best.place) || (p.k === "priere" && pray && pray.id !== best.id)) ? (
            <p className="rdb-pas__text">
              {nuit
                ? `${stopName(best)}${best.src !== "osm" ? ` · ${sourceLabel(best.src)}` : ""}`
                : tr("ui.pageRoutesDuBled.aussiIci", {
                    nom: stopName(best),
                    type: kindLabel(best.k),
                  })}
            </p>
          ) : null}
          {tags.length ? (
            <ul className="rdb-tags">
              {tags.map((f) => (
                <li key={f}>
                  <FeatureIcon feature={f} />
                  {featureLabel(f)}
                </li>
              ))}
            </ul>
          ) : null}
          {lead ? <StopPhotos id={lead.id} /> : null}
          {nuit && pray ? (
            <ul className="rdb-near">
              <li>
                <Mosque className="size-4" aria-hidden />
                {tr("ui.pageRoutesDuBled.prierPres", {
                  nom: stopName(pray),
                  km: best ? ecartKm(pray, best) : 0,
                })}
              </li>
            </ul>
          ) : null}
          {e?.manger.length && !nuit ? (
            <ul className="rdb-near">
              {e.manger.slice(0, 1).map((s) => (
                <li key={s.id}>
                  <KindIcon kind="manger" className="size-4" />
                  {tr("ui.pageRoutesDuBled.mangerPres", {
                    nom: stopName(s),
                    km: best ? ecartKm(s, best) : 0,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="rdb-step__acts">
            {lead ? (
              <a
                className="rdb-go"
                href={mapsLink(lead)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
              >
                <Navigation className="size-4" aria-hidden />
                {tr("ui.pageRoutesDuBled.yAller")}
              </a>
            ) : null}
            {e?.others.length ? (
              <button
                type="button"
                className="rdb-more"
                aria-expanded={more}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setMore(!more);
                }}
              >
                {tr("ui.pageRoutesDuBled.autresOptions", { n: e.others.length })}
                <ChevronDown className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {more && e && best ? (
            <ul className="rdb-others">
              {e.others.map((s) => (
                <li key={s.id}>
                  <KindIcon kind={s.k} className="size-4" />
                  <span className="min-w-0 flex-1">
                    <b>{stopName(s)}</b>
                    <span className="text-muted-foreground">
                      {" · "}
                      {tr(
                        s.km < best.km
                          ? "ui.pageRoutesDuBled.kmAvant"
                          : "ui.pageRoutesDuBled.kmApres",
                        {
                          km: ecartKm(s, best),
                        },
                      )}
                    </span>
                  </span>
                  <a
                    href={mapsLink(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={tr("ui.pageRoutesDuBled.yAller")}
                  >
                    <Navigation className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      );
    }
  }
  const color =
    p.k === "ajout" && p.ajout
      ? KIND_COLOR[p.ajout.k]
      : p.k === "priere"
        ? KIND_COLOR.priere
        : p.k === "nuit"
          ? undefined
          : best && p.k === "pause"
            ? KIND_COLOR[best.k]
            : undefined;
  const pauseLike = p.n != null;
  return (
    <div
      className="rdb-pas"
      data-k={p.k}
      data-side={p.side}
      data-focused={focused || undefined}
      id={`pas-${p.id}`}
      data-pas={p.id}
      style={color ? { ["--k" as string]: color } : undefined}
      onClick={onFocus}
    >
      <span className="rdb-pas__dot" aria-hidden>
        {icon ?? <Coffee className="size-4" />}
      </span>
      <div className="rdb-pas__body">
        {quand || numero ? (
          <p className="rdb-pas__when">
            {numero}
            {numero && quand ? " · " : ""}
            {quand}
          </p>
        ) : null}
        <h3 className="rdb-pas__title">{title}</h3>
        {body}
        {pauseLike && !best ? (
          <button
            type="button"
            className="rdb-add"
            onClick={(ev) => {
              ev.stopPropagation();
              onAdd();
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            {best ? tr("ui.pageRoutesDuBled.tuConnaisMieux") : tr("ui.pageRoutesDuBled.ajouterIci")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
