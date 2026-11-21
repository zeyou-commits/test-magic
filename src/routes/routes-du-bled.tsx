import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Coffee,
  MoonStar,
  Navigation,
  Plus,
  Ship,
  Waypoints,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { Bw504Button, Bw504Note, BwKnow } from "@/components/companion/Bw504Note";
import { AddStopDialog, emptyDraft, type Draft } from "@/components/routesDuBled/AddStopDialog";
import { PlaceField } from "@/components/routesDuBled/PlaceField";
import type { MapLine, MapPin, MapPlace } from "@/components/routesDuBled/RoutesMap";
import {
  FeatureIcon,
  KindIcon,
  featureLabel,
  kindLabel,
  sourceLabel,
} from "@/components/routesDuBled/StopVisuals";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
import { calculateRoadGeometry, measureBledLegs } from "@/lib/ferry/itinerary.functions";
import {
  KIND_COLOR,
  loadCommunityStops,
  loadDureesMer,
  loadRoutesData,
  mapsLink,
  mergeCommunity,
  type BledRoute,
} from "@/lib/routesDuBled/data";
import {
  anonyme,
  dureeRonde,
  ecartKm,
  PAUSE_MIN,
  PLACE_NAME,
  type Chain,
  type ChainStop,
  type Etape,
} from "@/lib/routesDuBled/trajets";
import {
  chemins,
  cleBout,
  heuresEnTout,
  optionsAlgerie,
  optionsEurope,
  parPort,
  portPoint,
  trous,
  type Bout,
  type Chemin,
  type DureeMer,
  type Lieu,
  type LonLat,
  type Mesures,
} from "@/lib/routesDuBled/porteAPorte";
import "@/routes-du-bled.css";

const RoutesMap = lazy(() => import("@/components/routesDuBled/RoutesMap"));

export const Route = createFileRoute("/routes-du-bled")({
  head: () =>
    seoHead(
      "Routes du bled : ton trajet en voiture jusqu'au bled, porte à porte | BledWay",
      "Pars de ton adresse ou de ta position, choisis ton village en Algérie : la carte trace ton trajet jusqu'au port puis au bled, avec les pauses, où manger, prier et dormir.",
      "/routes-du-bled",
    ),
  component: RoutesDuBledPage,
});

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const STORE = "bw-routes-du-bled-v3";
const VILLES: Record<string, LonLat> = {
  paris: [2.3522, 48.8566],
  lyon: [4.8357, 45.764],
  montpellier: [3.8767, 43.6108],
  barcelone: [2.1734, 41.3851],
  madrid: [-3.7038, 40.4168],
};
const EXEMPLES: [Lieu, Lieu][] = [
  [
    { label: "Lyon", point: [4.8357, 45.764] },
    { label: "Tlemcen", point: [-1.315, 34.878] },
  ],
  [
    { label: "Paris", point: [2.3522, 48.8566] },
    { label: "Béjaïa", point: [5.084, 36.751] },
  ],
  [
    { label: "Bordeaux", point: [-0.5792, 44.8378] },
    { label: "Oran", point: [-0.633, 35.697] },
  ],
];
const isLieu = (x: unknown): x is Lieu =>
  !!x &&
  typeof (x as Lieu).label === "string" &&
  Array.isArray((x as Lieu).point) &&
  (x as Lieu).point.every((n) => typeof n === "number" && Number.isFinite(n));

/** Nom affiché d'une halte, même quand OpenStreetMap ne lui en donne pas. */
const stopName = (s: ChainStop) => {
  if (!anonyme(s)) return s.n;
  if (s.k === "priere") return tr("ui.pageRoutesDuBled.sansNomPriere");
  if (s.k === "dormir") return tr("ui.pageRoutesDuBled.sansNomHotel");
  if (s.k === "aire") return tr("ui.pageRoutesDuBled.sansNomAire");
  return kindLabel(s.k);
};
/** « 12 Rue X, 42000, Saint-Étienne, France » devient « Saint-Étienne » sur la carte. */
const courte = (label: string) => {
  const p = label.split(", ");
  return p.length >= 3 ? (p[p.length - 2] ?? label) : (p[0] ?? label);
};
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
const nomRoute = (r: BledRoute) => NOM_ROUTE[r.id] ?? routeName(r);
const routeName = (r: BledRoute) => r.name.replace(/ \(.*\)$/, "");
const portDe = (p: string) => (/^[aeiouyéè]/i.test(p) ? `d'${p}` : `de ${p}`);

/** Une traversée dessinée en léger arc, pour la distinguer des routes. */
function arc(a: LonLat, b: LonLat): LonLat[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: LonLat = [mx - dy * 0.12, my + dx * 0.12];
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return [
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
      (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
    ] as LonLat;
  });
}
const troncons = (c: Chain) =>
  trous(c).map(([a, b]) => c.line.filter((_, i) => c.lineKm[i]! >= a && c.lineKm[i]! <= b));
const duree = (b: Bout) => (b.mesure ? dureeRonde(b.h) : `≈ ${dureeRonde(b.h)}`);

