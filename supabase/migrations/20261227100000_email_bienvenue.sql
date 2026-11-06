-- E-mail de bienvenue (07/11/2026) : envoyé une seule fois, quand un compte est confirmé.
-- Google : confirmé dès la création ; e-mail/mot de passe : au clic sur le lien de confirmation.
-- Seuls les comptes créés à partir de la mise en service sont concernés (aucun envoi aux anciens).
-- Envoi par la fonction welcome-email (Resend, contact@bledway.com), appelée par pg_net avec le
-- même secret que les tâches planifiées.

CREATE TABLE IF NOT EXISTS public.bw_welcome_emails (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.bw_welcome_emails ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lisible seulement par la clé de service et l'équipe via les fonctions.

CREATE OR REPLACE FUNCTION public.bw_welcome_claim(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u auth.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = p_user AND email IS NOT NULL AND email_confirmed_at IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.bw_welcome_emails(user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'email', u.email,
    'name', left(coalesce(nullif(u.raw_user_meta_data->>'display_name', ''),
                          nullif(split_part(u.raw_user_meta_data->>'full_name', ' ', 1), ''),
                          nullif(split_part(u.raw_user_meta_data->>'name', ' ', 1), ''), ''), 40)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.bw_welcome_done(p_user uuid, p_ok boolean, p_detail text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.bw_welcome_emails
     SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN p_ok THEN now() END,
         detail = left(p_detail, 300)
   WHERE user_id = p_user;
$function$;

REVOKE ALL ON FUNCTION public.bw_welcome_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_welcome_done(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_welcome_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_welcome_done(uuid, boolean, text) TO service_role;

-- Déclencheur : compte confirmé (création déjà confirmée, ou confirmation ultérieure).
CREATE OR REPLACE FUNCTION private.bw_welcome_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.email_confirmed_at IS NULL)
     AND NEW.created_at >= '2026-11-07 00:00+00' THEN
    PERFORM net.http_post(
      url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
      body := jsonb_build_object('user_id', NEW.id),
      timeout_milliseconds := 20000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Un envoi raté ne doit jamais empêcher la création ou la confirmation d'un compte.
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS bw_welcome_email ON auth.users;
CREATE TRIGGER bw_welcome_email
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.bw_welcome_trigger();
