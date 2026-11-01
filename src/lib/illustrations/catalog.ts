import { personas, reactions } from "@/lib/community/travellers";
import { cabasImages } from "@/lib/ferry/presence";

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
  avatars: { label: "Avatars", hint: "Voyageurs sur la carte et dans les panneaux." },
  statuts: { label: "Statuts", hint: "En route, au port, à bord, arrivé." },
  persos: { label: "Personnages", hint: "Le cabas que chacun choisit dans son profil." },
  humeurs: { label: "Humeurs", hint: "La bulle posée sur le cabas et le choix de l'humeur." },
  pictos: { label: "Icônes d'humeur", hint: "La petite pastille posée sur l'avatar." },
  reactions: { label: "Réactions", hint: "Prêtes, mais pas encore affichées dans l'app." },
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
  bouchon: "Bouchon",
  chaleur: "Chaleur",
  controle: "Contrôle",
  file: "File d'attente",
  msemen: "Msemen",
  route_longue: "Route longue",
  surpoids: "Surpoids",
  valise_pleine: "Valise pleine",
  viva_algerie: "Viva l'Algérie",
  yallah: "Yallah",
  zen: "Zen",
};

const STATUTS = {
  "statut-en-route": "En route",
  "statut-au-port": "Au port",
  "statut-a-bord": "À bord",
  "statut-arrive": "Arrivé",
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
  ...[1, 2, 3, 4, 5, 6].map((n) => slot("avatars", `avatar-${n}`, `Avatar ${n}`)),
  ...Object.entries(STATUTS).map(([file, name]) => slot("statuts", file, name)),
  // La voiture 504 est aussi l'image du trajet porte à porte : elle ne se remplace pas ici.
  ...personas
    .filter((persona) => persona.id !== "voiture_504")
    .map((persona) => slot("persos", `persos/${persona.id}`, persona.name)),
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
