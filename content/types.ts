export type Topic = "vehicules" | "voyage" | "route";
export interface Section {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
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
