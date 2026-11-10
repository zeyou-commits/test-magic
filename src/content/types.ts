export type Topic = "vehicules" | "voyage" | "route";
export interface Section {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  /** Comparaison visuelle (barres horizontales), lisible aussi sans le graphique. */
  bars?: { unit: string; note?: string; rows: { label: string; sub: string; value: number; display: string }[] };
}
/** La ligne dont parle un dossier : tracé en perspective et chiffres clés. */
export interface LineGlance {
  slug: string;
  from: string;
  to: string;
  facts: { value: string; label: string }[];
}
export interface Article {
  slug: string;
  topic: Topic;
  title: string;
  description: string;
  answer: string;
  sections: Section[];
  faq: { q: string; a: string }[];
  sources: string[];
  related: string[];
  tool?: string;
  /** Illustration du carnet de route : affichée sous le titre, reprise pour le partage et les données structurées. */
  illustration?: Illustration;
  /** Ligne maritime concernée : affichée en tête de dossier. */
  line?: LineGlance;
  /** Chiffres clés affichés dans l'en-tête. */
  keyFacts?: { value: string; label: string }[];
  /** Date de mise à jour propre au dossier (AAAA-MM-JJ), sinon la date éditoriale commune. */
  updated?: string;
}
export interface Illustration {
  /** Image affichée (WebP) dans /public. */
  src: string;
  /** Version JPEG 1200×630 pour les aperçus de partage. */
  share: string;
  width: number;
  height: number;
  alt: string;
  /** Une phrase de récit, la famille du carnet de route. */
  caption: string;
}
export interface Source {
  name: string;
  url: string;
  note: string;
}
export interface VesselDossier {
  slug: string;
  name: string;
  company: string;
  summary: string;
  specs: { label: string; value: string }[];
  sections: Section[];
  sources: string[];
}
export interface CarpoolPlace {
  slug: string;
  name: string;
  road: string;
  area: string;
  access: string;
  relevance: string;
  rendezvous: string;
  source: string;
}
