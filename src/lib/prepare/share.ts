import type { Answers } from "@/content/formalites";
import { departmentFromPostcode } from "@/content/consulats";
import { loadPapers } from "@/content/formalites";
import { loadPlan, type CompanionPlan } from "@/lib/ferry/companion";

/**
 * La préparation partagée tient tout entière dans le lien, après le « # » : rien n'est envoyé ni
 * stocké sur un serveur (le navigateur n'envoie jamais cette partie de l'adresse). Le code postal
 * est réduit au département, assez pour trouver le consulat.
 */
export interface SharedPreparation {
  v: 1;
  /** Réponses de « Mes papiers », sans le code postal complet. */
  answers: Omit<Answers, "postcode"> & { department: string | null };
  done: string[];
  trip: {
    date: string | null;
    returnDate: string | null;
    month: string | null;
    vehicle: CompanionPlan["vehicle"] | null;
    fromPortId: string | null;
    toPortId: string | null;
    destination: string | null;
  } | null;
  /** Moment du partage (AAAA-MM-JJ). */
  at: string;
}

export function currentPreparation(): SharedPreparation | null {
  const papers = loadPapers();
  const plan = loadPlan();
  if (!papers && !plan?.started) return null;
  const { postcode = "", ...rest } = (papers?.answers ?? {}) as Answers;
  return {
    v: 1,
    answers: { ...(rest as Omit<Answers, "postcode">), department: departmentFromPostcode(postcode) },
    done: papers?.done ?? [],
    trip: plan?.started
      ? {
          date: plan.date || plan.window?.from || null,
          returnDate: plan.returnDate ?? null,
          month: plan.month || null,
          vehicle: plan.vehicle,
          fromPortId: plan.fromPortId,
          toPortId: plan.toPortId,
          destination: plan.destination?.label ?? null,
        }
      : null,
    at: new Date().toISOString().slice(0, 10),
  };
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "===".slice((padded.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodePreparation(prep: SharedPreparation) {
  return toBase64Url(JSON.stringify(prep));
}

export function decodePreparation(hash: string): SharedPreparation | null {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("p");
  if (!raw) return null;
  try {
    const value = JSON.parse(fromBase64Url(raw)) as SharedPreparation;
    return value?.v === 1 && value.answers?.travellers?.length ? value : null;
  } catch {
    return null;
  }
}

export function shareUrl(prep: SharedPreparation) {
  return `${window.location.origin}/ma-preparation#p=${encodePreparation(prep)}`;
}

/** Les réponses complètes que tasksFor attend, à partir d'une préparation partagée. */
export function answersOf(prep: SharedPreparation): Answers {
  const { department, ...rest } = prep.answers;
  // Un code postal fictif du bon département suffit pour retrouver le consulat.
  const postcode = department ? `${department}00000`.slice(0, 5) : "";
  return { ...rest, postcode: department === "2A" ? "20000" : department === "2B" ? "20200" : postcode };
}
