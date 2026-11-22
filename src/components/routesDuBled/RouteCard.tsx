import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Coffee,
  House,
  MoonStar,
  Navigation,
  Plus,
  Ship,
  Waypoints,
} from "lucide-react";
import { tr } from "@/lib/i18n";
import { KIND_COLOR, mapsLink, type BledRoute } from "@/lib/routesDuBled/data";
import {
  anonyme,
  dureeRonde,
  ecartKm,
  PAUSE_MIN,
  PLACE_NAME,
  type ChainStop,
} from "@/lib/routesDuBled/trajets";
import { heuresEnTout, type Bout, type Chemin, type LonLat } from "@/lib/routesDuBled/porteAPorte";
import type { Carnet, Pas } from "@/lib/routesDuBled/carnet";
import { FeatureIcon, KindIcon, Mosque, featureLabel, kindLabel, sourceLabel } from "./StopVisuals";

export const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
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
  E1: "l'Autoroute du Soleil",
  E2: "la Languedocienne",
  E3: "la route de la Méditerranée",
  E4: "la route d'Almería",
  E5: "la route de Bordeaux et Madrid",
  E6: "la route d'Alicante",
  E7: "la route d'Almería par Grenade",
  E8: "la route du port de Sète",
};
export const stopName = (s: ChainStop) => {
  if (!anonyme(s)) return s.n;
  if (s.k === "priere") return tr("ui.pageRoutesDuBled.sansNomPriere");
  if (s.k === "dormir") return tr("ui.pageRoutesDuBled.sansNomHotel");
  if (s.k === "aire") return tr("ui.pageRoutesDuBled.sansNomAire");
  return kindLabel(s.k);
};

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
}: {
  c: Chemin;
  k: Carnet;
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
  return (
    <article className="rdb-rc" data-open={open || undefined}>
      <button type="button" className="rdb-rc__head" aria-expanded={open} onClick={onToggle}>
        <span className="rdb-rc__title">
          <b>
            {from} → {to}
          </b>
          {first ? (
            <span className="rdb-chemin__tag">{tr("ui.pageRoutesDuBled.lePlusCourt")}</span>
          ) : null}
        </span>
        <span className="rdb-rc__via">
          {via.length
            ? `${tr("ui.pageRoutesDuBled.parVilles", { villes: via.join(" · ") })} · `
            : ""}
          <span className="rdb-rc__port">
            <Ship className="size-3.5" aria-hidden />
            {pe} → {pd}
          </span>
          {variante ? <span className="rdb-rc__variante"> · {variante}</span> : null}
        </span>
        <span className="rdb-rc__facts">
          {enTout != null ? (
            <strong>
              {tr("ui.pageRoutesDuBled.enTout", {
                duree: duree({ ...total, h: enTout + (pauses * PAUSE_MIN) / 60 }),
              })}
            </strong>
          ) : null}
          {enTout != null ? " · " : ""}
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
}: {
  c: Chemin;
  k: Carnet;
  to: string;
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
                  <button
                    type="button"
                    className="rdb-leg__add"
                    onClick={() => onAdd(p.route ?? prev.route, mid(prev, p))}
                  >
                    <Plus className="size-3" aria-hidden />
                    {tr("ui.pageRoutesDuBled.ajouterUnEndroit")}
                  </button>
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
          />,
        );
        if ((p.k === "nuit" || p.k === "nuitvide") && i < k.pas.length - 1) {
          jour = p.jour + 1;
          out.push(
            <p key={`n-${p.id}`} className="rdb-book__day">
              {tr("ui.pageRoutesDuBled.jourN", { n: jour })}
            </p>,
          );
        }
        return <Fragment key={`f-${p.id}`}>{out}</Fragment>;
      })}
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
}: {
  p: Pas;
  c: Chemin;
  focused: boolean;
  onFocus: () => void;
  onAdd: () => void;
  portStop: ChainStop | null;
  route: BledRoute | undefined;
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
        {tr("ui.pageRoutesDuBled.departConseil")}{" "}
        <Link to="/preparer-mon-voyage" className="underline underline-offset-2">
          {tr("ui.pageRoutesDuBled.preparerLien")}
        </Link>
      </p>
    );
  } else if (p.k === "ville") {
    return (
      <div className="rdb-pas" data-k="ville" data-side={p.side} id={`pas-${p.id}`} data-pas={p.id}>
        <span className="rdb-pas__dot" aria-hidden />
        <p className="rdb-pas__ville">
          {p.name} <span>· {dureeRonde(p.h)}</span>
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
      title =
        nuit && best
          ? tr("ui.pageRoutesDuBled.nuitVers", { lieu: best.place || stopName(best) })
          : lead
            ? stopName(lead)
            : "";
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
          {best && (nuit || (p.k === "priere" && pray && pray.id !== best.id)) ? (
            <p className="rdb-pas__text">
              {nuit
                ? `${stopName(best)}${best.src !== "osm" ? ` · ${sourceLabel(best.src)}` : ""}`
                : tr("ui.pageRoutesDuBled.aussiIci", {
                    nom: stopName(best),
                    type: kindLabel(best.k),
                  })}
            </p>
          ) : null}
          {best?.f.length ? (
            <ul className="rdb-tags">
              {best.f.slice(0, 4).map((f) => (
                <li key={f}>
                  <FeatureIcon feature={f} />
                  {featureLabel(f)}
                </li>
              ))}
            </ul>
          ) : null}
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
    p.k === "priere"
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
        {pauseLike ? (
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
