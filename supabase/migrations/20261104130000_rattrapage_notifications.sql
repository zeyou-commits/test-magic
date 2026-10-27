-- BledWay · Rattrapage des notifications pour ceux qui suivent après coup.
-- 1. Un message de l'équipe reste envoyé aux nouveaux abonnés de sa cible tant qu'il est d'actualité
--    (valid_until), avec le nombre de comptes arrivés après l'envoi.
-- 2. Réactiver un suivi ou se déclarer voyageur (« Ma traversée ») déclenche l'envoi immédiat,
--    comme un nouveau suivi.
-- Prérequis : script 20261104120000_messages_admin.sql. Script additif, il peut être relancé.
BEGIN;

ALTER TABLE public.bw_admin_messages ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE public.bw_admin_messages ADD COLUMN IF NOT EXISTS late_recipients integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS bw_admin_messages_live ON public.bw_admin_messages(valid_until)
  WHERE status = 'sent' AND valid_until IS NOT NULL;

-- Le déclencheur d'envoi immédiat existe si le script du 03/11/2026 a été exécuté.
DO $do$
BEGIN
  IF to_regprocedure('private.bw_kick_dispatch()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS bw_kick_dispatch_update ON public.bw_follows;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'bw_follows' AND column_name = 'traveller') THEN
      CREATE TRIGGER bw_kick_dispatch_update AFTER UPDATE OF active, traveller ON public.bw_follows
        FOR EACH STATEMENT EXECUTE FUNCTION private.bw_kick_dispatch();
    ELSE
      CREATE TRIGGER bw_kick_dispatch_update AFTER UPDATE OF active ON public.bw_follows
        FOR EACH STATEMENT EXECUTE FUNCTION private.bw_kick_dispatch();
    END IF;
    DROP TRIGGER IF EXISTS bw_kick_dispatch ON public.bw_itinerary_watches;
    CREATE TRIGGER bw_kick_dispatch AFTER INSERT ON public.bw_itinerary_watches
      FOR EACH STATEMENT EXECUTE FUNCTION private.bw_kick_dispatch();
    RAISE NOTICE 'Envoi immédiat aussi à la réactivation d''un suivi et à une nouvelle alerte d''ouverture.';
  ELSE
    RAISE NOTICE 'Envoi immédiat non installé (script du 03/11/2026) : le rattrapage se fera au passage automatique.';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
