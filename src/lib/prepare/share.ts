import type { Answers } from "@/content/formalites";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { departmentFromPostcode } from "@/content/consulats";
import { loadPapers } from "@/content/formalites";
import { loadPlan, type CompanionPlan } from "@/lib/ferry/companion";

/**
 * Une préparation partagée est rangée côté serveur (bw_prep_shares) sous un identifiant court :
 * seuls son auteur et les comptes dont l'adresse e-mail a été invitée peuvent la lire. Le code
 * postal est réduit au département, assez pour trouver le consulat.
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

// Table pas encore dans les types générés.
const shares = () => (supabase as unknown as SupabaseClient).from("bw_prep_shares");

/** Range la préparation pour ces adresses ; renvoie le lien court à envoyer. */
export async function createShare(prep: SharedPreparation, emails: string[]) {
  const { data, error } = await shares()
    .insert({ data: prep, emails })
    .select("id")
    .single();
  if (error) throw error;
  return `${window.location.origin}/ma-preparation?s=${(data as { id: string }).id}`;
}

/** La préparation partagée, si le compte connecté y a droit (auteur ou adresse invitée). */
export async function loadShare(id: string): Promise<SharedPreparation | null> {
  const { data, error } = await shares().select("data").eq("id", id).maybeSingle();
  if (error) throw error;
  const value = (data as { data: SharedPreparation } | null)?.data;
  return value?.v === 1 && value.answers?.travellers?.length ? value : null;
}

/** Les réponses complètes que tasksFor attend, à partir d'une préparation partagée. */
export function answersOf(prep: SharedPreparation): Answers {
  const { department, ...rest } = prep.answers;
  // Un code postal fictif du bon département suffit pour retrouver le consulat.
  const postcode = department ? `${department}00000`.slice(0, 5) : "";
  return { ...rest, postcode: department === "2A" ? "20000" : department === "2B" ? "20200" : postcode };
}
