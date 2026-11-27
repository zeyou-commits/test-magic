import type { StyleSpecification } from "maplibre-gl";

/**
 * Couches du fond OpenFreeMap que la carte des traversées n'affiche jamais : relief (images),
 * occupation du sol, routes, bâtiments, lieux… et les noms de villes, remplacés par les ports.
 * Elles étaient chargées puis masquées au « load » ; on les retire du style avant le premier
 * affichage pour ne télécharger ni décoder leurs tuiles.
 */
const HIDDEN_LAYER =
  /hillshade|landcover|landuse|park|building|road|highway|bridge|tunnel|aeroway|airport|poi|railway|peak/;
const HIDDEN_LABELS = new Set([
  "label_other",
  "label_village",
  "label_town",
  "label_city",
  "label_city_capital",
  "label_state",
  "waterway_line_label",
]);

export function isHiddenBaseLayer(layer: { id: string; type: string }) {
  return layer.type === "raster" || HIDDEN_LAYER.test(layer.id) || HIDDEN_LABELS.has(layer.id);
}

/** Le style allégé : mêmes couches visibles, sans les couches masquées ni les sources orphelines. */
export function slimBaseStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.filter((layer) => !isHiddenBaseLayer(layer));
  const used = new Set(layers.map((layer) => ("source" in layer ? layer.source : undefined)));
  const sources = Object.fromEntries(
    Object.entries(style.sources).filter(([id]) => used.has(id)),
  );
  return { ...style, layers, sources };
}
