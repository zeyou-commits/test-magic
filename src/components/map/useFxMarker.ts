import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { bringTooltipToFront } from "./tooltipStack";
import {
  FX_MAX_AGE_MS,
  FX_OFFICIAL_URL,
  FX_SOURCE_URL,
  fxMid,
  fxSymbol,
  fxTickerQuery,
  type FxQuote,
  type FxTicker,
} from "@/lib/fx/ticker";

/**
 * Taux de change posé sur l'Algérie : une étiquette compacte et secondaire (taille bornée en CSS),
 * cours officiel en tête et marché parallèle dessous. Au clic, 4 devises puis « voir plus ».
 * Chaque pays aura plus tard la sienne, à son propre emplacement.
 */
// Ancrée par le bas, au nord du Sahara : l'étiquette tient entre l'Atlas et la côte, et reste
// au-dessus du volet mobile en vue d'ensemble.
const ALGERIA_ANCHOR: [number, number] = [3.1, 33.2];
/** Au dézoom extrême (en deçà de la vue d'ensemble), l'étiquette se réduit à une ligne. */
const COMPACT_BELOW_ZOOM = 3.5;
const SHOWN_FIRST = 4;

const amount = (value: number) =>
  value.toLocaleString("fr-FR", { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 });

const amount2 = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
};

function quoteRow(body: HTMLTableSectionElement, quote: FxQuote) {
  const row = body.insertRow();
  const name = document.createElement("th");
  name.scope = "row";
  name.textContent = quote.code;
  row.append(name);
  const official = row.insertCell();
  official.className = "bw-fx-official";
  official.textContent = quote.official ? amount2(quote.official) : "—";
  const parallel = row.insertCell();
  parallel.textContent = amount(fxMid(quote));
  parallel.title = `Achat ${amount(quote.buy)} · vente ${amount(quote.sell)} (libellés Square)`;
}

function sheet(ticker: FxTicker) {
  const panel = document.createElement("div");
  panel.className = "bw-fx-sheet";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Taux de change du dinar algérien");
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const label of ["1 unité", "Officiel", "Parallèle"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const first = table.createTBody();
  for (const quote of ticker.currencies.slice(0, SHOWN_FIRST)) quoteRow(first, quote);
  const rest = ticker.currencies.slice(SHOWN_FIRST);
  panel.append(table);
  if (rest.length) {
    const more = table.createTBody();
    more.hidden = true;
    for (const quote of rest) quoteRow(more, quote);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "bw-fx-more";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = `+ ${rest.length} devises`;
    toggle.addEventListener("click", () => {
      more.hidden = !more.hidden;
      panel.classList.toggle("is-expanded", !more.hidden);
      toggle.setAttribute("aria-expanded", String(!more.hidden));
      toggle.textContent = more.hidden ? `+ ${rest.length} devises` : "Moins de devises";
    });
    panel.append(toggle);
  }
  const link = (href: string, text: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = text;
    return anchor;
  };
  const note = document.createElement("p");
  note.className = "bw-fx-sheet-note";
  if (ticker.officialDate) {
    note.append(
      link(FX_OFFICIAL_URL, "Banque d'Algérie"),
      ` (${new Date(`${ticker.officialDate}T12:00:00`).toLocaleDateString("fr-FR")}) · `,
    );
  }
  note.append(
    link(FX_SOURCE_URL, "Square"),
    ` (${ago(ticker.updatedAt)}). Taux indicatifs, en DA.`,
  );
  panel.append(note);
  return panel;
}

export function useFxMarker(mapRef: RefObject<MapLibreMap | null>, ready: boolean) {
  const ticker = useQuery(fxTickerQuery).data ?? null;
  const previousMid = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    const euro = ticker?.currencies.find((quote) => quote.code === "EUR");
    if (!ready || !map || !ticker || !euro) return;
    if (Date.now() - Date.parse(ticker.updatedAt) > FX_MAX_AGE_MS) return;

    const mid = fxMid(euro);
    const before = previousMid.current;
    previousMid.current = mid;
    const trend =
      before === null || Math.abs(mid - before) < 0.01 ? null : mid > before ? "up" : "down";

    const root = document.createElement("div");
    root.className = "bw-fx";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bw-fx-label";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute(
      "aria-label",
      `Taux du dinar : 1 euro vaut ${
        euro.official ? `${amount2(euro.official)} dinars au cours officiel et ` : ""
      }environ ${amount(mid)} au marché parallèle. Voir d'autres devises.`,
    );
    // Ligne principale : le cours officiel ; à défaut, le parallèle, signalé comme tel.
    const main = document.createElement("strong");
    main.className = "bw-fx-value";
    main.textContent = euro.official
      ? `${fxSymbol("EUR")}1 = ${amount2(euro.official)} DA`
      : `${fxSymbol("EUR")}1 ≈ ${amount(mid)} DA`;
    const sub = document.createElement("span");
    sub.className = "bw-fx-sub";
    sub.textContent = euro.official ? `parallèle ${amount(mid)} DA` : "marché parallèle";
    if (trend) {
      const arrow = document.createElement("span");
      arrow.className = `bw-fx-trend is-${trend}`;
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = trend === "up" ? "▲" : "▼";
      sub.append(arrow);
    }
    button.append(main, sub);
    root.append(button);

    const compact = () => root.classList.toggle("is-compact", map.getZoom() < COMPACT_BELOW_ZOOM);
    compact();

    let panel: HTMLElement | null = null;
    const close = () => {
      panel?.remove();
      panel = null;
      button.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
    };
    const open = () => {
      panel = sheet(ticker);
      root.append(panel);
      button.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      bringTooltipToFront(marker.getElement());
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (panel) close();
      else open();
    });
    root.addEventListener("click", (event) => event.stopPropagation());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel) {
        close();
        button.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", close);
    map.on("movestart", close);
    map.on("zoom", compact);

    const marker = new Marker({ element: root, anchor: "bottom" })
      .setLngLat(ALGERIA_ANCHOR)
      .addTo(map);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", close);
      map.off("movestart", close);
      map.off("zoom", compact);
      marker.remove();
    };
  }, [mapRef, ready, ticker]);
}
