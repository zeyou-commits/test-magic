/**
 * Le carrousel d'accueil de « Préparer mon voyage » : l'Algérie qui donne envie de partir.
 * Photos libres de Wikimedia Commons, réduites en WebP (640 et 1280 px) dans
 * public/illustrations/algerie ; l'auteur et la licence s'affichent sous chaque photo.
 */
export type AlgeriaPhoto = {
  slug: string;
  title: string;
  place: string;
  author: string;
  license: string;
  source: string;
};

export const LICENSE_URLS: Record<string, string> = {
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/deed.fr",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/deed.fr",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/deed.fr",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/deed.fr",
};

export const photoSrc = (photo: AlgeriaPhoto, width: 640 | 1280) =>
  `/illustrations/algerie/${photo.slug}-${width}.webp`;

export const ALGERIA_PHOTOS: AlgeriaPhoto[] = [
  {
    slug: "cap-carbon-bejaia",
    title: "Le cap Carbon",
    place: "Béjaïa",
    author: "Bernard Gagnon",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Cap_Carbon_(B%C3%A9ja%C3%AFa).jpg",
  },
  {
    slug: "constantine-ponts",
    title: "Les ponts suspendus",
    place: "Constantine",
    author: "Zakiiii94",
    license: "CC BY-SA 4.0",
    source:
      "https://commons.wikimedia.org/wiki/File:%D8%AC%D8%B3%D8%B1_%D9%85%D9%84%D8%A7%D8%AD_%D8%B3%D9%84%D9%8A%D9%85%D8%A7%D9%86_%D9%82%D8%B3%D9%86%D8%B7%D9%8A%D9%86%D8%A9.jpg",
  },
  {
    slug: "tadrart-rouge",
    title: "La Tadrart rouge",
    place: "Illizi",
    author: "Pir6mon",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Tadrart01.JPG",
  },
  {
    slug: "ghardaia-ksar",
    title: "Le ksar et son marché",
    place: "Ghardaïa",
    author: "Camille Gillet",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Ksar_Ghardaia_place_march%C3%A9_1.jpg",
  },
  {
    slug: "notre-dame-d-afrique",
    title: "Notre-Dame d'Afrique",
    place: "Alger",
    author: "Ludovic Courtès, Rabanus Flavus",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Alger-Notre-Dame-D%27Afrique_Basilique.jpg",
  },
  {
    slug: "djemila",
    title: "Les ruines romaines",
    place: "Djémila",
    author: "Alioueche Mokhtar",
    license: "CC BY-SA 4.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Roman_Ruins_of_Djemila_in_S%C3%A9tif,_Algeria.jpg",
  },
  {
    slug: "taghit",
    title: "L'oasis et le grand erg",
    place: "Taghit",
    author: "Mohamed.benguedda",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Vue_de_Taghit.jpg",
  },
  {
    slug: "hoggar-assekrem",
    title: "L'Assekrem, au cœur du Hoggar",
    place: "Tamanrasset",
    author: "Mohammed Amri",
    license: "CC BY-SA 4.0",
    source:
      "https://commons.wikimedia.org/wiki/File:%D8%A7%D8%B3%D9%83%D8%B1%D8%A7%D9%85_2_-_%D8%AA%D9%85%D9%86%D8%B1%D8%A7%D8%B3%D8%AA.jpg",
  },
  {
    slug: "tipaza",
    title: "Les ruines au bord de l'eau",
    place: "Tipaza",
    author: "SamirAmiri",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Tipaza_archeologique_site.jpg",
  },
  {
    slug: "tikjda-djurdjura",
    title: "Le lac Aguelmim, dans le Djurdjura",
    place: "Tikjda",
    author: "KEBIR",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:The_Aguelmim_Lake,_Tikjda,_Algeria.jpg",
  },
  {
    slug: "oran-baie",
    title: "La baie",
    place: "Oran",
    author: "YACINE K",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Oran_-_aerial_view.jpg",
  },
  {
    slug: "cascade-ain-legradj",
    title: "La cascade d'Aïn Legradj",
    place: "Bordj Bou Arréridj",
    author: "Chettouh Nabil",
    license: "CC BY-SA 3.0",
    source:
      "https://commons.wikimedia.org/wiki/File:Cascade_de_A%C3%AFn_Legradj_%C3%A0_Bordj_Bou_Arreredj.jpg",
  },
];
