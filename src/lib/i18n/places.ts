// Noms de lieux affichés (ports, pays, villes) dans les autres langues. Les données restent en français :
// la recherche, la lecture des billets et les rapprochements continuent d'utiliser le nom d'origine.
import type { Locale } from "./config";

const AR: Record<string, string> = {
  // Ports publiés
  Alger: "الجزائر العاصمة",
  Oran: "وهران",
  "Béjaïa": "بجاية",
  Annaba: "عنابة",
  Skikda: "سكيكدة",
  Mostaganem: "مستغانم",
  Ghazaouet: "الغزوات",
  Jijel: "جيجل",
  Arzew: "أرزيو",
  Marseille: "مرسيليا",
  "Sète": "سيت",
  Toulon: "طولون",
  Nice: "نيس",
  Barcelone: "برشلونة",
  Valence: "فالنسيا",
  Alicante: "أليكانتي",
  "Almería": "ألميريا",
  Almeria: "ألميريا",
  "Gênes": "جنوة",
  Civitavecchia: "تشيفيتافيكيا",
  // Pays
  "Algérie": "الجزائر",
  France: "فرنسا",
  Espagne: "إسبانيا",
  Italie: "إيطاليا",
  Tunisie: "تونس",
  Maroc: "المغرب",
  Europe: "أوروبا",
  // Villes d'Algérie présentes dans les pages
  Constantine: "قسنطينة",
  Illizi: "إليزي",
  "Ghardaïa": "غرداية",
  "Djémila": "جميلة",
  Taghit: "تاغيت",
  Tamanrasset: "تمنراست",
  Tipaza: "تيبازة",
  Tikjda: "تيكجدة",
  "Bordj Bou Arréridj": "برج بوعريريج",
  "Tizi Ouzou": "تيزي وزو",
  "Sétif": "سطيف",
  Blida: "البليدة",
  Tlemcen: "تلمسان",
  Biskra: "بسكرة",
  Batna: "باتنة",
};

const PLACES: Partial<Record<Locale, Record<string, string>>> = { ar: AR };

/**
 * Le nom d'un lieu dans la langue affichée, sinon tel quel. Gère aussi « Marseille → Alger » :
 * chaque côté est traduit et, en arabe, la flèche suit le sens de lecture.
 */
export function localizePlace(locale: Locale, name: string): string {
  const table = PLACES[locale];
  if (!table || !name) return name;
  const direct = table[name];
  if (direct) return direct;
  if (name.includes(" → ")) {
    const parts = name.split(" → ").map((part) => table[part]);
    if (parts.every(Boolean)) return parts.join(" ← ");
  }
  return name;
}
