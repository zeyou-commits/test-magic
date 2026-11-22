/**
 * Catégories des photos de galerie (navires, compagnies, ports). Doivent rester identiques à
 * private.bw_gallery_category_ok (supabase/migrations/20270124100000_galeries_photos_categories_ports.sql).
 */
export const VESSEL_PHOTO_CATEGORIES = [
  "exterior",
  "decks",
  "cabins",
  "food",
  "vehicles",
  "kids",
  "access",
  "other",
] as const;
export const PORT_PHOTO_CATEGORIES = [
  "view",
  "terminal",
  "boarding",
  "parking",
  "services",
  "other",
] as const;
export const ALL_PHOTO_CATEGORIES = [
  "exterior",
  "decks",
  "cabins",
  "food",
  "vehicles",
  "kids",
  "access",
  "view",
  "terminal",
  "boarding",
  "parking",
  "services",
  "other",
] as const;
export type PhotoCategory = (typeof ALL_PHOTO_CATEGORIES)[number];
export type PhotoSource = "company" | "team";

/** Libellés et exemples pour les formulaires (espace compagnie et admin, en français). */
export const PHOTO_CATEGORY_FORM: Record<PhotoCategory, { label: string; hint: string }> = {
  exterior: { label: "Extérieur", hint: "Le navire à quai ou en mer, la coque, la cheminée" },
  decks: { label: "Ponts et salons", hint: "Ponts extérieurs, salons, places assises, bars" },
  cabins: { label: "Cabines et fauteuils", hint: "Cabines, couchettes, sanitaires, fauteuils" },
  food: { label: "Restauration", hint: "Restaurant, self-service, cafétéria, boutique" },
  vehicles: {
    label: "Garage et véhicules",
    hint: "Garage, rampe d'accès, places pour les voitures",
  },
  kids: { label: "Enfants", hint: "Espace de jeux, nurserie, animations" },
  access: { label: "Accessibilité", hint: "Ascenseurs, cabines adaptées, accès en fauteuil" },
  view: { label: "Vue du port", hint: "Le port vu de l'extérieur, les quais" },
  terminal: { label: "Gare maritime", hint: "Hall, guichets, salle d'attente" },
  boarding: { label: "File et embarquement", hint: "Files des voitures, contrôles, passerelle" },
  parking: { label: "Accès et parking", hint: "Entrée du port, parkings, dépose" },
  services: { label: "Services", hint: "Restauration, toilettes, change, boutiques" },
  other: { label: "Autres", hint: "Ce qui ne rentre dans aucune autre catégorie" },
};

/** Catégorie connue, sinon « Autres » (anciennes photos, valeur inattendue). */
export const asPhotoCategory = (value: string | null | undefined): PhotoCategory =>
  (ALL_PHOTO_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as PhotoCategory)
    : "other";
