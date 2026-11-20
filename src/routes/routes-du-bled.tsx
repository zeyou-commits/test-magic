import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Navigation, Plus } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteLayout";
import { Breadcrumbs, FaqSection } from "@/components/editorial/Editorial";
import { Bw504Button, Bw504Note, BwKnow } from "@/components/companion/Bw504Note";
import { AddStopDialog, emptyDraft, type Draft } from "@/components/routesDuBled/AddStopDialog";
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
  FILTERS,
  KIND_COLOR,
  formatDuration,
  loadCommunityStops,
  loadRoutesData,
  mapsLink,
  matchFilter,
  mergeCommunity,
  type BledRoute,
  type Filter,
  type Stop,
} from "@/lib/routesDuBled/data";
import "@/routes-du-bled.css";

const RoutesMap = lazy(() => import("@/components/routesDuBled/RoutesMap"));

export const Route = createFileRoute("/routes-du-bled")({
  head: () =>
    seoHead(
      "Routes du bled : itinéraires et haltes vers les ports et en Algérie | BledWay",
      "Les grands itinéraires en voiture vers Marseille, Sète, Barcelone, Valence, Alicante et Almería, puis en Algérie après le port : aires, carburant, manger halal, prier, dormir.",
      "/routes-du-bled",
    ),
  component: RoutesDuBledPage,
});

