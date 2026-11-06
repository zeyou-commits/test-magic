import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  pendingPath: z.string().max(200),
  roomKind: z.string().max(40),
  room: z.string().max(200),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
});

/** Salon : la photo déposée en attente est contrôlée ici, puis publiée avec mon message. */
export const publishChatPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { publishChatPhoto }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./chatPhoto.server"),
    ]);
    return publishChatPhoto(
      supabaseAdmin as unknown as SupabaseClient,
      context.supabase as unknown as SupabaseClient,
      context.userId,
      data,
    );
  });
