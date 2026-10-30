-- BledWay · Écoute AIS ciblée toutes les 10 minutes, gratuite : Supabase appelle /api/ais-refresh,
-- qui n'écoute (40 s) que les navires proches d'un départ ou d'une arrivée prévus.
-- Aucune donnée n'est modifiée par ce script.
--
-- PRÉREQUIS : les mêmes que l'envoi immédiat des notifications (déjà en place si ce dernier marche) :
--   1. Database → Extensions : pg_net et pg_cron activés.
--   2. Coffre (Vault) : secrets « bledway_dispatch_url » et « bledway_cron_secret ».
-- L'adresse de l'écoute est déduite de bledway_dispatch_url (…/api/push-dispatch → …/api/ais-refresh).
-- Sans ces prérequis, le script s'installe sans rien déclencher et l'indique dans un message.
DO $setup$
DECLARE existing_job bigint; command_text text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    IF (SELECT count(DISTINCT name) FROM vault.decrypted_secrets WHERE name IN ('bledway_dispatch_url', 'bledway_cron_secret')) = 2 THEN
      command_text := $job$SELECT net.http_get(
        url := replace((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_dispatch_url'), '/api/push-dispatch', '/api/ais-refresh'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
        timeout_milliseconds := 60000
      );$job$;
      EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''bledway-ais-10m'' LIMIT 1' INTO existing_job;
      IF existing_job IS NULL THEN
        EXECUTE 'SELECT cron.schedule(''bledway-ais-10m'', ''3-59/10 * * * *'', $1)' USING command_text;
      ELSE
        EXECUTE 'SELECT cron.alter_job($1, schedule := ''3-59/10 * * * *'', command := $2, active := true)' USING existing_job, command_text;
      END IF;
      RAISE NOTICE 'Écoute AIS ciblée : active toutes les 10 minutes.';
    ELSE
      RAISE NOTICE 'Écoute AIS ciblée non programmée : secrets bledway_dispatch_url / bledway_cron_secret absents du coffre.';
    END IF;
  ELSE
    RAISE NOTICE 'Écoute AIS ciblée non programmée : activez pg_cron et pg_net (Database → Extensions), puis relancez ce script.';
  END IF;
END
$setup$;
