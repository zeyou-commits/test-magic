/**
 * Catégories des photos de galerie (navires, compagnies, ports). Doivent rester identiques à
 * private.bw_gallery_category_ok (supabase/migrations/20270124100000_galeries_photos_categories_ports.sql).
 */
import { tr } from "@/lib/i18n/translate";
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
  exterior: { get label() { return tr("ui.libCompanyGalleryCategories.exterieur"); }, get hint() { return tr("ui.libCompanyGalleryCategories.leNavireAQuaiOu"); } },
  decks: { get label() { return tr("ui.libCompanyGalleryCategories.pontsEtSalons"); }, get hint() { return tr("ui.libCompanyGalleryCategories.pontsExterieursSalonsPlacesAssises"); } },
  cabins: { get label() { return tr("ui.libCompanyGalleryCategories.cabinesEtFauteuils"); }, get hint() { return tr("ui.libCompanyGalleryCategories.cabinesCouchettesSanitairesFauteuils"); } },
  food: { get label() { return tr("ui.libCompanyGalleryCategories.restauration"); }, get hint() { return tr("ui.libCompanyGalleryCategories.restaurantSelfServiceCafeteriaBoutique"); } },
  vehicles: {
    get label() { return tr("ui.libCompanyGalleryCategories.garageEtVehicules"); },
    get hint() { return tr("ui.libCompanyGalleryCategories.garageRampeDAccesPlaces"); },
  },
  kids: { get label() { return tr("ui.libCompanyGalleryCategories.enfants"); }, get hint() { return tr("ui.libCompanyGalleryCategories.espaceDeJeuxNurserieAnimations"); } },
  access: { get label() { return tr("ui.libCompanyGalleryCategories.accessibilite"); }, get hint() { return tr("ui.libCompanyGalleryCategories.ascenseursCabinesAdapteesAccesEn"); } },
  view: { get label() { return tr("ui.libCompanyGalleryCategories.vueDuPort"); }, get hint() { return tr("ui.libCompanyGalleryCategories.lePortVuDeL"); } },
  terminal: { get label() { return tr("ui.libCompanyGalleryCategories.gareMaritime"); }, get hint() { return tr("ui.libCompanyGalleryCategories.hallGuichetsSalleDAttente"); } },
  boarding: { get label() { return tr("ui.libCompanyGalleryCategories.fileEtEmbarquement"); }, get hint() { return tr("ui.libCompanyGalleryCategories.filesDesVoituresControlesPasserelle"); } },
  parking: { get label() { return tr("ui.libCompanyGalleryCategories.accesEtParking"); }, get hint() { return tr("ui.libCompanyGalleryCategories.entreeDuPortParkingsDepose"); } },
  services: { get label() { return tr("ui.libCompanyGalleryCategories.services"); }, get hint() { return tr("ui.libCompanyGalleryCategories.restaurationToilettesChangeBoutiques"); } },
  other: { get label() { return tr("ui.libCompanyGalleryCategories.autres"); }, get hint() { return tr("ui.libCompanyGalleryCategories.ceQuiNeRentreDans"); } },
};

/** Catégorie connue, sinon « Autres » (anciennes photos, valeur inattendue). */
export const asPhotoCategory = (value: string | null | undefined): PhotoCategory =>
  (ALL_PHOTO_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as PhotoCategory)
    : "other";
