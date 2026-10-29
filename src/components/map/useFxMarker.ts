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
  type FxTicker,
} from "@/lib/fx/ticker";

/**
 * Taux de change posé sur l'Algérie, comme une annotation de carte : le dinar face à l'euro,
 * et toutes les devises au clic. Chaque pays aura plus tard le sien, à son propre emplacement.
 */
const ALGERIA_ANCHOR: [number, number] = [3.1, 33.7]; // entre l'Atlas et Laghouat : zone vide de la carte

const amount = (value: number) =>
  value.toLocaleString("fr-FR", { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 });

const amount2 = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `il y a ${hours} h`;
};

function sheet(ticker: FxTicker) {
  const panel = document.createElement("div");
  panel.className = "bw-fx-sheet";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Taux de change indicatifs du dinar algérien");
  const title = document.createElement("p");
  title.className = "bw-fx-sheet-title";
  title.textContent = "Dinar algérien";
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  const hasOfficial = ticker.currencies.some((quote) => quote.official);
  for (const label of hasOfficial
    ? ["Devise", "Achat", "Vente", "Officiel"]
    : ["Devise", "Achat", "Vente"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const quote of ticker.currencies) {
    const row = body.insertRow();
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = quote.code;
    row.append(name);
    row.insertCell().textContent = amount(quote.buy);
    row.insertCell().textContent = amount(quote.sell);
    if (hasOfficial) {
      const cell = row.insertCell();
      cell.className = "bw-fx-official";
      cell.textContent = quote.official ? amount2(quote.official) : "—";
    }
  }
  const note = document.createElement("p");
  note.className = "bw-fx-sheet-note";
  const link = (href: string, text: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = text;
    return anchor;
  };
  note.append(
    `En dinars pour 1 unité. Achat et vente : marché parallèle, libellés de `,
    link(FX_SOURCE_URL, "Square Algérie"),
    `, mis à jour ${ago(ticker.updatedAt)}.`,
  );
  if (hasOfficial && ticker.officialDate) {
    note.append(
      " Officiel : ",
      link(FX_OFFICIAL_URL, "Banque d'Algérie"),
      `, cours du ${new Date(`${ticker.officialDate}T12:00:00`).toLocaleDateString("fr-FR")}.`,
    );
  }
  note.append(" Repères indicatifs, sans garantie de transaction.");
  panel.append(title, table, note);
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
      `Taux indicatif : 1 euro vaut environ ${amount(mid)} dinars algériens au marché parallèle${
        euro.official ? `, ${amount2(euro.official)} au cours officiel` : ""
      }. Voir toutes les devises.`,
    );
    const kicker = document.createElement("span");
    kicker.className = "bw-fx-kicker";
    kicker.textContent = "Dinar algérien";
    const value = document.createElement("strong");
    value.className = "bw-fx-value";
    value.textContent = `${fxSymbol("EUR")} 1 = ${amount(mid)} DA`;
    if (trend) {
      const arrow = document.createElement("span");
      arrow.className = `bw-fx-trend is-${trend}`;
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = trend === "up" ? "▲" : "▼";
      value.append(arrow);
    }
    const hint = document.createElement("span");
    hint.className = "bw-fx-hint";
    hint.textContent = euro.official
      ? `officiel ${amount2(euro.official)} DA · indicatif`
      : "marché parallèle · indicatif";
    button.append(kicker, value, hint);
    root.append(button);

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

    const marker = new Marker({ element: root, anchor: "center" })
      .setLngLat(ALGERIA_ANCHOR)
      .addTo(map);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", close);
      map.off("movestart", close);
      marker.remove();
    };
  }, [mapRef, ready, ticker]);
}
