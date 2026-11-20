import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  ChevronDown,
  Coffee,
  Map as MapIcon,
  MoonStar,
  Navigation,
  Plus,
  Ship,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { Bw504Button, Bw504Note, BwKnow } from "@/components/companion/Bw504Note";
import { AddStopDialog, emptyDraft, type Draft } from "@/components/routesDuBled/AddStopDialog";
import type { MapLine, MapPin } from "@/components/routesDuBled/RoutesMap";
import {
  FeatureIcon,
  KindIcon,
  featureLabel,
  kindLabel,
  sourceLabel,
} from "@/components/routesDuBled/StopVisuals";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
import {
  KIND_COLOR,
  loadCommunityStops,
  loadRoutesData,
  mapsLink,
  mergeCommunity,
  type BledRoute,
} from "@/lib/routesDuBled/data";
import {
  anonyme,
  buildChain,
  DEPARTS,
  dureeRonde,
  ecartKm,
  LIGNES,
  PAUSE_MIN,
  PLACE_NAME,
  planEtapes,
  portsFrom,
  ROUTES_DZ,
  variants,
  type Chain,
  type ChainStop,
  type Depart,
  type Etape,
  type Port,
  type PortDz,
} from "@/lib/routesDuBled/trajets";
import "@/routes-du-bled.css";

const RoutesMap = lazy(() => import("@/components/routesDuBled/RoutesMap"));

export const Route = createFileRoute("/routes-du-bled")({
  head: () =>
    seoHead(
      "Routes du bled : ton trajet en voiture jusqu'au port, étape par étape | BledWay",
      "Choisis ton départ et ton port (Marseille, Sète, Barcelone, Valence, Alicante, Almería) : pauses toutes les 2 h, où faire le plein, manger, prier et dormir, puis la route en Algérie après le port.",
      "/routes-du-bled",
    ),
  component: RoutesDuBledPage,
});

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const STORE = "bw-routes-du-bled";
const EXEMPLES: [Depart, Port][] = [
  ["lyon", "alicante"],
  ["paris", "marseille"],
  ["paris", "almeria"],
  ["montpellier", "sete"],
];

