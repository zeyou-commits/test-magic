-- BledWay · Notifications envoyées immédiatement sur les téléphones.
-- Dès qu'un événement arrive (changement de traversée, signalement, nouveau suivi), la base appelle
-- la route d'envoi du site. Le passage toutes les 10 minutes reste en secours (renvois, rappels J-1).
--
-- PRÉREQUIS (une seule fois, voir le LISEZMOI) :
--   1. Database → Extensions : activer pg_net et pg_cron.
--   2. Enregistrer deux secrets dans le coffre (Vault), en tapant soi-même la valeur de CRON_SECRET :
--        select vault.create_secret('https://test-magic-three.vercel.app/api/push-dispatch', 'bledway_dispatch_url');
--        select vault.create_secret('<valeur de CRON_SECRET>', 'bledway_cron_secret');
-- Sans ces prérequis, le script s'installe quand même mais ne déclenche rien (aucune erreur).
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Dernier appel, pour ne pas appeler le site plus d'une fois toutes les 20 secondes.
CREATE TABLE IF NOT EXISTS private.bw_dispatch_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_kick timestamptz NOT NULL DEFAULT to_timestamp(0)
);
INSERT INTO private.bw_dispatch_state(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Appel de la route d'envoi (asynchrone, après validation de l'enregistrement).
--    Toute erreur est ignorée : un signalement ou un suivi n'est jamais bloqué par l'envoi.
CREATE OR REPLACE FUNCTION private.bw_kick_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE url text; secret text; claimed integer;
BEGIN
  BEGIN
    IF to_regnamespace('net') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN NULL; END IF;
    UPDATE private.bw_dispatch_state SET last_kick = now()
     WHERE id = 1 AND last_kick < now() - interval '20 seconds';
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed = 0 THEN RETURN NULL; END IF;
    EXECUTE $q$SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_dispatch_url'),
                      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')$q$
      INTO url, secret;
    IF url IS NULL OR secret IS NULL THEN RETURN NULL; END IF;
    EXECUTE $q$SELECT net.http_get(url := $1, headers := jsonb_build_object('Authorization', 'Bearer ' || $2),
                                   timeout_milliseconds := 30000)$q$ USING url, secret;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Envoi immédiat non déclenché : %', SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_kick_dispatch() FROM PUBLIC;

-- 3. Événements qui déclenchent un envoi immédiat (une fois par instruction, pas par ligne).
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bw_voyage_events','bw_travel_alerts','bw_follows','bw_alert_confirmations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS bw_kick_dispatch ON public.%I', t);
      EXECUTE format('CREATE TRIGGER bw_kick_dispatch AFTER INSERT ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.bw_kick_dispatch()', t);
    END IF;
  END LOOP;
END
$do$;

-- 4. Passage de secours toutes les 10 minutes (renvois après échec, rappels J-7, J-2 et la veille).
DO $setup$
DECLARE existing_job bigint; command_text text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    IF (SELECT count(DISTINCT name) FROM vault.decrypted_secrets WHERE name IN ('bledway_dispatch_url', 'bledway_cron_secret')) = 2 THEN
      command_text := $job$SELECT net.http_get(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_dispatch_url'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
        timeout_milliseconds := 30000
      );$job$;
      EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''bledway-push-10m'' LIMIT 1' INTO existing_job;
      IF existing_job IS NULL THEN
        EXECUTE 'SELECT cron.schedule(''bledway-push-10m'', ''*/10 * * * *'', $1)' USING command_text;
      ELSE
        EXECUTE 'SELECT cron.alter_job($1, schedule := ''*/10 * * * *'', command := $2, active := true)' USING existing_job, command_text;
      END IF;
      RAISE NOTICE 'Envoi immédiat et passage toutes les 10 minutes : actifs.';
    ELSE
      RAISE NOTICE 'Secrets bledway_dispatch_url et bledway_cron_secret absents du coffre : voir le LISEZMOI.';
    END IF;
  ELSE
    RAISE NOTICE 'Activez pg_cron et pg_net (Database → Extensions), puis relancez ce script.';
  END IF;
END
$setup$;

COMMIT;
