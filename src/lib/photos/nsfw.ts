/**
 * Modération automatique des photos, sur l'appareil : modèle open source NSFWJS (MIT), chargé
 * seulement quand quelqu'un joint une photo. Aucune image n'est envoyée à un service tiers.
 * Le serveur refait le même contrôle pour les salons (chatPhoto.server.ts) : ce filtre-ci sert à
 * répondre tout de suite, il ne suffit pas à lui seul.
 */
import { NSFW_REFUSAL, isDoubtful, isExplicit, nsfwScores, type NsfwScores } from "./nsfwVerdict";

type Classifier = {
  classify: (image: HTMLImageElement) => Promise<{ className: string; probability: number }[]>;
};
let model: Promise<Classifier> | null = null;

// Navigateur seulement : le serveur n'embarque ni TensorFlow ni le modèle. Seul MobileNetV2
// (3,5 Mo) est inclus, pas les deux autres modèles livrés avec NSFWJS.
const loadModel: () => Promise<Classifier> = import.meta.env.SSR
  ? () => Promise.reject(new Error("Indisponible sur le serveur"))
  : async () => {
      const [tf, core, definition] = await Promise.all([
        import("@tensorflow/tfjs"),
        import("nsfwjs/core"),
        import("nsfwjs/models/mobilenet_v2"),
      ]);
      await tf.ready();
      return (await core.load("MobileNetV2", {
        modelDefinitions: [definition.MobileNetV2Model],
      })) as unknown as Classifier;
    };

export type PhotoCheck = { ok: true } | { ok: false; reason: string };

const getModel = () =>
  (model ??= loadModel().catch((error: unknown) => {
    model = null;
    throw error;
  }));

/** Préchargé dès que la personne ouvre « Joindre une photo » : le contrôle est ensuite immédiat. */
export function warmChatPhotoCheck() {
  void getModel().catch(() => undefined);
}

/** Les scores du modèle pour une image (lien blob, ou lien signé du stockage). */
export async function scorePhoto(url: string): Promise<NsfwScores> {
  const classifier = await getModel();
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return nsfwScores(await classifier.classify(image));
}

/** Contrôle avant envoi, pour toutes les photos (salons, avis, signalements). */
export async function checkChatPhoto(url: string): Promise<PhotoCheck> {
  let scores: NsfwScores;
  try {
    scores = await scorePhoto(url);
  } catch {
    return { ok: false, reason: "Vérification de la photo impossible pour le moment. Réessayez." };
  }
  return isExplicit(scores) ? { ok: false, reason: NSFW_REFUSAL } : { ok: true };
}

/** File de modération : la photo est-elle à flouter par défaut ? En cas de doute, oui. */
export async function isDoubtfulPhoto(url: string) {
  try {
    return isDoubtful(await scorePhoto(url));
  } catch {
    return true;
  }
}
