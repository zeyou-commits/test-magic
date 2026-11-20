-- Adresses e-mail interdites (20/11/2026).
-- Quand un administrateur supprime un compte, il peut aussi interdire son adresse : plus aucune
-- inscription (e-mail, Google, invitation) ni changement d'adresse vers celle-ci n'est accepté.
-- Lecture et écriture seulement par le serveur (service_role), après vérification « administrateur ».
-- Script rejouable : aucune donnée existante n'est modifiée.

CREATE TABLE IF NOT EXISTS public.bw_banned_emails (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  reason text,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_banned_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_banned_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bw_banned_emails TO service_role;

-- Garde-fou sur auth.users : refuse la création ou le passage à une adresse interdite.
CREATE OR REPLACE FUNCTION public.bw_block_banned_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.bw_banned_emails b WHERE b.email = lower(btrim(NEW.email))) THEN
    RAISE EXCEPTION 'Cette adresse e-mail ne peut plus être utilisée sur BledWay.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bw_block_banned_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bw_block_banned_email ON auth.users;
CREATE TRIGGER bw_block_banned_email
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bw_block_banned_email();

-- Contrôle commun : l'acteur est un administrateur actif.
CREATE OR REPLACE FUNCTION public.bw_admin_is_active_admin(_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = _actor AND r.role::text = 'admin' AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  )
$$;

CREATE OR REPLACE FUNCTION public.bw_admin_ban_email(_actor uuid, _email text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF NOT public.bw_admin_is_active_admin(_actor) OR e = '' OR position('@' in e) = 0 THEN
    RAISE EXCEPTION 'Interdiction non autorisée.';
  END IF;
  INSERT INTO public.bw_banned_emails(email, reason, banned_by)
  VALUES (e, left(_reason, 500), _actor)
  ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = now();
  INSERT INTO public.bw_user_admin_log(actor_id, target_id, action, details)
  VALUES (_actor, NULL, 'email_banned', jsonb_build_object('email', e, 'reason', left(_reason, 500)));
END $$;

CREATE OR REPLACE FUNCTION public.bw_admin_unban_email(_actor uuid, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF NOT public.bw_admin_is_active_admin(_actor) THEN
    RAISE EXCEPTION 'Levée non autorisée.';
  END IF;
  DELETE FROM public.bw_banned_emails WHERE email = e;
  INSERT INTO public.bw_user_admin_log(actor_id, target_id, action, details)
  VALUES (_actor, NULL, 'email_unbanned', jsonb_build_object('email', e));
END $$;

CREATE OR REPLACE FUNCTION public.bw_admin_banned_emails(_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.bw_admin_is_active_admin(_actor) THEN
    RAISE EXCEPTION 'Lecture non autorisée.';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('email', b.email, 'reason', b.reason, 'created_at', b.created_at)
                     ORDER BY b.created_at DESC)
    FROM public.bw_banned_emails b
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.bw_admin_email_is_banned(_actor uuid, _email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.bw_admin_is_active_admin(_actor) THEN
    RAISE EXCEPTION 'Lecture non autorisée.';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.bw_banned_emails WHERE email = lower(btrim(coalesce(_email, ''))));
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_is_active_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_admin_ban_email(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_admin_unban_email(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_admin_banned_emails(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_admin_email_is_banned(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_is_active_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_admin_ban_email(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_admin_unban_email(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_admin_banned_emails(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_admin_email_is_banned(uuid, text) TO service_role;
