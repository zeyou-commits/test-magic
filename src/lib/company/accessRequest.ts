import { supabase } from "@/integrations/supabase/client";

/** Demande d'accès à l'espace compagnie (page d'accueil professionnelle) et son suivi en admin. */
export type AccessRequestForm = {
  fullName: string;
  companyName: string;
  companyId: string | null;
  jobTitle: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  website: string;
};

export const emptyAccessRequest: AccessRequestForm = {
  fullName: "",
  companyName: "",
  companyId: null,
  jobTitle: "",
  email: "",
  phone: "",
  message: "",
  consent: false,
  website: "",
};

export type AccessRequestStatus = "new" | "contacted" | "invited" | "declined" | "spam";
export const ACCESS_REQUEST_STATUS: Record<AccessRequestStatus, string> = {
  new: "Nouvelle",
  contacted: "Contactée",
  invited: "Invitée",
  declined: "Refusée",
  spam: "Indésirable",
};

export type AccessRequestRow = {
  id: string;
  fullName: string;
  companyName: string;
  companyId: string | null;
  knownCompany: string | null;
  jobTitle: string;
  email: string;
  phone: string | null;
  message: string | null;
  hasAccount: boolean;
  status: AccessRequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};
export type AccessRequestList = { requests: AccessRequestRow[]; pending: number };

/** Envoie la demande. Le jeton n'est joint que si la personne est déjà connectée. */
export async function sendAccessRequest(form: AccessRequestForm, elapsed: number) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch("/api/company-access-request", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fullName: form.fullName,
      companyName: form.companyName,
      companyId: form.companyId,
      jobTitle: form.jobTitle,
      email: form.email,
      phone: form.phone || undefined,
      message: form.message || undefined,
      consent: form.consent,
      website: form.website || undefined,
      elapsed: Math.round(elapsed),
    }),
  });
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !result?.ok)
    throw new Error(result?.error ?? "La demande n'a pas pu être envoyée. Réessayez plus tard.");
}

/** Contrôles simples avant l'envoi ; le serveur et la base revérifient tout. */
export function accessRequestErrors(form: AccessRequestForm) {
  const errors: Partial<Record<keyof AccessRequestForm, string>> = {};
  if (form.fullName.trim().length < 2) errors.fullName = "Indiquez votre nom.";
  if (form.companyName.trim().length < 2) errors.companyName = "Indiquez votre compagnie.";
  if (form.jobTitle.trim().length < 2) errors.jobTitle = "Indiquez votre fonction.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = "Indiquez une adresse e-mail valide.";
  if (form.phone.length > 40) errors.phone = "40 caractères au plus.";
  if (form.message.length > 1000) errors.message = "1 000 caractères au plus.";
  if (!form.consent) errors.consent = "Cochez cette case pour envoyer la demande.";
  return errors;
}
