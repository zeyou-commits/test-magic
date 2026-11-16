-- Alertes « prévenez-moi à l'ouverture des ventes » envoyées automatiquement (16/11/2026).
-- Une recherche dont les dates dépassent le calendrier commercial d'une compagnie propose, à un
-- compte connecté, d'être prévenu (sales_alerts, journey_context.kind = 'sales-opening').
-- L'envoi quotidien (/api/push-dispatch) regarde chaque alerte ouverte : dès qu'une compagnie
-- choisie publie un départ commercial (pas « Estimé ») à la date la plus tardive demandée, le compte
-- reçoit une notification « openings » (compte + push) et un e-mail (modèle « opening »).
-- Une compagnie n'est annoncée qu'une fois ; l'alerte se ferme quand toutes l'ont été, ou quand
-- les dates sont passées. Les anciennes alertes par simple e-mail (sans compte) ne sont pas envoyées.

ALTER TABLE public.sales_alerts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notified_companies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS sales_alerts_open
  ON public.sales_alerts (period_end) WHERE closed_at IS NULL AND user_id IS NOT NULL;

-- Le compte vient de la session, jamais de ce qu'envoie la page ; l'état d'envoi non plus.
CREATE OR REPLACE FUNCTION private.bw_sales_alerts_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.user_id := auth.uid();
    NEW.notified_companies := '{}';
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS bw_sales_alerts_owner ON public.sales_alerts;
CREATE TRIGGER bw_sales_alerts_owner
  BEFORE INSERT ON public.sales_alerts
  FOR EACH ROW EXECUTE FUNCTION private.bw_sales_alerts_owner();

-- La file d'e-mails : annulations et reports cochés par l'équipe, rappels de préparation, et
-- maintenant l'ouverture des ventes (clé « sales-opening:… »).
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
  UNION ALL
  SELECT n.id, n.user_id, 'opening'
    FROM new_rows n
   WHERE n.event_key LIKE 'sales-opening:%'
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
