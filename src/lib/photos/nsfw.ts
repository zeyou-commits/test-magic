/**
 * Modération automatique des photos de salon, sur l'appareil : modèle open source NSFWJS (MIT),
 * chargé seulement quand quelqu'un joint une photo. Aucune image n'est envoyée à un service tiers.
 * Seuils prudents : une photo douteuse est refusée, la personne peut en choisir une autre.
 */
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

export async function checkChatPhoto(url: string): Promise<PhotoCheck> {
  let classifier: Classifier;
  try {
    classifier = await getModel();
  } catch {
    return { ok: false, reason: "Vérification de la photo impossible pour le moment. Réessayez." };
  }
  const image = new Image();
  image.src = url;
  await image.decode();
  const scores = Object.fromEntries(
    (await classifier.classify(image)).map((item) => [item.className, item.probability]),
  ) as Record<string, number>;
  const explicit = (scores["Porn"] ?? 0) + (scores["Hentai"] ?? 0);
  if (explicit >= 0.4 || (scores["Sexy"] ?? 0) >= 0.7)
    return { ok: false, reason: "Cette photo ne peut pas être publiée dans les salons." };
  return { ok: true };
}
