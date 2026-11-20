import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  pendingPath: z.string().max(200),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
});

/** Photo de profil : contrôlée ici, puis publiée tout de suite. */
export const publishProfilePhotoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { publishProfilePhoto }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./profilePhoto.server"),
    ]);
    return publishProfilePhoto(
      supabaseAdmin as unknown as SupabaseClient,
      context.supabase as unknown as SupabaseClient,
      context.userId,
      data,
    );
  });
