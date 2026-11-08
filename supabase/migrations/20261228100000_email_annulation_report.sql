-- E-mail pour les annulations et les reports (08/11/2026).
-- Sur iPhone, une notification n'arrive que si BledWay est installé sur l'écran d'accueil : pour une
-- annulation (modèle « cancel ») ou un nouvel horaire (« reschedule »), chaque compte prévenu reçoit
-- aussi un e-mail. Les retards ne sont PAS envoyés par e-mail (décision du 08/11/2026).
-- Déclenchement MANUEL (décision du 08/11/2026) : seulement si l'équipe coche « Prévenir aussi par
-- e-mail » dans l'admin (colonne bw_admin_messages.email).
-- Circuit : la notification créée dans le compte remplit une file ; la fonction alert-email
-- (Resend, contact@bledway.com) la vide par lots, appelée par pg_net avec le secret des tâches.

ALTER TABLE public.bw_admin_messages ADD COLUMN IF NOT EXISTS email boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bw_alert_emails (
  notification_id uuid PRIMARY KEY REFERENCES public.bw_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS bw_alert_emails_queued ON public.bw_alert_emails (created_at) WHERE status = 'queued';
ALTER TABLE public.bw_alert_emails ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lisible seulement par la clé de service.

-- Réserve jusqu'à p_limit e-mails en attente, avec l'adresse et le texte de la notification.
-- Un compte sans adresse confirmée est écarté (« skipped »).
CREATE OR REPLACE FUNCTION public.bw_alert_email_claim(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  UPDATE public.bw_alert_emails q SET status = 'skipped', detail = 'pas d''adresse confirmée'
   WHERE q.status = 'queued'
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = q.user_id AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL);
  WITH picked AS (
    SELECT q.notification_id FROM public.bw_alert_emails q
     WHERE q.status = 'queued'
     ORDER BY q.created_at
     LIMIT greatest(1, least(p_limit, 100))
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.bw_alert_emails q SET status = 'sending'
      FROM picked WHERE q.notification_id = picked.notification_id
    RETURNING q.notification_id, q.user_id, q.template
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.notification_id,
           'template', c.template,
           'email', u.email,
           'name', left(coalesce(nullif(u.raw_user_meta_data->>'display_name', ''),
                                 nullif(split_part(u.raw_user_meta_data->>'full_name', ' ', 1), ''),
                                 nullif(split_part(u.raw_user_meta_data->>'name', ' ', 1), ''), ''), 40),
           'title', n.title,
           'body', n.body,
           'url', n.url)), '[]'::jsonb)
    INTO result
    FROM claimed c
    JOIN auth.users u ON u.id = c.user_id
    JOIN public.bw_notifications n ON n.id = c.notification_id;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_alert_email_done(p_ids uuid[], p_ok boolean, p_detail text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.bw_alert_emails
     SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN p_ok THEN now() END,
         detail = left(p_detail, 300)
   WHERE notification_id = ANY(p_ids);
$function$;

REVOKE ALL ON FUNCTION public.bw_alert_email_claim(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_alert_email_done(uuid[], boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_alert_email_claim(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_alert_email_done(uuid[], boolean, text) TO service_role;

-- Déclencheur : une fois par lot de notifications créées. Seuls les messages de l'équipe
-- « annulation » et « nouvel horaire » passent ; un appel à alert-email vide la file.
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

DROP TRIGGER IF EXISTS bw_alert_email ON public.bw_notifications;
CREATE TRIGGER bw_alert_email
  AFTER INSERT ON public.bw_notifications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.bw_alert_email_trigger();