/** Nom affiché d'une halte, même quand OpenStreetMap ne lui en donne pas. */
const stopName = (s: ChainStop) => {
  if (!anonyme(s)) return s.n;
  if (s.k === "priere") return tr("ui.pageRoutesDuBled.sansNomPriere");
  if (s.k === "dormir") return tr("ui.pageRoutesDuBled.sansNomHotel");
  if (s.k === "aire") return tr("ui.pageRoutesDuBled.sansNomAire");
  return kindLabel(s.k);
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
  const routes = useMemo(() => data.data?.routes ?? [], [data.data]);

  const [from, setFrom] = useState<Depart | null>(null);
  const [port, setPort] = useState<Port | null>(null);
  const [variant, setVariant] = useState(0);
  const [dz, setDz] = useState<PortDz | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("E2"));

  // Un lien ?depart=lyon&port=alicante ouvre ce trajet ; sinon le dernier trajet choisi
  // revient à la visite suivante (sur cet appareil seulement).
  useEffect(() => {
    let saved: { from?: Depart; port?: Port } | null = null;
    const q = new URLSearchParams(window.location.search);
    if (q.get("depart")) saved = { from: q.get("depart") as Depart, port: q.get("port") as Port };
    else
      try {
        saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as typeof saved;
      } catch {
        /* stockage indisponible : on part de zéro */
      }
    if (saved?.from && DEPARTS.includes(saved.from)) setFrom(saved.from);
    if (saved?.from && saved.port && portsFrom(saved.from).includes(saved.port))
      setPort(saved.port);
  }, []);
  useEffect(() => {
    if (!from) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ from, port }));
    } catch {
      /* rien à faire */
    }
  }, [from, port]);

  const stopsOf = useMemo(() => {
    const rows = community.data ?? [];
    return (r: BledRoute) => mergeCommunity(r, rows);
  }, [community.data]);

  const options = from && port ? variants(from, port) : [];
  const def = options[Math.min(variant, options.length - 1)];
  const chain = useMemo(
    () =>
      def && routes.length
        ? buildChain(`${def.from}-${def.port}-${def.via ?? ""}`, def.legs, routes, stopsOf)
        : null,
    [def, routes, stopsOf],
  );
  const etapes = useMemo(() => (chain ? planEtapes(chain) : []), [chain]);
  const portStop = chain?.stops.filter((s) => s.k === "port" || s.k === "billets").at(-1) ?? null;
  const nPauses = etapes.filter((e) => e.type === "pause").length;
  const nNuits = etapes.length - nPauses;

  const dzOptions = port ? LIGNES[port] : [];
  const dzChains = useMemo(() => {
    if (!dz) return [];
    return ROUTES_DZ[dz]
      .map((id) => buildChain(id, [{ route: id }], routes, stopsOf))
      .filter((c): c is Chain => Boolean(c));
  }, [dz, routes, stopsOf]);

  const choose = (f: Depart, p: Port | null) => {
    setFrom(f);
    setPort(p && portsFrom(f).includes(p) ? p : null);
    setVariant(0);
    setDz(null);
    setFocusId(null);
  };

  const startAdd = (routeId?: string) => {
    setDraft((d) => ({ ...d, route: routeId ?? chain?.segs[0]?.route.id ?? d.route }));
    setAdding(true);
  };
  const startPick = () => {
    setAdding(false);
    setPicking(true);
    setMapOpen(true);
    requestAnimationFrame(() =>
      document.getElementById("rdb-map")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  const focusEtape = (id: string) => {
    setFocusId(id);
    document.getElementById(`etape-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Carte : le trajet en avant, les autres routes en fond, une pastille par étape.
  const mapLines = useMemo<MapLine[]>(() => {
    const bg = routes.map((r) => ({
      id: r.id,
      coords: r.line.map(([lon, lat]) => [lon, lat] as [number, number]),
      active: false,
    }));
    const active = [chain, ...dzChains]
      .filter((c): c is Chain => Boolean(c))
      .map((c) => ({ id: `t-${c.key}`, coords: c.line, active: true }));
    return [...bg, ...active];
  }, [routes, chain, dzChains]);
  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];
    etapes.forEach((e) => {
      if (e.best)
        pins.push({
          id: e.id,
          lat: e.best.lat,
          lon: e.best.lon,
          k: e.type === "nuit" ? "dormir" : e.best.k,
          label: e.type === "nuit" ? "" : String(e.n),
          main: true,
        });
      if (e.id === focusId)
        [...e.others, ...e.priere, ...e.manger].forEach((s) =>
          pins.push({ id: e.id, lat: s.lat, lon: s.lon, k: s.k, main: false }),
        );
    });
    if (portStop)
      pins.push({
        id: "port",
        lat: portStop.lat,
        lon: portStop.lon,
        k: "port",
        label: "",
        main: true,
      });
    return pins;
  }, [etapes, focusId, portStop]);
  const focus = (() => {
    const e = etapes.find((x) => x.id === focusId);
    return e?.best ? { lat: e.best.lat, lon: e.best.lon } : null;
  })();

  const faq = [
    { q: tr("ui.pageRoutesDuBled.faq1Q"), a: tr("ui.pageRoutesDuBled.faq1A") },
    { q: tr("ui.pageRoutesDuBled.faq2Q"), a: tr("ui.pageRoutesDuBled.faq2A") },
    { q: tr("ui.pageRoutesDuBled.faq3Q"), a: tr("ui.pageRoutesDuBled.faq3A") },
    { q: tr("ui.pageRoutesDuBled.faq4Q"), a: tr("ui.pageRoutesDuBled.faq4A") },
  ];

  return (
    <>
      <SiteHeader />
      <main className="rdb mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-12">
        <Breadcrumbs
          items={[{ name: tr("ui.pageRoutesDuBled.titreCourt"), path: "/routes-du-bled" }]}
        />

        <header className="rdb-hero">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">
            {tr("ui.pageRoutesDuBled.surtitre")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            {tr("ui.pageRoutesDuBled.titre")}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {tr("ui.pageRoutesDuBled.intro")}
          </p>

          <div className="rdb-chooser">
            <label className="rdb-field">
              <span>{tr("ui.pageRoutesDuBled.tuParsDe")}</span>
              <select value={from ?? ""} onChange={(e) => choose(e.target.value as Depart, port)}>
                <option value="" disabled>
                  {tr("ui.pageRoutesDuBled.choisir")}
                </option>
                {DEPARTS.map((d) => (
                  <option key={d} value={d}>
                    {PLACE_NAME[d]}
                  </option>
                ))}
              </select>
            </label>
            <span className="rdb-chooser__arrow" aria-hidden>
              →
            </span>
            <label className="rdb-field">
              <span>{tr("ui.pageRoutesDuBled.tuEmbarquesA")}</span>
              <select
                value={port ?? ""}
                disabled={!from}
                onChange={(e) => {
                  setPort(e.target.value as Port);
                  setVariant(0);
                  setDz(null);
                  setFocusId(null);
                }}
              >
                <option value="" disabled>
                  {from
                    ? tr("ui.pageRoutesDuBled.choisirLePort")
                    : tr("ui.pageRoutesDuBled.dabordLeDepart")}
                </option>
                {(from ? portsFrom(from) : []).map((p) => (
                  <option key={p} value={p}>
                    {PLACE_NAME[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!chain ? (
            <div className="mt-5">
              <p className="text-sm font-semibold">{tr("ui.pageRoutesDuBled.exemples")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXEMPLES.map(([f, p]) => (
                  <button
                    key={`${f}-${p}`}
                    type="button"
                    className="rdb-chip"
                    onClick={() => choose(f, p)}
                  >
                    {PLACE_NAME[f]} → {PLACE_NAME[p]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        {data.isError ? (
          <Bw504Note
            tone="stuck"
            className="mt-8"
            title={tr("ui.pageRoutesDuBled.erreurChargement")}
          >
            {(data.error as Error).message}
          </Bw504Note>
        ) : data.isPending && from && port ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {tr("ui.pageRoutesDuBled.chargement")}
          </p>
        ) : null}

        {chain && def ? (
          <section className="rdb-trip mt-8" aria-labelledby="rdb-trip-title">
            <div className="rdb-trip__head">
              {options.length > 1 ? (
                <div
                  className="rdb-variants"
                  role="tablist"
                  aria-label={tr("ui.pageRoutesDuBled.parOuPasser")}
                >
                  {options.map((o, i) => (
                    <button
                      key={o.via ?? i}
                      type="button"
                      role="tab"
                      aria-selected={i === variant}
                      onClick={() => {
                        setVariant(i);
                        setFocusId(null);
                      }}
                    >
                      {o.via === "madrid"
                        ? tr("ui.pageRoutesDuBled.parMadrid")
                        : tr("ui.pageRoutesDuBled.parLaCote")}
                    </button>
                  ))}
                </div>
              ) : null}
              <h2 id="rdb-trip-title" className="font-display text-2xl font-bold sm:text-3xl">
                {PLACE_NAME[def.from]} → {PLACE_NAME[def.port]}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {nPauses
                  ? tr("ui.pageRoutesDuBled.resumeTrajet", {
                      km: fmt(chain.km),
                      route: dureeRonde(chain.h),
                      total: dureeRonde(chain.h + (nPauses * PAUSE_MIN) / 60),
                      pauses: nPauses,
                    })
                  : tr("ui.pageRoutesDuBled.resumeTrajetSansPause", {
                      km: fmt(chain.km),
                      route: dureeRonde(chain.h),
                    })}
                {nNuits === 1 ? ` ${tr("ui.pageRoutesDuBled.resumeNuit1")}` : ""}
                {nNuits > 1 ? ` ${tr("ui.pageRoutesDuBled.resumeNuits", { n: nNuits })}` : ""}
              </p>

              <ol className="rdb-frise" aria-label={tr("ui.pageRoutesDuBled.friseAria")}>
                <li data-type="depart">
                  <span className="rdb-frise__dot" aria-hidden>
                    <img src="/cabas/persos/voiture_504.webp" alt="" width={30} height={30} />
                  </span>
                  <span className="rdb-frise__t">{PLACE_NAME[def.from]}</span>
                </li>
                {etapes.map((e) => (
                  <li key={e.id} data-type={e.type} data-empty={!e.best || undefined}>
                    <button
                      type="button"
                      onClick={() => focusEtape(e.id)}
                      aria-label={etapeTitle(e)}
                    >
                      <span className="rdb-frise__dot" aria-hidden>
                        {e.type === "nuit" ? (
                          <MoonStar className="size-4" />
                        ) : (
                          <Coffee className="size-4" />
                        )}
                      </span>
                      <span className="rdb-frise__t">{dureeRonde(e.h)}</span>
                    </button>
                  </li>
                ))}
                <li data-type="port">
                  <span className="rdb-frise__dot" aria-hidden>
                    <Anchor className="size-4" />
                  </span>
                  <span className="rdb-frise__t">{PLACE_NAME[def.port]}</span>
                </li>
              </ol>

              {chain.sansReleve.length ? (
                <p className="rdb-gap">
                  {tr("ui.pageRoutesDuBled.sansReleve", {
                    routes: chain.sansReleve.map((r) => r.name.replace(/ \(.*\)$/, "")).join(", "),
                  })}{" "}
                  <button type="button" onClick={() => startAdd(chain.sansReleve[0]!.id)}>
                    {tr("ui.pageRoutesDuBled.ajouterLaTienne")}
                  </button>
                </p>
              ) : null}
            </div>

            <div className="rdb-trip__body">
              <div className="rdb-mapcol" id="rdb-map" data-open={mapOpen || picking || undefined}>
                <button
                  type="button"
                  className="rdb-maptoggle"
                  aria-expanded={mapOpen || picking}
                  onClick={() => setMapOpen((o) => !o)}
                >
                  <MapIcon className="size-4" aria-hidden />
                  {mapOpen
                    ? tr("ui.pageRoutesDuBled.masquerLaCarte")
                    : tr("ui.pageRoutesDuBled.voirLaCarte")}
                </button>
                {picking ? (
                  <Bw504Note
                    tone="start"
                    className="mb-3"
                    title={tr("ui.pageRoutesDuBled.toucheLaCarte")}
                    actions={
                      <Bw504Button
                        onClick={() => {
                          setPicking(false);
                          setAdding(true);
                        }}
                      >
                        {tr("ui.pageRoutesDuBled.annuler")}
                      </Bw504Button>
                    }
                  />
                ) : null}
                <div className="rdb-map" data-picking={picking || undefined}>
                  <Suspense
                    fallback={
                      <div className="rdb-map__wait">
                        {tr("ui.pageRoutesDuBled.chargementCarte")}
                      </div>
                    }
                  >
                    <RoutesMap
                      lines={mapLines}
                      pins={mapPins}
                      focus={focus}
                      fitKey={chain.key + (dz ?? "")}
                      onSelectPin={(id) => (id === "port" ? undefined : focusEtape(id))}
                      picking={picking}
                      onPick={(lon, lat) => {
                        setDraft((d) => ({ ...d, coords: { lat, lon } }));
                        setPicking(false);
                        setAdding(true);
                      }}
                    />
                  </Suspense>
                </div>
              </div>

              <ol className="rdb-road">
                <li className="rdb-step" data-type="depart">
                  <span className="rdb-step__marker" aria-hidden>
                    <img src="/cabas/persos/voiture_504.webp" alt="" width={40} height={40} />
                  </span>
                  <div className="rdb-step__card">
                    <p className="rdb-step__when">{tr("ui.pageRoutesDuBled.depart")}</p>
                    <h3 className="rdb-step__title">{PLACE_NAME[def.from]}</h3>
                    <p className="rdb-step__text">
                      {tr("ui.pageRoutesDuBled.departConseil")}{" "}
                      <Link to="/preparer-mon-voyage" className="underline underline-offset-2">
                        {tr("ui.pageRoutesDuBled.preparerLien")}
                      </Link>
                    </p>
                  </div>
                </li>

                {etapes.map((e) => (
                  <EtapeCard
                    key={e.id}
                    etape={e}
                    focused={focusId === e.id}
                    onFocus={() => setFocusId(e.id)}
                    onAdd={() => startAdd(e.route.id)}
                  />
                ))}

                <li className="rdb-step" data-type="port">
                  <span className="rdb-step__marker" aria-hidden>
                    <Ship className="size-5" />
                  </span>
                  <div className="rdb-step__card">
                    <p className="rdb-step__when">
                      {tr("ui.pageRoutesDuBled.arriveeApres", {
                        duree: dureeRonde(chain.h + (nPauses * PAUSE_MIN) / 60),
                      })}
                    </p>
                    <h3 className="rdb-step__title">
                      {tr("ui.pageRoutesDuBled.portDe", { port: PLACE_NAME[def.port] })}
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
              </ol>
            </div>

            <section className="rdb-dz mt-10" aria-labelledby="rdb-dz-title">
              <h2 id="rdb-dz-title" className="font-display text-xl font-bold sm:text-2xl">
                {tr("ui.pageRoutesDuBled.apresLePortTitre")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("ui.pageRoutesDuBled.apresLePortAide", { port: PLACE_NAME[def.port] })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dzOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rdb-chip"
                    aria-pressed={dz === p}
                    onClick={() => setDz(dz === p ? null : p)}
                  >
                    <Ship className="size-3.5" aria-hidden />
                    {PLACE_NAME[p]}
                  </button>
                ))}
              </div>
              {dz ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {dzChains.map((c) => (
                    <DzRoute key={c.key} chain={c} onAdd={() => startAdd(c.key)} />
                  ))}
                </div>
              ) : null}
            </section>
          </section>
        ) : null}

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
              {e.type === "nuit"
                ? tr("ui.pageRoutesDuBled.nuitVide")
                : tr("ui.pageRoutesDuBled.pauseVide")}
            </h3>
            <p className="rdb-step__text">
              {tr("ui.pageRoutesDuBled.etapeVideTexte", {
                route: e.route.name.replace(/ \(.*\)$/, ""),
              })}
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

/** Une route en Algérie après le port : courte, donc on montre ses haltes clés sans découpage. */
function DzRoute({ chain, onAdd }: { chain: Chain; onAdd: () => void }) {
  const route = chain.segs[0]!.route;
  const etapes = planEtapes(chain);
  const cles = chain.stops
    .filter(
      (s) =>
        s.km > 3 && (s.k === "carburant" || s.k === "aire" || s.k === "priere" || s.k === "manger"),
    )
    .filter((s, i, all) => all.findIndex((x) => x.k === s.k) === i || s.src !== "osm")
    .slice(0, 4);
  return (
    <article className="rdb-dzcard">
      <h3 className="font-display text-lg font-bold">{route.name.replace(/ \(.*\)$/, "")}</h3>
      <p className="text-sm text-muted-foreground">
        {tr("ui.pageRoutesDuBled.resumeCourt", { km: fmt(chain.km), duree: dureeRonde(chain.h) })}
        {etapes.length === 1 ? ` · ${tr("ui.pageRoutesDuBled.resumePause1")}` : ""}
        {etapes.length > 1
          ? ` · ${tr("ui.pageRoutesDuBled.resumePauses", { n: etapes.length })}`
          : ""}
      </p>
      {cles.length ? (
        <ul className="rdb-near mt-2">
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
        <p className="mt-2 text-sm">{tr("ui.pageRoutesDuBled.dzVide")}</p>
      )}
      <button type="button" className="rdb-add" onClick={onAdd}>
        <Plus className="size-3.5" aria-hidden />
        {tr("ui.pageRoutesDuBled.ajouterSurCetteRoute")}
      </button>
    </article>
  );
}
