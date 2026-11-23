import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BedDouble,
  Fuel,
  Navigation,
  Ship,
  Signpost,
  UtensilsCrossed,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { Bw504Button, Bw504Note, BwKnow } from "@/components/companion/Bw504Note";
import { AddStopDialog, emptyDraft, type Draft } from "@/components/routesDuBled/AddStopDialog";
import { PlaceField } from "@/components/routesDuBled/PlaceField";
import type { MapLine, MapPin, MapPlace } from "@/components/routesDuBled/RoutesMap";
import { Mosque } from "@/components/routesDuBled/StopVisuals";
import { RouteCard, courte, duree } from "@/components/routesDuBled/RouteCard";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
import { calculateRoadGeometry, measureBledLegs } from "@/lib/ferry/itinerary.functions";
import { useAuth } from "@/hooks/useAuth";
import {
  loadCommunityStops,
  loadMyStops,
  locateOnRoute,
  loadDureesMer,
  loadRoutesData,
  mergeCommunity,
  type BledRoute,
  type StopKind,
} from "@/lib/routesDuBled/data";
import { PLACE_NAME, type Chain, type ChainStop } from "@/lib/routesDuBled/trajets";
import { carnet, viaVilles, type Ajout, type Carnet, type Pas } from "@/lib/routesDuBled/carnet";
import { REGLAGES_DEFAUT, type Reglages } from "@/lib/routesDuBled/budget";
import {
  chemins,
  cleBout,
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
import { takeRoutesSeed } from "@/lib/routesDuBled/lien";
import "@/routes-du-bled.css";

const RoutesMap = lazy(() => import("@/components/routesDuBled/RoutesMap"));

export const Route = createFileRoute("/routes-du-bled")({
  head: () =>
    seoHead(
      "Routes du bled : votre trajet en voiture jusqu'au bled, porte à porte | BledWay",
      "Partez de votre adresse ou de votre position, choisissez votre village en Algérie : la carte trace votre trajet jusqu'au port puis au bled, avec les pauses, où manger, prier et dormir.",
      "/routes-du-bled",
    ),
  component: RoutesDuBledPage,
});

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const STORE = "bw-routes-du-bled-v3";
const BUDGET_KEY = "bw-routes-budget-v1";
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
/** Les services qu'on peut afficher sur la carte. La prière d'abord, cochée d'entrée. */
type Service = "priere" | "halal" | "carburant" | "manger" | "aire" | "dormir";
const SERVICES: { id: Service; icon: typeof Fuel; label: string }[] = [
  { id: "priere", icon: Mosque, label: "svcPriere" },
  { id: "halal", icon: UtensilsCrossed, label: "svcHalal" },
  { id: "carburant", icon: Fuel, label: "svcCarburant" },
  { id: "manger", icon: UtensilsCrossed, label: "svcManger" },
  { id: "aire", icon: Signpost, label: "svcAire" },
  { id: "dormir", icon: BedDouble, label: "svcDormir" },
];
const offre = (s: ChainStop, svc: Service) =>
  svc === "halal"
    ? s.f.includes("halal")
    : svc === "priere"
      ? s.k === "priere" || s.f.includes("priere")
      : s.k === svc;
const PIN_KIND: Partial<Record<Pas["k"], StopKind>> = {
  priere: "priere",
  nuit: "dormir",
  nuitvide: "dormir",
};

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
  // Mes propositions : visibles tout de suite dans mon carnet, avant la relecture de l'équipe.
  const { user } = useAuth();
  const mine = useQuery({
    queryKey: ["routes-du-bled", "mine", user?.id],
    queryFn: loadMyStops,
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
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
  // Une seule route dépliée à la fois ; « null » : toutes repliées.
  const [openId, setOpenId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>(["priere"]);
  const [carAt, setCarAt] = useState<string | null>(null);
  // « Combien ça coûte ? » : rien n'est calculé tant que le voyageur ne le demande pas.
  const [prixDe, setPrixDe] = useState<Set<string>>(() => new Set());
  const [prixTous, setPrixTous] = useState(false);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT);
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(BUDGET_KEY) ?? "null") as Partial<Reglages> | null;
      if (r) setReglages({ ...REGLAGES_DEFAUT, ...r });
    } catch {
      /* stockage indisponible : réglages par défaut */
    }
  }, []);
  const changeReglages = (r: Reglages) => {
    setReglages(r);
    try {
      localStorage.setItem(BUDGET_KEY, JSON.stringify(r));
    } catch {
      /* rien à faire */
    }
  };

  // Un ancien lien ?depart=lyon part de cette ville ; sinon le dernier trajet revient
  // à la visite suivante (sur cet appareil seulement).
  useEffect(() => {
    // Venu de Préparer ou du menu avec un départ et une arrivée déjà connus.
    const seed = takeRoutesSeed();
    if (seed && (isLieu(seed.from) || isLieu(seed.to))) {
      if (isLieu(seed.from)) setFrom(seed.from);
      if (isLieu(seed.to)) setTo(seed.to);
      // Gardé aussi comme dernier trajet : un second passage de cet effet le relit.
      try {
        localStorage.setItem(
          STORE,
          JSON.stringify({
            from: isLieu(seed.from) ? seed.from : null,
            to: isLieu(seed.to) ? seed.to : null,
          }),
        );
      } catch {
        /* rien à faire */
      }
      return;
    }
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

  // Le carnet de chaque route affichée ; celui de la route choisie suit le vrai tracé.
  // Les lieux à poser dans le carnet : les miens (en attente, refusés, publiés), et ceux des voyageurs
  // publiés loin des routes relevées (la fin de route vers Tindouf, par exemple), que la route ne montre pas.
  const ajouts = useMemo<Ajout[]>(() => {
    const out: Ajout[] = [];
    const vus = new Set<string>();
    for (const r of user ? (mine.data ?? []) : []) {
      if (r.lat == null || r.lon == null) continue;
      vus.add(r.id);
      out.push({
        id: r.id,
        k: r.kind,
        n: r.name,
        place: r.place,
        lat: r.lat,
        lon: r.lon,
        f: r.features,
        etat: r.status === "pending" ? "attente" : r.status === "approved" ? "mien" : "refuse",
        note: r.decision_note,
      });
    }
    for (const r of community.data ?? []) {
      if (vus.has(r.id) || r.lat == null || r.lon == null) continue;
      const route = routes.find((x) => x.id === r.route_code);
      if (route && locateOnRoute(route, r.lon, r.lat).off <= 5) continue;
      out.push({
        id: r.id,
        k: r.kind,
        n: r.name,
        place: r.place,
        lat: r.lat,
        lon: r.lon,
        f: r.features,
        etat: "publie",
      });
    }
    return out;
  }, [user, mine.data, community.data, routes]);

  const carnets = useMemo(() => {
    const m = new Map<string, Carnet>();
    if (!from || !to) return m;
    for (const c of shown)
      m.set(
        c.id,
        carnet(
          c,
          from,
          to,
          c === sel ? { approche: geo.data?.toPort, fin: geo.data?.fromPort } : undefined,
          ajouts,
        ),
      );
    return m;
  }, [shown, sel, from, to, geo.data, ajouts]);
  const selCarnet = sel ? (carnets.get(sel.id) ?? null) : null;
  useEffect(() => {
    setOpenId(null);
    setCarAt(null);
  }, [from, to]);

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

  const startAdd = (routeId?: string, point?: LonLat | null) => {
    setDraft((d) => ({
      ...d,
      route: routeId ?? sel?.eu.chain?.segs[0]?.route.id ?? d.route,
      ...(point ? { coords: { lat: +point[1].toFixed(5), lon: +point[0].toFixed(5) } } : {}),
    }));
    setAdding(true);
  };
  const startPick = () => {
    setAdding(false);
    setPicking("halte");
    document.getElementById("rdb-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Toucher une étape sur la carte déplie la route et fait défiler le carnet jusqu'à elle.
  const focusPas = (id: string) => {
    if (sel) setOpenId(sel.id);
    setFocusId(id);
    // Téléphone : la carte reste collée en haut, l'étape vient juste sous elle (scroll-margin-top).
    const pc = window.matchMedia("(min-width: 1024px)").matches;
    setTimeout(
      () =>
        document
          .getElementById(`pas-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: pc ? "center" : "start" }),
      60,
    );
  };
  const selectRoute = (id: string) => {
    setSelId(id);
    setOpenId(id);
    setFocusId(null);
    setTimeout(
      () =>
        document.getElementById(`rc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60,
    );
  };
  // La 504 de la carte suit l'étape lue dans le carnet ouvert.
  const bookRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = bookRef.current;
    if (!root || !openId || openId !== sel?.id) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting);
        const top = vis.sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
        const id = (top?.target as HTMLElement | undefined)?.dataset["pas"];
        if (id) setCarAt(id);
      },
      // Téléphone : on lit sous la carte collée en haut, la ligne de lecture descend.
      {
        rootMargin: window.matchMedia("(min-width: 1024px)").matches
          ? "-35% 0px -45% 0px"
          : "-62% 0px -22% 0px",
      },
    );
    root.querySelectorAll("[data-pas]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [openId, sel, selCarnet]);

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
    if (!sel || !selCarnet) return pins;
    const main = new Set<string>();
    for (const p of selCarnet.pas) {
      if (p.ajout && p.ajout.etat !== "refuse") {
        pins.push({
          id: p.id,
          lat: p.point[1],
          lon: p.point[0],
          k: p.ajout.k,
          main: true,
          vide: false,
          attente: p.ajout.etat === "attente",
        });
        continue;
      }
      if (p.n == null) continue;
      const lieu =
        p.k === "priere" ? (p.priere ?? p.etape?.best ?? p.lieu) : (p.etape?.best ?? p.lieu);
      if (lieu) main.add(lieu.id);
      pins.push({
        id: p.id,
        lat: p.point[1],
        lon: p.point[0],
        k: PIN_KIND[p.k] ?? lieu?.k ?? "aire",
        label: String(p.n),
        main: true,
        vide: p.k === "vide" || p.k === "nuitvide",
      });
    }
    // Les services cochés, le long de la route choisie.
    if (services.length)
      for (const ch of [sel.eu.chain, sel.dz.chain])
        for (const s of ch?.stops ?? [])
          if (
            !main.has(s.id) &&
            s.k !== "billets" &&
            s.k !== "port" &&
            services.some((v) => offre(s, v))
          )
            pins.push({
              id: `s-${s.id}`,
              lat: s.lat,
              lon: s.lon,
              k: services.includes("priere") && offre(s, "priere") ? "priere" : s.k,
              main: false,
            });
    return pins;
  }, [sel, selCarnet, services]);
  const mapVilles = useMemo<MapPlace[]>(
    () =>
      (selCarnet?.pas ?? [])
        .filter((p) => p.k === "ville")
        .map((p) => ({ lon: p.point[0], lat: p.point[1], label: p.name ?? "" })),
    [selCarnet],
  );
  const carPas = carAt ? selCarnet?.pas.find((p) => p.id === carAt) : null;
  const car = useMemo(
    () => (carPas && carPas.k !== "depart" ? { lon: carPas.point[0], lat: carPas.point[1] } : null),
    [carPas],
  );
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
    const p = selCarnet?.pas.find((x) => x.id === focusId);
    return p ? { lat: p.point[1], lon: p.point[0] } : null;
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
      {/* Un trajet choisi : l'en-tête se replie pour laisser la place à la carte et aux routes. */}
      <main
        className="rdb mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 sm:pt-5"
        data-trip={from && to ? "" : undefined}
        data-book={from && to && openId ? "" : undefined}
      >
        <div className="rdb-crumbs">
          <Breadcrumbs
            items={[{ name: tr("ui.pageRoutesDuBled.titreCourt"), path: "/routes-du-bled" }]}
          />
        </div>

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
              {sel && from && to ? (
                <div
                  className="rdb-filters"
                  role="group"
                  aria-label={tr("ui.pageRoutesDuBled.filtresAria")}
                >
                  {SERVICES.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      className="rdb-filter"
                      data-k={id}
                      aria-pressed={services.includes(id)}
                      onClick={() =>
                        setServices((v) =>
                          v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
                        )
                      }
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {tr(`ui.pageRoutesDuBled.${label}` as never)}
                    </button>
                  ))}
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
                  villes={mapVilles}
                  car={car}
                  focus={focus}
                  fitKey={fitKey}
                  onSelectPin={(id) => {
                    if (!id.startsWith("s-")) focusPas(id);
                  }}
                  onSelectLine={(id) => {
                    if (!list.some((c) => c.id === id)) return;
                    // Un chemin pris parmi les ports cachés : on montre toute la liste.
                    if (!shown.some((c) => c.id === id)) setTous(true);
                    selectRoute(id);
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
                    <div className="rdb-panel__head">
                      <p className="rdb-panel__eyebrow">
                        {tr("ui.pageRoutesDuBled.tesRoutesDuBled")}
                      </p>
                      {shown.length > 1 ? (
                        <button
                          type="button"
                          className="rdb-prix-tous"
                          aria-pressed={prixTous}
                          onClick={() => setPrixTous(!prixTous)}
                        >
                          {tr(
                            prixTous
                              ? "ui.pageRoutesDuBled.masquerPrix"
                              : "ui.pageRoutesDuBled.comparerPrix",
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div className="rdb-rcs" ref={bookRef}>
                      {shown.map((c, i) => {
                        const k = carnets.get(c.id);
                        if (!k) return null;
                        const open = openId === c.id;
                        return (
                          <div
                            key={c.id}
                            id={`rc-${c.id}`}
                            data-sel={c === sel || undefined}
                            className="rdb-rcw"
                          >
                            <RouteCard
                              c={c}
                              k={k}
                              from={courte(from!.label)}
                              to={courte(to!.label)}
                              via={viaVilles(c, c === sel ? geo.data?.toPort : undefined)}
                              variante={viaDe(c, list)}
                              first={i === 0}
                              open={open}
                              onToggle={() => {
                                setSelId(c.id);
                                setFocusId(null);
                                setOpenId(open ? null : c.id);
                              }}
                              focusId={focusId}
                              onFocus={(p) => {
                                setSelId(c.id);
                                setFocusId(p.id);
                              }}
                              onAdd={(r, pt) => startAdd(r, pt)}
                              portStop={
                                c.eu.chain?.stops
                                  .filter((s) => s.k === "port" || s.k === "billets")
                                  .at(-1) ?? null
                              }
                              routes={routes}
                              showCost={prixTous || prixDe.has(c.id)}
                              onCost={() => setPrixDe((s) => new Set(s).add(c.id))}
                              reglages={reglages}
                              onReglages={changeReglages}
                              ligne={
                                dureesMer.data?.[`${c.eu.port}-${c.dz.port}`] != null
                                  ? `${c.eu.port}-${c.dz.port}`
                                  : null
                              }
                            />
                            {open ? <Manques c={c} onAdd={startAdd} /> : null}
                          </div>
                        );
                      })}
                    </div>
                    {caches.length && !tous ? (
                      <button type="button" className="rdb-autres" onClick={() => setTous(true)}>
                        {tr("ui.pageRoutesDuBled.autresChemins", { n: caches.length })}
                      </button>
                    ) : null}
                    <p className="rdb-panel__note">{tr("ui.pageRoutesDuBled.noteDurees")}</p>
                  </div>
                )}
              </aside>
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

/** « Par Madrid » ou « par la côte », quand deux chemins mènent aux mêmes ports. */
function viaDe(c: Chemin, all: Chemin[]): string | null {
  const twin = all.some((x) => x !== c && x.eu.port === c.eu.port && x.dz.port === c.dz.port);
  if (!twin || !c.eu.chain) return null;
  return c.eu.chain.segs.some((s) => s.route.id === "E5")
    ? tr("ui.pageRoutesDuBled.parMadrid")
    : tr("ui.pageRoutesDuBled.parLaCote");
}

/** Ce qui manque encore sur la route : routes sans relevé, longs bouts sans bon plan. */
function Manques({ c, onAdd }: { c: Chemin; onAdd: (routeId?: string) => void }) {
  const sansReleve = [...(c.eu.chain?.sansReleve ?? []), ...(c.dz.chain?.sansReleve ?? [])];
  if (!sansReleve.length && c.trousKm <= 0) return null;
  return (
    <div className="rdb-manques">
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
    </div>
  );
}