const fmt = (n: number) => n.toLocaleString("fr-FR");

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
  const [routeId, setRouteId] = useState("E2");
  const [filter, setFilter] = useState<Filter>("tout");
  const [openStop, setOpenStop] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("E2"));
  const mapBox = useRef<HTMLDivElement>(null);

  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const allStops = useMemo(
    () => (route ? mergeCommunity(route, community.data ?? []) : []),
    [route, community.data],
  );
  const stops = allStops.filter((s) => matchFilter(s, filter));
  const totals = useMemo(() => {
    const km = routes.reduce((a, r) => a + r.km, 0);
    const n = routes.reduce((a, r) => a + r.stops.length, 0) + (community.data?.length ?? 0);
    return { km, n };
  }, [routes, community.data]);

  useEffect(() => {
    if (!openStop) return;
    document
      .getElementById(`halte-${openStop}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openStop]);

  const chooseRoute = (id: string) => {
    setRouteId(id);
    setOpenStop(null);
    setFilter("tout");
    setDraft((d) => ({ ...d, route: id }));
  };
  const startAdd = () => {
    setDraft((d) => ({ ...d, route: route?.id ?? d.route }));
    setAdding(true);
  };
  const startPick = () => {
    setAdding(false);
    setPicking(true);
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const groups: { side: BledRoute["side"]; title: string; hint: string }[] = [
    {
      side: "europe",
      title: tr("ui.pageRoutesDuBled.groupeEurope"),
      hint: tr("ui.pageRoutesDuBled.groupeEuropeAide"),
    },
    {
      side: "algerie",
      title: tr("ui.pageRoutesDuBled.groupeAlgerie"),
      hint: tr("ui.pageRoutesDuBled.groupeAlgerieAide"),
    },
  ];

  const faq = [
    { q: tr("ui.pageRoutesDuBled.faq1Q"), a: tr("ui.pageRoutesDuBled.faq1A") },
    { q: tr("ui.pageRoutesDuBled.faq2Q"), a: tr("ui.pageRoutesDuBled.faq2A") },
    { q: tr("ui.pageRoutesDuBled.faq3Q"), a: tr("ui.pageRoutesDuBled.faq3A") },
    { q: tr("ui.pageRoutesDuBled.faq4Q"), a: tr("ui.pageRoutesDuBled.faq4A") },
  ];

  return (
    <>
      <SiteHeader />
      <main className="rdb mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
        <Breadcrumbs
          items={[{ name: tr("ui.pageRoutesDuBled.titreCourt"), path: "/routes-du-bled" }]}
        />

        <header className="rdb-hero">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">
              {tr("ui.pageRoutesDuBled.surtitre")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              {tr("ui.pageRoutesDuBled.titre")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {tr("ui.pageRoutesDuBled.intro")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="rdb-cta" onClick={startAdd}>
                <Plus className="size-4" aria-hidden />
                {tr("ui.pageRoutesDuBled.ajouterUneHalte")}
              </button>
            </div>
          </div>
          <dl className="rdb-stats">
            <div>
              <dt>{tr("ui.pageRoutesDuBled.statRoutes")}</dt>
              <dd>{routes.length || "…"}</dd>
            </div>
            <div>
              <dt>{tr("ui.pageRoutesDuBled.statKm")}</dt>
              <dd>{totals.km ? fmt(totals.km) : "…"}</dd>
            </div>
            <div>
              <dt>{tr("ui.pageRoutesDuBled.statHaltes")}</dt>
              <dd>{totals.n ? fmt(totals.n) : "…"}</dd>
            </div>
          </dl>
        </header>

        {data.isError ? (
          <Bw504Note
            tone="stuck"
            className="mt-10"
            title={tr("ui.pageRoutesDuBled.erreurChargement")}
          >
            {(data.error as Error).message}
          </Bw504Note>
        ) : null}

        <section
          className="mt-10 grid gap-8"
          aria-label={tr("ui.pageRoutesDuBled.choisirUneRoute")}
        >
          {groups.map((g) => (
            <div key={g.side}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold sm:text-2xl">{g.title}</h2>
                <p className="text-sm text-muted-foreground">{g.hint}</p>
              </div>
              <div className="rdb-routes mt-4">
                {routes
                  .filter((r) => r.side === g.side)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="rdb-route"
                      aria-pressed={r.id === route?.id}
                      onClick={() => chooseRoute(r.id)}
                    >
                      <span className="rdb-route__code">{r.id}</span>
                      <span className="rdb-route__name">{r.name}</span>
                      <span className="rdb-route__meta">
                        {fmt(r.km)} km · {formatDuration(r.h)}
                      </span>
                      <span className="rdb-route__count">
                        {r.releve
                          ? tr("ui.pageRoutesDuBled.nbHaltes", { n: r.stops.length })
                          : tr("ui.pageRoutesDuBled.releveEnCours")}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>

        {route ? (
          <section className="rdb-main mt-10" aria-labelledby="rdb-route-title">
            <div className="rdb-mapcol" ref={mapBox}>
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
                    <div className="rdb-map__wait">{tr("ui.pageRoutesDuBled.chargementCarte")}</div>
                  }
                >
                  <RoutesMap
                    routes={routes}
                    selectedId={route.id}
                    stops={stops}
                    selectedStopId={openStop}
                    onSelectRoute={chooseRoute}
                    onSelectStop={(id) => setOpenStop(id)}
                    picking={picking}
                    onPick={(lon, lat) => {
                      setDraft((d) => ({ ...d, coords: { lat, lon } }));
                      setPicking(false);
                      setAdding(true);
                    }}
                  />
                </Suspense>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {tr("ui.pageRoutesDuBled.legende")}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">
                {route.side === "europe"
                  ? tr("ui.pageRoutesDuBled.jusquAuPort")
                  : tr("ui.pageRoutesDuBled.apresLePort")}
              </p>
              <h2 id="rdb-route-title" className="mt-1 font-display text-2xl font-bold">
                {route.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("ui.pageRoutesDuBled.resumeRoute", {
                  km: fmt(route.km),
                  duree: formatDuration(route.h),
                  via: route.via.join(" · "),
                })}
              </p>

              <div
                className="rdb-filters mt-5"
                role="toolbar"
                aria-label={tr("ui.pageRoutesDuBled.filtrer")}
              >
                {FILTERS.map((f) => {
                  const n = allStops.filter((s) => matchFilter(s, f)).length;
                  return (
                    <button
                      key={f}
                      type="button"
                      className="rdb-chip"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {filterLabel(f)} <span className="opacity-60">{n}</span>
                    </button>
                  );
                })}
              </div>

              {!route.releve ? (
                <Bw504Note
                  tone="start"
                  className="mt-5"
                  title={tr("ui.pageRoutesDuBled.routeSansReleveTitre")}
                  actions={
                    <Bw504Button primary onClick={startAdd}>
                      {tr("ui.pageRoutesDuBled.ajouterUneHalte")}
                    </Bw504Button>
                  }
                >
                  {tr("ui.pageRoutesDuBled.routeSansReleveTexte")}
                </Bw504Note>
              ) : null}

              <ol className="rdb-stops mt-5">
                {stops.map((s) => (
                  <StopRow
                    key={s.id}
                    stop={s}
                    open={openStop === s.id}
                    onToggle={() => setOpenStop(openStop === s.id ? null : s.id)}
                  />
                ))}
              </ol>
              {route.releve && !stops.length ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {tr("ui.pageRoutesDuBled.aucuneHalteFiltre")}
                </p>
              ) : null}

              <BwKnow className="mt-6" source={tr("ui.pageRoutesDuBled.sourcesOsm")}>
                {tr("ui.pageRoutesDuBled.bonASavoir")}
              </BwKnow>
            </div>
          </section>
        ) : data.isPending ? (
          <p className="mt-10 text-sm text-muted-foreground">
            {tr("ui.pageRoutesDuBled.chargement")}
          </p>
        ) : null}

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

function filterLabel(f: Filter) {
  switch (f) {
    case "tout":
      return tr("ui.pageRoutesDuBled.filtreTout");
    case "plein":
      return tr("ui.pageRoutesDuBled.filtrePlein");
    case "manger":
      return tr("ui.pageRoutesDuBled.filtreManger");
    case "priere":
      return tr("ui.pageRoutesDuBled.filtrePriere");
    case "dormir":
      return tr("ui.pageRoutesDuBled.filtreDormir");
    case "communaute":
      return tr("ui.pageRoutesDuBled.filtreCommunaute");
  }
}

function StopRow({ stop, open, onToggle }: { stop: Stop; open: boolean; onToggle: () => void }) {
  return (
    <li
      id={`halte-${stop.id}`}
      className="rdb-stop"
      data-open={open || undefined}
      data-src={stop.src}
      style={{ ["--k" as string]: KIND_COLOR[stop.k] }}
    >
      <span className="rdb-stop__bubble" aria-hidden>
        <KindIcon kind={stop.k} className="size-[18px]" />
      </span>
      <div className="rdb-stop__card">
        <button type="button" className="rdb-stop__head" aria-expanded={open} onClick={onToggle}>
          <span className="rdb-stop__km">km {fmt(stop.km)}</span>
          <span className="rdb-stop__name">{stop.n}</span>
          <span className="rdb-stop__kind">
            {kindLabel(stop.k)}
            {stop.src !== "osm" ? ` · ${sourceLabel(stop.src)}` : ""}
          </span>
          <ChevronDown className="rdb-stop__chev size-4" aria-hidden />
        </button>
        {stop.f.length ? (
          <ul className="rdb-stop__tags">
            {stop.f.map((f) => (
              <li key={f}>
                <FeatureIcon feature={f} />
                {featureLabel(f)}
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <div className="rdb-stop__more">
            {stop.note ? <p>{stop.note}</p> : null}
            {stop.place ? <p className="text-muted-foreground">{stop.place}</p> : null}
            {stop.direction && stop.direction !== "both" ? (
              <p className="text-muted-foreground">
                {stop.direction === "aller"
                  ? tr("ui.pageRoutesDuBled.sensAllerSeul")
                  : tr("ui.pageRoutesDuBled.sensRetourSeul")}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {sourceLabel(stop.src)}
              {stop.date ? ` · ${stop.date}` : ""}
              {stop.url ? (
                <>
                  {" · "}
                  <a
                    href={stop.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {tr("ui.pageRoutesDuBled.voirLaSource")}
                    <ExternalLink className="ml-1 inline size-3" aria-hidden />
                  </a>
                </>
              ) : null}
            </p>
            <a className="rdb-go" href={mapsLink(stop)} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4" aria-hidden />
              {tr("ui.pageRoutesDuBled.yAller")}
            </a>
          </div>
        ) : null}
      </div>
    </li>
  );
}
