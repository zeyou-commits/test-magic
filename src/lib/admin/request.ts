import { supabase } from "@/integrations/supabase/client";

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}
let refreshing: ReturnType<typeof supabase.auth.refreshSession> | null = null;
async function refreshToken() {
  // Les deux panneaux admin peuvent demander simultanément un renouvellement.
  if (!refreshing) refreshing = supabase.auth.refreshSession();
  const pending = refreshing;
  try {
    const { data, error } = await pending;
    if (error || !data.session)
      throw new AdminRequestError(
        "Votre session a expiré. Reconnectez-vous.",
        401,
        "SESSION_EXPIRED",
      );
    return data.session.access_token;
  } finally {
    if (refreshing === pending) refreshing = null;
  }
}
export async function adminRequest<T>(url: string, input: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new AdminRequestError(
      "Connectez-vous pour accéder à l’administration.",
      401,
      "SESSION_REQUIRED",
    );
  const send = (token: string) =>
    fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  let response = await send(data.session.access_token);
  let result = await response.json().catch(() => null);
  // Un seul nouvel essai après un refus d'authentification, jamais après une mutation reçue.
  if (response.status === 401 && result?.code !== "SESSION_PROJECT_MISMATCH") {
    const current = await supabase.auth.getSession();
    const token = current.data.session?.access_token;
    response = await send(
      token && token !== data.session.access_token ? token : await refreshToken(),
    );
    result = await response.json().catch(() => null);
  }
  if (!response.ok || !result)
    throw new AdminRequestError(
      result?.error ?? "Le service administrateur est indisponible.",
      response.status,
      result?.code,
    );
  return result as T;
}
