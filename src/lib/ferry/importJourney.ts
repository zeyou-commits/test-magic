/**
 * « Importer ma voiture » : un parcours à part, de l'achat au dédouanement. Il se rejoint avec
 * « Préparer mon voyage » sur les papiers des voyageurs (même liste) et sur la traversée.
 * Tout est déclaratif : le voyageur coche ce qu'il a fait, BledWay ne vérifie rien.
 */

export const IMPORT_PATH = "/importer-ma-voiture";

export const IMPORT_STEPS = [
  "eligibilite",
  "achat",
  "export",
  "papiers",
  "traversee",
  "arrivee",
  "immatriculation",
] as const;

export type ImportStepId = (typeof IMPORT_STEPS)[number];
export type ImportWho = "seller" | "me" | "agent";
export type ImportPort = "valence" | "barcelone" | "almeria" | "other";

export type ImportState = {
  done: ImportStepId[];
  who: ImportWho | null;
  mrn: string;
  port: ImportPort | null;
  /** Pièces du dossier d'arrivée déclarées réunies. */
  dossier: string[];
};

const KEY = "bledway:import:v1";

export const defaultImportState = (): ImportState => ({
  done: [],
  who: null,
  mrn: "",
  port: null,
  dossier: [],
});

export function loadImport(): ImportState {
  if (typeof window === "undefined") return defaultImportState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultImportState();
    const saved = JSON.parse(raw) as Partial<ImportState>;
    return {
      ...defaultImportState(),
      ...saved,
      done: (saved.done ?? []).filter((id): id is ImportStepId =>
        (IMPORT_STEPS as readonly string[]).includes(id),
      ),
    };
  } catch {
    return defaultImportState();
  }
}

export function saveImport(state: ImportState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible (navigation privée) : le parcours reste utilisable sans mémoire */
  }
}

/** Les ports espagnols d'où Baleària embarque des véhicules à exporter (centre d'aide, lu le 25/11/2026). */
export const IMPORT_PORTS: ImportPort[] = ["valence", "barcelone", "almeria", "other"];
