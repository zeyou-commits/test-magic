import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Demande d'accès à l'espace compagnie, envoyée depuis la page d'accueil professionnelle.
 * Ouverte sans compte : la demande ne donne aucun accès, un administrateur la traite à la main.
 * Protections : taille limitée, champ piège invisible, délai minimal de saisie, limites en base
 * (adresse réseau, e-mail, total du jour). Le compte n'est lu que depuis un jeton vérifié.
 */
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const accessRequestSchema = z.object({
  fullName: text(2, 120),
  companyName: text(2, 120),
  companyId: z.string().uuid().nullable().optional(),
  jobTitle: text(2, 120),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  // Champ invisible : un robot le remplit, une personne non.
  website: z.string().max(200).optional(),
  // Durée de saisie en millisecondes, mesurée par la page.
  elapsed: z.number().int().nonnegative().optional(),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

const MAX_BODY = 8_000;
const MIN_ELAPSED = 3_000;

export function hashAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim();
  if (!address) return null;
  return createHash("sha256").update(`bledway-acces:${address}`).digest("hex").slice(0, 32);
}

async function verifiedUser(request: Request, db: SupabaseClient<Database>) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

export async function handleCompanyAccessRequest(request: Request, db: SupabaseClient<Database>) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return respond({ error: "Demande trop longue." }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const parsed = accessRequestSchema.safeParse(json);
  if (!parsed.success)
    return respond({ error: "Vérifiez les champs du formulaire, puis réessayez." }, 400);
  const input = parsed.data;
  // Robot probable : on répond comme si tout allait bien, sans rien enregistrer.
  if (input.website || (input.elapsed ?? 0) < MIN_ELAPSED) return respond({ ok: true });

  const user = await verifiedUser(request, db);
  const { error } = await (db as unknown as SupabaseClient).rpc(
    "bw_company_access_request_submit",
    {
      _full_name: input.fullName,
      _company_name: input.companyName,
      _company_id: input.companyId ?? null,
      _job_title: input.jobTitle,
      _email: input.email,
      _phone: input.phone || null,
      _message: input.message || null,
      _user: user,
      _ip_hash: hashAddress(request),
    },
  );
  if (error) {
    const code = error.message.match(/BW_[A-Z_]+/)?.[0];
    if (code === "BW_LIMIT")
      return respond(
        { error: "Plusieurs demandes ont déjà été envoyées. Réessayez demain ou écrivez-nous." },
        429,
      );
    if (code === "BW_INVALID")
      return respond({ error: "Vérifiez les champs du formulaire, puis réessayez." }, 400);
    return respond({ error: "La demande n'a pas pu être enregistrée. Réessayez plus tard." }, 503);
  }
  return respond({ ok: true });
}
