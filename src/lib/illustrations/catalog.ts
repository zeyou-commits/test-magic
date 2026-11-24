import { personas, reactions } from "@/lib/community/travellers";
import { cabasImages } from "@/lib/ferry/presence";
import { tr } from "@/lib/i18n/translate";

export type IllustrationCategory =
  "avatars" | "statuts" | "persos" | "humeurs" | "pictos" | "reactions";

export type IllustrationSlot = {
  /** Chemin d'origine : l'identifiant stable utilisé partout dans l'app. */
  src: string;
  /** Nom du fichier sans extension, reconnu à l'import. */
  file: string;
  name: string;
  category: IllustrationCategory;
  size: number;
  margin: number;
  /** Tailles réelles d'affichage dans l'app, en pixels. */
  shownAt: number[];
};

export const categories: Record<IllustrationCategory, { label: string; hint: string }> = {
  avatars: { get label() { return tr("ui.libIllustrationsCatalog.avatars"); }, get hint() { return tr("ui.libIllustrationsCatalog.voyageursSurLaCarteEt"); } },
  statuts: { get label() { return tr("ui.libIllustrationsCatalog.statuts"); }, get hint() { return tr("ui.libIllustrationsCatalog.enRouteAuPortA"); } },
  persos: { get label() { return tr("ui.libIllustrationsCatalog.personnages"); }, get hint() { return tr("ui.libIllustrationsCatalog.leCabasQueChacunChoisit"); } },
  humeurs: { get label() { return tr("ui.libIllustrationsCatalog.humeurs"); }, get hint() { return tr("ui.libIllustrationsCatalog.laBullePoseeSurLe"); } },
  pictos: { get label() { return tr("ui.libIllustrationsCatalog.iconesDHumeur"); }, get hint() { return tr("ui.libIllustrationsCatalog.laPetitePastillePoseeSur"); } },
  reactions: { get label() { return tr("ui.libIllustrationsCatalog.reactions"); }, get hint() { return tr("ui.libIllustrationsCatalog.pretesMaisPasEncoreAffichees"); } },
};

const FORMATS: Record<
  IllustrationCategory,
  Pick<IllustrationSlot, "size" | "margin" | "shownAt">
> = {
  avatars: { size: 72, margin: 0.07, shownAt: [20, 26, 36] },
  statuts: { size: 192, margin: 0.02, shownAt: [26, 56, 64] },
  // Affichés jusqu'à 84 px : 384 px restent nets sur les écrans de téléphone.
  persos: { size: 384, margin: 0.025, shownAt: [22, 40, 56, 84] },
  humeurs: { size: 160, margin: 0.015, shownAt: [16, 22, 36, 44] },
  pictos: { size: 160, margin: 0.04, shownAt: [18, 24] },
  reactions: { size: 80, margin: 0.07, shownAt: [20, 32] },
};

const PICTOS = {
  get bouchon() { return tr("ui.libIllustrationsCatalog.bouchon"); },
  get chaleur() { return tr("ui.libIllustrationsCatalog.chaleur"); },
  get controle() { return tr("ui.libIllustrationsCatalog.controle"); },
  get file() { return tr("ui.libIllustrationsCatalog.fileDAttente"); },
  get msemen() { return tr("ui.libIllustrationsCatalog.msemen"); },
  get route_longue() { return tr("ui.libIllustrationsCatalog.routeLongue"); },
  get surpoids() { return tr("ui.libIllustrationsCatalog.surpoids"); },
  get valise_pleine() { return tr("ui.libIllustrationsCatalog.valisePleine"); },
  get viva_algerie() { return tr("ui.libIllustrationsCatalog.vivaLAlgerie"); },
  get yallah() { return tr("ui.libIllustrationsCatalog.yallah"); },
  get zen() { return tr("ui.libIllustrationsCatalog.zen"); },
};

const STATUTS = {
  get "statut-en-route"() { return tr("ui.libIllustrationsCatalog.enRoute"); },
  get "statut-au-port"() { return tr("ui.libIllustrationsCatalog.auPort"); },
  get "statut-a-bord"() { return tr("ui.libIllustrationsCatalog.aBord"); },
  get "statut-arrive"() { return tr("ui.libIllustrationsCatalog.arrive"); },
};

function slot(category: IllustrationCategory, path: string, name: string): IllustrationSlot {
  const file = path.split("/").pop()!;
  return { src: `/cabas/${path}.webp`, file, name, category, ...FORMATS[category] };
}

/** « 01_valise_pleine » devient « Valise pleine ». */
function readable(file: string) {
  const text = file.replace(/^\d+_/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const illustrationSlots: IllustrationSlot[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => slot("avatars", `avatar-${n}`, tr("ui.libIllustrationsCatalog.avatar", { n }))),
  ...Object.entries(STATUTS).map(([file, name]) => slot("statuts", file, name)),
  // La voiture 504 (mascotte, image du trajet porte à porte) n'est plus dans « personas » : elle
  // ne se remplace pas ici.
  ...personas.map((persona) => slot("persos", `persos/${persona.id}`, persona.name)),
  ...cabasImages
    .filter((src) => src.includes("/humeurs/"))
    .map((src) => {
      const file = src.split("/").pop()!.replace(".webp", "");
      return slot("humeurs", `humeurs/${file}`, readable(file));
    }),
  ...Object.entries(PICTOS).map(([file, name]) => slot("pictos", `pictos/${file}`, name)),
  ...reactions.map((reaction) => slot("reactions", `reactions/${reaction.code}`, reaction.label)),
];

const byFile = new Map(illustrationSlots.map((item) => [item.file, item]));

/** Retrouve l'emplacement d'un fichier déposé ; tolère « lina (1).PNG » des téléchargements. */
export function slotForFileName(name: string) {
  const stem = name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\(\d+\)$/, "")
    .trim()
    .toLowerCase();
  return byFile.get(stem) ?? null;
}
