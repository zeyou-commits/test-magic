import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push-dispatch")({
  server: { handlers: { GET: async ({ request }) => {
    const secret = process.env['CRON_SECRET'];
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
    // Affectation automatique des bateaux d'abord : les notifications annoncent alors le bon navire.
    // Un échec ici ne bloque jamais l'envoi des notifications.
    try {
      const { scheduledAutoAssign } = await import("@/lib/admin/autoAssign.server");
      await scheduledAutoAssign();
    } catch (error) {
      console.error("[auto-assign]", error);
    }
    try {
      const { dispatchPush } = await import("@/lib/notifications/dispatch.server");
      return Response.json(await dispatchPush(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("[push-dispatch]", error);
      return Response.json({ error: "Dispatch failed" }, { status: 500 });
    }
  } } },
});
