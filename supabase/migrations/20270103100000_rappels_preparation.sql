-- Rappels d'échéance de « Préparer mon voyage » (14/11/2026).
-- Les dates du calendrier à rebours (les démarches longues : visa, passeport…) sont calculées sur
-- l'appareil. Pour un compte connecté, la page les recopie ici avec leur case cochée ou non.
-- L'envoi quotidien (/api/push-dispatch) crée un rappel dans le compte (notification + push) le jour
-- où une échéance arrive sans case cochée ; ce rappel part aussi par e-mail (modèle « deadline »).
-- Un compte qui a coupé les rappels (bw_notification_preferences.reminders) ne reçoit rien.

CREATE TABLE IF NOT EXISTS public.bw_prepare_deadlines (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  who text NOT NULL DEFAULT '' CHECK (char_length(who) <= 200),
  due_day date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  reminded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS bw_prepare_deadlines_due
  ON public.bw_prepare_deadlines (due_day) WHERE NOT done AND reminded_at IS NULL;

ALTER TABLE public.bw_prepare_deadlines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_prepare_deadlines_own ON public.bw_prepare_deadlines;
CREATE POLICY bw_prepare_deadlines_own ON public.bw_prepare_deadlines FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_prepare_deadlines TO authenticated;

-- Une date déplacée (autre période de départ) redonne droit à un rappel ; le voyageur ne peut pas
-- marquer lui-même un rappel comme envoyé.
CREATE OR REPLACE FUNCTION private.bw_prepare_deadlines_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'authenticated' THEN NEW.reminded_at := NULL; END IF;
  ELSIF NEW.due_day IS DISTINCT FROM OLD.due_day THEN
    NEW.reminded_at := NULL;
  ELSIF current_user = 'authenticated' THEN
    NEW.reminded_at := OLD.reminded_at;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS bw_prepare_deadlines_touch ON public.bw_prepare_deadlines;
CREATE TRIGGER bw_prepare_deadlines_touch
  BEFORE INSERT OR UPDATE ON public.bw_prepare_deadlines
  FOR EACH ROW EXECUTE FUNCTION private.bw_prepare_deadlines_touch();

-- La file d'e-mails : en plus des annulations et reports cochés par l'équipe, les rappels
-- d'échéance de la préparation (clé « prepare-deadline:… »).
CREATE OR REPLACE FUNCTION private.bw_alert_email_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE added integer;
BEGIN
  INSERT INTO public.bw_alert_emails (notification_id, user_id, template)
  SELECT n.id, n.user_id, m.template
    FROM new_rows n
    JOIN public.bw_admin_messages m
      ON n.event_key LIKE 'admin-msg:%'
     AND m.id::text = split_part(n.event_key, ':', 3)
   WHERE m.template IN ('cancel', 'reschedule') AND m.email
  UNION ALL
  SELECT n.id, n.user_id, 'deadline'
    FROM new_rows n
   WHERE n.event_key LIKE 'prepare-deadline:%'
  ON CONFLICT (notification_id) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added > 0 THEN
    PERFORM net.http_post(
      url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/alert-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  -- Un e-mail raté ne doit jamais empêcher la notification dans le compte ni le push.
  RETURN NULL;
END $function$;