function RoutesDuBledPage() {
  const data = useQuery({
    queryKey: ["routes-du-bled", "data"],
    queryFn: loadRoutesData,
    staleTime: Infinity,
  });
  const community = useQuery({
    queryKey: ["routes-du-bled", "community"],
    queryFn: loadCommunityStops,
    staleTime: 60_000,
  });
  // Durées habituelles des traversées, tenues dans les lignes par l'équipe.
  const dureesMer = useQuery({
    queryKey: ["routes-du-bled", "mer"],
    queryFn: loadDureesMer,
    staleTime: 10 * 60_000,
  });
  const mer = useMemo<DureeMer>(
    () => (p, d) => dureesMer.data?.[`${p}-${d}`] ?? null,
    [dureesMer.data],
  );
  const routes = useMemo(() => data.data?.routes ?? [], [data.data]);

  const [from, setFrom] = useState<Lieu | null>(null);
  const [to, setTo] = useState<Lieu | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | "halte" | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("E2"));

  // Un ancien lien ?depart=lyon part de cette ville ; sinon le dernier trajet revient
  // à la visite suivante (sur cet appareil seulement).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ville = q.get("depart");
    if (ville && VILLES[ville]) {
      setFrom({
        label: PLACE_NAME[ville as keyof typeof PLACE_NAME] ?? ville,
        point: VILLES[ville]!,
      });
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as {
        from?: unknown;
        to?: unknown;
      } | null;
      if (isLieu(saved?.from)) setFrom(saved.from);
      if (isLieu(saved?.to)) setTo(saved.to);
    } catch {
      /* stockage indisponible : on part de zéro */
    }
  }, []);
  useEffect(() => {
    if (!from && !to) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ from, to }));
    } catch {
      /* rien à faire */
    }
  }, [from, to]);

  const stopsOf = useMemo(() => {
    const rows = community.data ?? [];
    return (r: BledRoute) => mergeCommunity(r, rows);
  }, [community.data]);

  // 1) Estimation immédiate, 2) mesure OSRM des bouts hors grands axes, qui affine le classement.
  const euEst = useMemo(
    () => (from && routes.length ? optionsEurope(routes, stopsOf, from.point) : []),
    [from, routes, stopsOf],
  );
  const dzEst = useMemo(
    () => (to && routes.length ? optionsAlgerie(routes, stopsOf, to.point) : []),
    [to, routes, stopsOf],
  );
  const joints = useMemo(
    () =>
      euEst
        .slice()
        .sort((a, b) => a.approche.km - b.approche.km)
        .slice(0, 12)
        .map((o) => o.joint),
    [euEst],
  );
  const sorties = useMemo(() => dzEst.slice(0, 12).map((o) => o.sortie), [dzEst]);
  const acces = useQuery({
    queryKey: ["routes-du-bled", "acces", from?.point, joints],
    queryFn: () => measureBledLegs({ data: { from: from!.point, points: joints, sens: "depuis" } }),
    enabled: Boolean(from && joints.length),
    staleTime: Infinity,
    retry: false,
  });
  const arrivee = useQuery({
    queryKey: ["routes-du-bled", "arrivee", to?.point, sorties],
    queryFn: () => measureBledLegs({ data: { from: to!.point, points: sorties, sens: "vers" } }),
    enabled: Boolean(to && sorties.length),
    staleTime: Infinity,
    retry: false,
  });
  const mesures = useMemo<Mesures>(() => {
    const m = new Map<string, Bout>();
    acces.data?.legs.forEach((l, i) => {
      if (l && from)
        m.set(cleBout(from.point, joints[i]!), { km: l.km, h: l.min / 60, mesure: true });
    });
    arrivee.data?.legs.forEach((l, i) => {
      if (l && to) m.set(cleBout(sorties[i]!, to.point), { km: l.km, h: l.min / 60, mesure: true });
    });
    return (a, b) => m.get(cleBout(a, b)) ?? null;
  }, [acces.data, arrivee.data, from, to, joints, sorties]);
  const eu = useMemo(
    () => (from && routes.length ? optionsEurope(routes, stopsOf, from.point, mesures) : []),
    [from, routes, stopsOf, mesures],
  );
  const dz = useMemo(
    () => (to && routes.length ? optionsAlgerie(routes, stopsOf, to.point, mesures) : []),
    [to, routes, stopsOf, mesures],
  );
  const list = useMemo(() => (from && to ? chemins(eu, dz, 20, mer) : []), [from, to, eu, dz, mer]);
  // Trois chemins d'abord ; les autres ports (souvent l'Espagne) à la demande.
  const [tous, setTous] = useState(false);
  useEffect(() => setTous(false), [from, to]);
  const shown = tous ? list : list.slice(0, 3);
  const caches = list.slice(3);
  const sel = list.find((c) => c.id === selId) ?? list[0] ?? null;
  const ports = parPort(eu);

  // Le vrai tracé des deux bouts hors grands axes, pour le chemin choisi.
  const geo = useQuery({
    queryKey: ["routes-du-bled", "geo", from?.point, to?.point, sel?.eu.joint, sel?.dz.sortie],
    queryFn: () =>
      calculateRoadGeometry({
        data: {
          origin: from!.point,
          destination: to!.point,
          departurePort: sel!.eu.joint,
          arrivalPort: sel!.dz.sortie,
        },
      }),
    enabled: Boolean(from && to && sel),
    staleTime: Infinity,
    retry: false,
  });

  const choose = (which: "from" | "to", lieu: Lieu) => {
    (which === "from" ? setFrom : setTo)(lieu);
    setSelId(null);
    setFocusId(null);
    setPicking(null);
  };
  function locate() {
    if (!navigator.geolocation) {
      setGeoError(tr("ui.pageRoutesDuBled.positionIndisponible"));
      return;
    }
    setGeoError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const { longitude: lon, latitude: lat } = coords;
        if (lon < -12 || lon > 36 || lat < 35 || lat > 72 || (lat < 37.2 && lon > -2.2)) {
          setGeoError(tr("ui.pageRoutesDuBled.positionHorsZone"));
          return;
        }
        choose("from", {
          label: tr("ui.pageRoutesDuBled.maPosition"),
          point: [+lon.toFixed(5), +lat.toFixed(5)],
        });
      },
      () => {
        setLocating(false);
        setGeoError(tr("ui.pageRoutesDuBled.positionIndisponible"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const startAdd = (routeId?: string) => {
    setDraft((d) => ({ ...d, route: routeId ?? sel?.eu.chain?.segs[0]?.route.id ?? d.route }));
    setAdding(true);
  };
  const startPick = () => {
    setAdding(false);
    setPicking("halte");
    document.getElementById("rdb-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const focusEtape = (id: string) => {
    setFocusId(id);
    document.getElementById(`etape-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // La carte : le chemin choisi en avant, les autres chemins en léger, les bons plans dessus.
  const mapLines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = routes.map((r) => ({
      id: r.id,
      coords: r.line.map(([lon, lat]) => [lon, lat] as LonLat),
      kind: "fond" as const,
    }));
    if (from && !to)
      for (const o of ports)
        if (o.chain) out.push({ id: o.key, coords: o.chain.line, kind: "autre" });
    if (to && !from)
      for (const d of dz)
        if (d.chain) out.push({ id: d.port, coords: d.chain.line, kind: "autre" });
    for (const c of list) {
      if (c === sel) continue;
      if (c.eu.chain) out.push({ id: c.id, coords: c.eu.chain.line, kind: "autre" });
      if (c.dz.chain) out.push({ id: c.id, coords: c.dz.chain.line, kind: "autre" });
    }
    if (sel && from && to) {
      const pe = portPoint(routes, sel.eu.port);
      const pd = portPoint(routes, sel.dz.port);
      const g = geo.data;
      out.push({
        id: "approche",
        coords: g?.toPort ?? [from.point, sel.eu.joint],
        kind: "approche",
      });
      out.push({ id: "fin", coords: g?.fromPort ?? [sel.dz.sortie, to.point], kind: "approche" });
      if (pe && pd) out.push({ id: "mer", coords: arc(pe, pd), kind: "mer" });
      for (const ch of [sel.eu.chain, sel.dz.chain]) {
        if (!ch) continue;
        out.push({ id: sel.id, coords: ch.line, kind: "choisi" });
        troncons(ch).forEach((coords, i) =>
          out.push({ id: `trou-${ch.key}-${i}`, coords, kind: "trou" }),
        );
      }
    }
    return out;
  }, [routes, from, to, ports, dz, list, sel, geo.data]);

  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];
    if (!sel) return pins;
    const main = new Set<string>();
    sel.etapes.forEach((e) => {
      if (!e.best) return;
      main.add(e.best.id);
      pins.push({
        id: e.id,
        lat: e.best.lat,
        lon: e.best.lon,
        k: e.type === "nuit" ? "dormir" : e.best.k,
        label: String(e.n),
        main: true,
      });
    });
    // Les autres bons plans du chemin apparaissent quand on zoome.
    for (const ch of [sel.eu.chain, sel.dz.chain])
      for (const s of ch?.stops ?? [])
        if (!main.has(s.id) && s.k !== "billets" && s.k !== "port")
          pins.push({ id: `s-${s.id}`, lat: s.lat, lon: s.lon, k: s.k, main: false });
    return pins;
  }, [sel]);
  const mapPorts = useMemo<MapPlace[]>(() => {
    const out: MapPlace[] = [];
    const add = (p: string, name: string) => {
      const pt = portPoint(routes, p as never);
      if (pt) out.push({ lon: pt[0], lat: pt[1], label: name });
    };
    if (sel) {
      add(sel.eu.port, PLACE_NAME[sel.eu.port]);
      add(sel.dz.port, PLACE_NAME[sel.dz.port]);
    } else if (from) ports.slice(0, 4).forEach((o) => add(o.port, PLACE_NAME[o.port]));
    else if (to) dz.slice(0, 4).forEach((d) => add(d.port, PLACE_NAME[d.port]));
    return out;
  }, [routes, sel, from, to, ports, dz]);
  const focus = (() => {
    const e = sel?.etapes.find((x) => x.id === focusId);
    return e?.best ? { lat: e.best.lat, lon: e.best.lon } : null;
  })();
  const fitKey = `${from?.point.join() ?? ""}|${to?.point.join() ?? ""}|${sel?.id ?? ""}|${routes.length}`;

  const faq = [
    { q: tr("ui.pageRoutesDuBled.faq1Q"), a: tr("ui.pageRoutesDuBled.faq1A") },
    { q: tr("ui.pageRoutesDuBled.faq2Q"), a: tr("ui.pageRoutesDuBled.faq2A") },
    { q: tr("ui.pageRoutesDuBled.faq3Q"), a: tr("ui.pageRoutesDuBled.faq3A") },
    { q: tr("ui.pageRoutesDuBled.faq4Q"), a: tr("ui.pageRoutesDuBled.faq4A") },
  ];

  return (
    <>
      <SiteHeader />
      <main className="rdb mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 sm:pt-5">
        <Breadcrumbs
          items={[{ name: tr("ui.pageRoutesDuBled.titreCourt"), path: "/routes-du-bled" }]}
        />

        <header className="rdb-hero">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary lg:hidden">
            {tr("ui.pageRoutesDuBled.surtitre")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:mt-0 lg:text-3xl">
            {tr("ui.pageRoutesDuBled.titre")}
          </h1>
        </header>

        <section
          className="rdb-planner"
          id="rdb-planner"
          aria-label={tr("ui.pageRoutesDuBled.plannerAria")}
        >
          <div className="rdb-bar">
            <PlaceField
              id="rdb-from"
              label={tr("ui.pageRoutesDuBled.tuParsDe")}
              placeholder={tr("ui.pageRoutesDuBled.tonAdresse")}
              value={from}
              onChoose={(l) => choose("from", l)}
              onLocate={locate}
              locating={locating}
              onPickOnMap={() => setPicking("from")}
            />
            <ArrowRight className="rdb-bar__arrow" aria-hidden />
            <PlaceField
              id="rdb-to"
              label={tr("ui.pageRoutesDuBled.tuArrivesA")}
              placeholder={tr("ui.pageRoutesDuBled.tonVillage")}
              value={to}
              country="DZ"
              onChoose={(l) => choose("to", l)}
              onPickOnMap={() => setPicking("to")}
            />
          </div>

          <div className="rdb-planner__grid">
            <div className="rdb-map" data-picking={picking || undefined}>
              {picking ? (
                <div className="rdb-map__hint" role="status">
                  <span>
                    {picking === "from"
                      ? tr("ui.pageRoutesDuBled.toucheDepart")
                      : picking === "to"
                        ? tr("ui.pageRoutesDuBled.toucheVillage")
                        : tr("ui.pageRoutesDuBled.toucheLaCarte")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (picking === "halte") setAdding(true);
                      setPicking(null);
                    }}
                  >
                    {tr("ui.pageRoutesDuBled.annuler")}
                  </button>
                </div>
              ) : null}
              <Suspense
                fallback={
                  <div className="rdb-map__wait">{tr("ui.pageRoutesDuBled.chargementCarte")}</div>
                }
              >
                <RoutesMap
                  lines={mapLines}
                  pins={mapPins}
                  start={
                    from
                      ? { lon: from.point[0], lat: from.point[1], label: courte(from.label) }
                      : null
                  }
                  end={to ? { lon: to.point[0], lat: to.point[1], label: courte(to.label) } : null}
                  ports={mapPorts}
                  focus={focus}
                  fitKey={fitKey}
                  onSelectPin={(id) => {
                    if (!id.startsWith("s-")) focusEtape(id);
                  }}
                  onSelectLine={(id) => {
                    if (list.some((c) => c.id === id)) setSelId(id);
                  }}
                  picking={Boolean(picking)}
                  onPick={(lon, lat) => {
                    const point: LonLat = [lon, lat];
                    if (picking === "halte") {
                      setDraft((d) => ({ ...d, coords: { lat, lon } }));
                      setAdding(true);
                    } else if (picking === "from")
                      choose("from", { label: tr("ui.pageRoutesDuBled.pointChoisi"), point });
                    else if (picking === "to")
                      choose("to", { label: tr("ui.pageRoutesDuBled.monVillage"), point });
                    setPicking(null);
                  }}
                />
              </Suspense>
            </div>

            <div className="rdb-side">
              <aside className="rdb-panel" aria-live="polite">
                {geoError ? <p className="rdb-panel__err">{geoError}</p> : null}
                {data.isError ? (
                  <Bw504Note tone="stuck" title={tr("ui.pageRoutesDuBled.erreurChargement")}>
                    {(data.error as Error).message}
                  </Bw504Note>
                ) : !from && !to ? (
                  <div className="rdb-panel__stack">
                    <p className="rdb-panel__lead">{tr("ui.pageRoutesDuBled.intro")}</p>
                    <button type="button" className="rdb-cta" onClick={locate}>
                      <Navigation className="size-4" aria-hidden />
                      {tr("ui.pageRoutesDuBled.partirDeMaPosition")}
                    </button>
                    <div>
                      <p className="rdb-panel__eyebrow">{tr("ui.pageRoutesDuBled.exemples")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {EXEMPLES.map(([f, t]) => (
                          <button
                            key={f.label + t.label}
                            type="button"
                            className="rdb-chip"
                            onClick={() => {
                              setFrom(f);
                              setTo(t);
                              setSelId(null);
                            }}
                          >
                            {f.label} → {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : from && !to ? (
                  <div className="rdb-panel__stack">
                    <div>
                      <p className="rdb-panel__eyebrow">
                        {tr("ui.pageRoutesDuBled.depuis", { lieu: from.label })}
                      </p>
                      <h2 className="rdb-panel__title">{tr("ui.pageRoutesDuBled.etTuVasOu")}</h2>
                    </div>
                    <ul className="rdb-ports">
                      {ports.slice(0, 4).map((o) => (
                        <li key={o.key}>
                          <Ship className="size-4" aria-hidden />
                          <b>{PLACE_NAME[o.port]}</b>
                          <span>
                            {tr("ui.pageRoutesDuBled.deRoute", {
                              duree: duree({ ...o.approche, h: o.h }),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : to && !from ? (
                  <div className="rdb-panel__stack">
                    <div>
                      <p className="rdb-panel__eyebrow">
                        {tr("ui.pageRoutesDuBled.vers", { lieu: to.label })}
                      </p>
                      <h2 className="rdb-panel__title">{tr("ui.pageRoutesDuBled.etTuPars")}</h2>
                    </div>
                    <button type="button" className="rdb-cta" onClick={locate}>
                      <Navigation className="size-4" aria-hidden />
                      {tr("ui.pageRoutesDuBled.partirDeMaPosition")}
                    </button>
                  </div>
                ) : data.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    {tr("ui.pageRoutesDuBled.chargement")}
                  </p>
                ) : !list.length ? (
                  <div className="rdb-panel__stack">
                    <h2 className="rdb-panel__title">{tr("ui.pageRoutesDuBled.aucunChemin")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {tr("ui.pageRoutesDuBled.aucunCheminTexte")}
                    </p>
                  </div>
                ) : (
                  <div className="rdb-panel__stack">
                    <p className="rdb-panel__eyebrow">{tr("ui.pageRoutesDuBled.tesChemins")}</p>
                    {shown.map((c, i) => (
                      <CheminCard
                        key={c.id}
                        c={c}
                        via={viaDe(c, list)}
                        first={i === 0}
                        selected={c === sel}
                        onSelect={() => setSelId(c.id)}
                      />
                    ))}
                    {caches.length && !tous ? (
                      <button type="button" className="rdb-autres" onClick={() => setTous(true)}>
                        {tr("ui.pageRoutesDuBled.autresChemins", { n: caches.length })}
                      </button>
                    ) : null}
                    <a href="#rdb-etapes" className="rdb-cta rdb-cta--etapes">
                      {tr("ui.pageRoutesDuBled.voirMesEtapes")}
                    </a>
                    <p className="rdb-panel__note">{tr("ui.pageRoutesDuBled.noteDurees")}</p>
                  </div>
                )}
              </aside>
              {/* Sur ordinateur, les étapes défilent à côté de la carte, qui reste en vue. */}
              {sel && from && to ? (
                <TripSteps
                  c={sel}
                  from={from}
                  to={to}
                  focusId={focusId}
                  setFocusId={setFocusId}
                  onAdd={startAdd}
                  portStop={
                    sel.eu.chain?.stops.filter((s) => s.k === "port" || s.k === "billets").at(-1) ??
                    null
                  }
                />
              ) : null}
            </div>
          </div>
        </section>

        <section className="rdb-contrib mt-12">
          <Bw504Note
            tone="start"
            title={tr("ui.pageRoutesDuBled.contribTitre")}
            actions={
              <Bw504Button primary onClick={() => startAdd()}>
                {tr("ui.pageRoutesDuBled.ajouterUneHalte")}
              </Bw504Button>
            }
          >
            {tr("ui.pageRoutesDuBled.contribTexte")}
          </Bw504Note>
          <BwKnow className="mt-4" source={tr("ui.pageRoutesDuBled.sourcesOsm")}>
            {tr("ui.pageRoutesDuBled.bonASavoir")}
          </BwKnow>
        </section>

        <FaqSection faq={faq} path="/routes-du-bled" />
      </main>
      <SiteFooter />

      {routes.length ? (
        <AddStopDialog
          open={adding}
          onOpenChange={setAdding}
          routes={routes}
          draft={draft}
          setDraft={setDraft}
          onPickOnMap={startPick}
        />
      ) : null}
    </>
  );
}

/** Un chemin proposé : l'essentiel sur une ligne ; la frise et les bons plans quand il est choisi. */
/** « Par Madrid » ou « par la côte », quand deux chemins mènent aux mêmes ports. */
function viaDe(c: Chemin, all: Chemin[]): string | null {
  const twin = all.some((x) => x !== c && x.eu.port === c.eu.port && x.dz.port === c.dz.port);
  if (!twin || !c.eu.chain) return null;
  return c.eu.chain.segs.some((s) => s.route.id === "E5")
    ? tr("ui.pageRoutesDuBled.parMadrid")
    : tr("ui.pageRoutesDuBled.parLaCote");
}

function CheminCard({
  c,
  via,
  first,
  selected,
  onSelect,
}: {
  c: Chemin;
  via: string | null;
  first: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const pauses = c.etapes.filter((e) => e.type === "pause").length;
  const nuits = c.etapes.length - pauses;
  const total: Bout = {
    km: c.km,
    h: c.h + (pauses * PAUSE_MIN) / 60,
    mesure: c.eu.approche.mesure && c.dz.dernier.mesure,
  };
  const enTout = heuresEnTout(c);
  return (
    <button type="button" className="rdb-chemin" aria-pressed={selected} onClick={onSelect}>
      <span className="rdb-chemin__top">
        <b>
          {PLACE_NAME[c.eu.port]} → {PLACE_NAME[c.dz.port]}
          {via ? <small className="rdb-chemin__via">{via}</small> : null}
        </b>
        {first ? (
          <span className="rdb-chemin__tag">{tr("ui.pageRoutesDuBled.lePlusCourt")}</span>
        ) : null}
      </span>
      {enTout != null ? (
        <span className="rdb-chemin__total">
          {tr("ui.pageRoutesDuBled.enTout", {
            duree: duree({ ...total, h: enTout + (pauses * PAUSE_MIN) / 60 }),
          })}
        </span>
      ) : null}
      <span className="rdb-chemin__facts">
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
      {selected ? (
        <>
          <Frise c={c} />
          <span className="rdb-chemin__facts">
            {tr(
              c.bonsPlans > 1
                ? "ui.pageRoutesDuBled.bonsPlansSurTaRoute"
                : "ui.pageRoutesDuBled.unBonPlanSurTaRoute",
              { n: c.bonsPlans },
            )}
          </span>
        </>
      ) : null}
    </button>
  );
}

/** La frise d'un chemin : maison, autoroute, pauses, port, puis la route au bled. Proportionnelle aux heures de route. */
function Frise({ c }: { c: Chemin }) {
  const T = Math.max(0.1, c.h);
  const a = c.eu.approche.h / T;
  const e = (c.eu.chain?.h ?? 0) / T;
  const pct = (x: number) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;
  return (
    <span className="rdb-strip" aria-hidden>
      <i className="rdb-strip__approche" style={{ left: 0, width: pct(a) }} />
      <i className="rdb-strip__route" style={{ left: pct(a), width: pct(e) }} />
      <i className="rdb-strip__dz" style={{ left: pct(a + e), width: pct(1 - a - e) }} />
      <b className="rdb-strip__port" style={{ left: pct(a + e) }}>
        <Ship className="size-3" />
      </b>
      {c.etapes.map((x) => (
        <b
          key={x.id}
          className="rdb-strip__dot"
          data-type={x.type}
          style={{ left: pct(x.h / T) }}
        />
      ))}
    </span>
  );
}

/** Le trajet choisi, déroulé de la porte au village. */
function TripSteps({
  c,
  from,
  to,
  focusId,
  setFocusId,
  onAdd,
  portStop,
}: {
  c: Chemin;
  from: Lieu;
  to: Lieu;
  focusId: string | null;
  setFocusId: (id: string) => void;
  onAdd: (routeId?: string) => void;
  portStop: ChainStop | null;
}) {
  const pauses = c.etapes.filter((e) => e.type === "pause").length;
  const auPort = c.eu.approche.h + (c.eu.chain?.h ?? 0) + (pauses * PAUSE_MIN) / 60;
  const pe = PLACE_NAME[c.eu.port];
  const pd = PLACE_NAME[c.dz.port];
  const dzChain = c.dz.chain;
  const nuits = c.etapes.length - pauses;
  const sansReleve = [...(c.eu.chain?.sansReleve ?? []), ...(dzChain?.sansReleve ?? [])];
  return (
    <section className="rdb-trip" id="rdb-etapes" aria-labelledby="rdb-trip-title">
      <h2 id="rdb-trip-title" className="font-display text-2xl font-bold">
        {tr("ui.pageRoutesDuBled.tonTrajet")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {courte(from.label)} → {pe} → {pd} → {courte(to.label)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {pauses
          ? tr("ui.pageRoutesDuBled.resumeTrajet", {
              km: fmt(c.km),
              route: dureeRonde(c.h),
              total: dureeRonde(c.h + (pauses * PAUSE_MIN) / 60),
              pauses,
            })
          : tr("ui.pageRoutesDuBled.resumeTrajetSansPause", {
              km: fmt(c.km),
              route: dureeRonde(c.h),
            })}
        {nuits === 1 ? ` ${tr("ui.pageRoutesDuBled.resumeNuit1")}` : ""}
        {nuits > 1 ? ` ${tr("ui.pageRoutesDuBled.resumeNuits", { n: nuits })}` : ""}
      </p>
      {sansReleve.length ? (
        <p className="rdb-gap">
          {tr("ui.pageRoutesDuBled.sansReleve", {
            routes: sansReleve.map((r) => r.name.replace(/ (.*)$/, "")).join(", "),
          })}{" "}
          <button type="button" onClick={() => onAdd(sansReleve[0]!.id)}>
            {tr("ui.pageRoutesDuBled.ajouterLaTienne")}
          </button>
        </p>
      ) : null}
      {c.trousKm > 0 ? (
        <p className="rdb-gap">
          {tr("ui.pageRoutesDuBled.trousTexte", { km: fmt(Math.round(c.trousKm / 10) * 10) })}{" "}
          <button type="button" onClick={() => onAdd()}>
            {tr("ui.pageRoutesDuBled.ajouterLaTienne")}
          </button>
        </p>
      ) : null}

      <ol className="rdb-road mt-6">
        <li className="rdb-step" data-type="depart">
          <span className="rdb-step__marker" aria-hidden>
            <img src="/cabas/persos/voiture_504.webp" alt="" width={40} height={40} />
          </span>
          <div className="rdb-step__card">
            <p className="rdb-step__when">{tr("ui.pageRoutesDuBled.depart")}</p>
            <h3 className="rdb-step__title">{courte(from.label)}</h3>
            <p className="rdb-step__text">
              {tr("ui.pageRoutesDuBled.departConseil")}{" "}
              <Link to="/preparer-mon-voyage" className="underline underline-offset-2">
                {tr("ui.pageRoutesDuBled.preparerLien")}
              </Link>
            </p>
          </div>
        </li>

        {c.etapes
          .filter((e) => e.horsAxe)
          .map((e) => (
            <EtapeCard
              key={e.id}
              etape={e}
              focused={focusId === e.id}
              onFocus={() => setFocusId(e.id)}
              onAdd={() => onAdd(e.route.id)}
            />
          ))}

        {c.eu.chain && c.eu.approche.km > 3 ? (
          <li className="rdb-step" data-type="rejoindre">
            <span className="rdb-step__marker" aria-hidden>
              <Waypoints className="size-5" />
            </span>
            <div className="rdb-step__card">
              <p className="rdb-step__when">
                {tr("ui.pageRoutesDuBled.apresDeRoute", { duree: duree(c.eu.approche) })}
              </p>
              <h3 className="rdb-step__title">
                {tr("ui.pageRoutesDuBled.tuRejoins", {
                  route: nomRoute(c.eu.chain.segs[0]!.route),
                })}
              </h3>
              <p className="rdb-step__text">
                {tr(
                  c.eu.approche.mesure
                    ? "ui.pageRoutesDuBled.boutCalcule"
                    : "ui.pageRoutesDuBled.boutEstime",
                  {
                    km: fmt(c.eu.approche.km),
                  },
                )}
              </p>
            </div>
          </li>
        ) : null}

        {c.etapes
          .filter((e) => !e.horsAxe)
          .map((e) => (
            <EtapeCard
              key={e.id}
              etape={e}
              focused={focusId === e.id}
              onFocus={() => setFocusId(e.id)}
              onAdd={() => onAdd(e.route.id)}
            />
          ))}

        <li className="rdb-step" data-type="port">
          <span className="rdb-step__marker" aria-hidden>
            <Ship className="size-5" />
          </span>
          <div className="rdb-step__card">
            <p className="rdb-step__when">
              {tr("ui.pageRoutesDuBled.arriveeApres", { duree: dureeRonde(auPort) })}
            </p>
            <h3 className="rdb-step__title">
              {tr("ui.pageRoutesDuBled.portNom", { de: portDe(pe) })}
            </h3>
            {portStop ? (
              <p className="rdb-step__text">
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
            <p className="rdb-step__text">{tr("ui.pageRoutesDuBled.portConseil")}</p>
          </div>
        </li>

        <li className="rdb-step" data-type="mer">
          <span className="rdb-step__marker" aria-hidden>
            <Ship className="size-5" />
          </span>
          <div className="rdb-step__card">
            <p className="rdb-step__when">{tr("ui.pageRoutesDuBled.traversee")}</p>
            <h3 className="rdb-step__title">
              {pe} → {pd}
            </h3>
            <p className="rdb-step__text">
              {c.mer != null
                ? `${tr("ui.pageRoutesDuBled.merHabituelle", { duree: dureeRonde(c.mer / 60) })} `
                : ""}
              {tr("ui.pageRoutesDuBled.traverseeTexte")}{" "}
              <Link to="/lignes" className="underline underline-offset-2">
                {tr("ui.pageRoutesDuBled.voirLesLignes")}
              </Link>
            </p>
          </div>
        </li>

        {dzChain ? (
          <DzRoute chain={dzChain} onAdd={() => onAdd(dzChain.segs[0]!.route.id)} port={pd} />
        ) : null}

        <li className="rdb-step" data-type="arrivee">
          <span className="rdb-step__marker" aria-hidden>
            <img src="/cabas/persos/voiture_504.webp" alt="" width={40} height={40} />
          </span>
          <div className="rdb-step__card">
            <p className="rdb-step__when">{tr("ui.pageRoutesDuBled.arrivee")}</p>
            <h3 className="rdb-step__title">{courte(to.label)}</h3>
            <p className="rdb-step__text">
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
                : dzChain
                  ? tr("ui.pageRoutesDuBled.finAuBout")
                  : tr("ui.pageRoutesDuBled.finAuPort", { port: portDe(pd) })}
            </p>
            {c.mer != null ? (
              <p className="rdb-step__text">
                {tr(
                  c.etapes.some((x) => x.type === "nuit")
                    ? "ui.pageRoutesDuBled.enToutNuits"
                    : "ui.pageRoutesDuBled.enToutTexte",
                  {
                    duree: duree({
                      km: 0,
                      h: auPort + c.mer / 60 + c.dz.h,
                      mesure: c.eu.approche.mesure && c.dz.dernier.mesure,
                    }),
                  },
                )}
              </p>
            ) : null}
          </div>
        </li>
      </ol>
    </section>
  );
}

function etapeTitle(e: Etape) {
  return e.type === "nuit"
    ? tr("ui.pageRoutesDuBled.nuitN", { n: e.n })
    : tr("ui.pageRoutesDuBled.pauseN", { n: e.n });
}

function EtapeCard({
  etape: e,
  focused,
  onFocus,
  onAdd,
}: {
  etape: Etape;
  focused: boolean;
  onFocus: () => void;
  onAdd: () => void;
}) {
  const [more, setMore] = useState(false);
  const best = e.best;
  const color = best ? KIND_COLOR[e.type === "nuit" ? "dormir" : best.k] : undefined;
  return (
    <li
      id={`etape-${e.id}`}
      className="rdb-step"
      data-type={e.type}
      data-focused={focused || undefined}
      data-empty={!best || undefined}
      style={color ? { ["--k" as string]: color } : undefined}
      onClick={onFocus}
    >
      <span className="rdb-step__marker" aria-hidden>
        {e.type === "nuit" ? <MoonStar className="size-5" /> : <Coffee className="size-5" />}
      </span>
      <div className="rdb-step__card">
        <p className="rdb-step__when">
          {etapeTitle(e)} · {tr("ui.pageRoutesDuBled.apresDeRoute", { duree: dureeRonde(e.h) })}
        </p>
        {best ? (
          <>
            <h3 className="rdb-step__title">{stopName(best)}</h3>
            <p className="rdb-step__kind">
              <KindIcon kind={best.k} className="size-4" />
              {kindLabel(best.k)}
              {best.src !== "osm" ? ` · ${sourceLabel(best.src)}` : ""}
            </p>
            {best.f.length ? (
              <ul className="rdb-tags">
                {best.f.slice(0, 5).map((f) => (
                  <li key={f}>
                    <FeatureIcon feature={f} />
                    {featureLabel(f)}
                  </li>
                ))}
              </ul>
            ) : null}
            {best.note ? <p className="rdb-step__text">« {best.note} »</p> : null}
            <ul className="rdb-near">
              {e.priere.map((s) => (
                <li key={s.id}>
                  <KindIcon kind="priere" className="size-4" />
                  {tr("ui.pageRoutesDuBled.prierPres", { nom: stopName(s), km: ecartKm(s, best) })}
                </li>
              ))}
              {e.manger.map((s) => (
                <li key={s.id}>
                  <KindIcon kind="manger" className="size-4" />
                  {tr("ui.pageRoutesDuBled.mangerPres", { nom: stopName(s), km: ecartKm(s, best) })}
                </li>
              ))}
            </ul>
            <div className="rdb-step__acts">
              <a
                className="rdb-go"
                href={mapsLink(best)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
              >
                <Navigation className="size-4" aria-hidden />
                {tr("ui.pageRoutesDuBled.yAller")}
              </a>
              {e.others.length ? (
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
            {more ? (
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
        ) : (
          <>
            <h3 className="rdb-step__title">
              {e.horsAxe
                ? tr("ui.pageRoutesDuBled.pauseAvantAutoroute")
                : e.type === "nuit"
                  ? tr("ui.pageRoutesDuBled.nuitVide")
                  : tr("ui.pageRoutesDuBled.pauseVide")}
            </h3>
            <p className="rdb-step__text">
              {e.horsAxe
                ? tr("ui.pageRoutesDuBled.pauseAvantTexte")
                : tr("ui.pageRoutesDuBled.etapeVideTexte", { route: routeName(e.route) })}
            </p>
          </>
        )}
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
      </div>
    </li>
  );
}

/** La route en Algérie après le port, coupée au plus près du village. */
function DzRoute({ chain, onAdd, port }: { chain: Chain; onAdd: () => void; port: string }) {
  const route = chain.segs[0]!.route;
  const cles = chain.stops
    .filter(
      (s) =>
        s.km > 3 && (s.k === "carburant" || s.k === "aire" || s.k === "priere" || s.k === "manger"),
    )
    .filter((s, i, all) => all.findIndex((x) => x.k === s.k) === i || s.src !== "osm")
    .slice(0, 4);
  return (
    <li className="rdb-step" data-type="dz" data-empty={!cles.length || undefined}>
      <span className="rdb-step__marker" aria-hidden>
        <Coffee className="size-5" />
      </span>
      <div className="rdb-step__card">
        <p className="rdb-step__when">
          {tr("ui.pageRoutesDuBled.apresLePort", { port: portDe(port) })}
        </p>
        <h3 className="rdb-step__title">{routeName(route)}</h3>
        <p className="rdb-step__text">
          {tr("ui.pageRoutesDuBled.resumeCourt", { km: fmt(chain.km), duree: dureeRonde(chain.h) })}
        </p>
        {cles.length ? (
          <ul className="rdb-near">
            {cles.map((s) => (
              <li key={s.id}>
                <KindIcon kind={s.k} className="size-4" />
                <span className="min-w-0 flex-1">
                  {stopName(s)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {tr("ui.pageRoutesDuBled.apresDeRoute", {
                      duree: dureeRonde((route.h * s.km) / route.km),
                    })}
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
        ) : (
          <p className="rdb-step__text">{tr("ui.pageRoutesDuBled.dzVide")}</p>
        )}
        <button type="button" className="rdb-add" onClick={onAdd}>
          <Plus className="size-3.5" aria-hidden />
          {tr("ui.pageRoutesDuBled.ajouterSurCetteRoute")}
        </button>
      </div>
    </li>
  );
}
