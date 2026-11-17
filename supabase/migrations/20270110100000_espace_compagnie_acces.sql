-- BledWay · Espace compagnie, lot 1 : accès professionnels.
-- Un compte personnel est rattaché à une compagnie par BledWay (invitation à usage unique),
-- avec un niveau « Lecture » ou « Opérations ». BledWay peut suspendre, réactiver ou retirer
-- un accès, et suspendre tout l'espace d'une compagnie.
--
-- Principes :
-- - public.app_role n'est pas modifié : les rôles d'équipe restent séparés des accès externes.
-- - Les trois tables n'ont aucune politique pour anon/authenticated : aucun accès direct.
--   Tout passe par les fonctions ci-dessous, exécutables seulement par le serveur (service_role),
--   qui reçoivent l'identité vérifiée (_actor / _user) et refont tous les contrôles.
-- - Journal : public.bw_user_admin_log (déjà utilisé par la gestion des comptes).
-- - Fusion de compagnies : bw_admin_merge_companies déplace déjà toutes les colonnes company_id ;
--   les accès suivent la compagnie gardée. Suppression : une compagnie qui a un historique d'accès
--   reste « utilisée » et ne peut pas être supprimée (protection voulue).
-- Script relançable : IF NOT EXISTS / CREATE OR REPLACE ; aucun droit élargi sur l'existant.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Tables ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bw_company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('read', 'operations')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  invite_id uuid,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  status_reason text CHECK (status_reason IS NULL OR char_length(status_reason) <= 500),
  status_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status_changed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Un seul accès vivant par compte et par compagnie ; les accès retirés restent pour l'historique.
CREATE UNIQUE INDEX IF NOT EXISTS bw_company_members_live
  ON public.bw_company_members (company_id, user_id) WHERE status <> 'revoked';
CREATE INDEX IF NOT EXISTS bw_company_members_user ON public.bw_company_members (user_id);

CREATE TABLE IF NOT EXISTS public.bw_company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 255),
  level text NOT NULL CHECK (level IN ('read', 'operations')),
  -- Seule l'empreinte SHA-256 du lien est gardée : le lien n'est montré qu'une fois.
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  verification text NOT NULL CHECK (char_length(btrim(verification)) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500)
);
CREATE INDEX IF NOT EXISTS bw_company_invites_company ON public.bw_company_invites (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bw_company_spaces (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bw_company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_spaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_company_members, public.bw_company_invites, public.bw_company_spaces
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bw_company_members, public.bw_company_invites, public.bw_company_spaces
  TO service_role;

-- 2. Contrôles (schéma private, réservés au serveur) --------------------------------------------

-- Administrateur BledWay dont le compte est actif.
CREATE OR REPLACE FUNCTION private.bw_company_admin_ok(_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = _actor AND r.role::text = 'admin'
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
$$;

-- Accès d'un compte à une compagnie, au niveau demandé, vérifié à chaque appel :
-- compte actif, accès actif, niveau suffisant, espace de la compagnie non suspendu.
CREATE OR REPLACE FUNCTION private.bw_company_access(_user uuid, _company uuid, _min text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _min IN ('read', 'operations') AND EXISTS (
    SELECT 1
    FROM public.bw_company_members m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.bw_company_spaces s ON s.company_id = m.company_id
    WHERE m.user_id = _user AND m.company_id = _company AND m.status = 'active'
      AND (_min = 'read' OR m.level = 'operations')
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND coalesce(s.status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.bw_company_log(
  _actor uuid, _target uuid, _action text, _company uuid, _details jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.bw_user_admin_log (actor_id, target_id, action, details)
  VALUES (_actor, _target, left(_action, 80),
          coalesce(_details, '{}'::jsonb) || jsonb_build_object('company_id', _company));
$$;

REVOKE ALL ON FUNCTION private.bw_company_admin_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_company_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_company_log(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_admin_ok(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_log(uuid, uuid, text, uuid, jsonb) TO service_role;

-- 3. Administration BledWay ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bw_company_access_overview(_actor uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  RETURN jsonb_build_object(
    'space', (
      SELECT jsonb_build_object('status', coalesce(s.status, 'active'), 'reason', s.reason,
                                'changedAt', s.changed_at)
      FROM (SELECT 1) one LEFT JOIN public.bw_company_spaces s ON s.company_id = _company
    ),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'userId', m.user_id, 'email', u.email, 'name', p.display_name,
        'level', m.level, 'status', m.status, 'reason', m.status_reason,
        'grantedAt', m.granted_at, 'grantedBy', coalesce(gp.display_name, gu.email),
        'statusChangedAt', m.status_changed_at, 'lastSignInAt', u.last_sign_in_at,
        'accountActive', u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
      ) ORDER BY (m.status = 'revoked'), m.granted_at DESC)
      FROM public.bw_company_members m
      JOIN auth.users u ON u.id = m.user_id
      LEFT JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN auth.users gu ON gu.id = m.granted_by
      LEFT JOIN public.profiles gp ON gp.id = m.granted_by
      WHERE m.company_id = _company
    ), '[]'::jsonb),
    'invites', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'level', i.level, 'verification', i.verification,
        'state', CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
        'expiresAt', i.expires_at, 'createdAt', i.created_at,
        'createdBy', coalesce(cp.display_name, cu.email), 'acceptedAt', i.accepted_at,
        'revokedAt', i.revoked_at, 'revokeReason', i.revoke_reason
      ) ORDER BY i.created_at DESC)
      FROM (SELECT * FROM public.bw_company_invites WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 50) i
      LEFT JOIN auth.users cu ON cu.id = i.created_by
      LEFT JOIN public.profiles cp ON cp.id = i.created_by
    ), '[]'::jsonb),
    'log', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'action', l.action, 'at', l.created_at, 'actor', coalesce(ap.display_name, au.email),
        'target', coalesce(tp.display_name, tu.email, l.details->>'email'),
        'level', l.details->>'level', 'reason', l.details->>'reason'
      ) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.bw_user_admin_log
            WHERE action LIKE 'company\_%' AND details->>'company_id' = _company::text
            ORDER BY created_at DESC LIMIT 40) l
      LEFT JOIN auth.users au ON au.id = l.actor_id
      LEFT JOIN public.profiles ap ON ap.id = l.actor_id
      LEFT JOIN auth.users tu ON tu.id = l.target_id
      LEFT JOIN public.profiles tp ON tp.id = l.target_id
    ), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_invite_create(
  _actor uuid, _company uuid, _email text, _level text, _token_hash text, _verification text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  clean text := lower(btrim(coalesce(_email, '')));
  existing uuid;
  created public.bw_company_invites;
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _level NOT IN ('read', 'operations') OR char_length(btrim(coalesce(_verification, ''))) < 3
     OR clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_access:' || _company::text));
  SELECT u.id INTO existing FROM auth.users u WHERE lower(u.email) = clean AND u.deleted_at IS NULL LIMIT 1;
  IF existing IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bw_company_members
    WHERE company_id = _company AND user_id = existing AND status <> 'revoked'
  ) THEN
    RAISE EXCEPTION 'BW_ALREADY_MEMBER';
  END IF;
  -- Une nouvelle invitation remplace la précédente encore ouverte pour la même adresse.
  UPDATE public.bw_company_invites
     SET status = 'revoked', revoked_by = _actor, revoked_at = now(),
         revoke_reason = 'Remplacée par une nouvelle invitation'
   WHERE company_id = _company AND email = clean AND status = 'pending';
  INSERT INTO public.bw_company_invites
    (company_id, email, level, token_hash, verification, expires_at, created_by)
  VALUES (_company, clean, _level, _token_hash, btrim(_verification), now() + interval '7 days', _actor)
  RETURNING * INTO created;
  PERFORM private.bw_company_log(_actor, existing, 'company_invite_created', _company,
    jsonb_build_object('email', clean, 'level', _level, 'invite_id', created.id,
                       'verification', btrim(_verification)));
  RETURN jsonb_build_object('id', created.id, 'expiresAt', created.expires_at,
                            'existingAccount', existing IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_invite_revoke(_actor uuid, _invite uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.bw_company_invites;
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO inv FROM public.bw_company_invites WHERE id = _invite FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'BW_INVITE_CLOSED'; END IF;
  UPDATE public.bw_company_invites
     SET status = 'revoked', revoked_by = _actor, revoked_at = now(),
         revoke_reason = left(nullif(btrim(coalesce(_reason, '')), ''), 500)
   WHERE id = _invite;
  PERFORM private.bw_company_log(_actor, NULL, 'company_invite_revoked', inv.company_id,
    jsonb_build_object('email', inv.email, 'invite_id', inv.id, 'reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_member_update(
  _actor uuid, _member uuid, _change text, _level text, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.bw_company_members;
  why text := left(nullif(btrim(coalesce(_reason, '')), ''), 500);
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO m FROM public.bw_company_members WHERE id = _member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF m.status = 'revoked' THEN RAISE EXCEPTION 'BW_MEMBER_REVOKED'; END IF;
  IF _change = 'level' THEN
    IF _level NOT IN ('read', 'operations') OR _level = m.level THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members SET level = _level, updated_at = now() WHERE id = _member;
  ELSIF _change = 'suspend' THEN
    IF m.status <> 'active' OR why IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members
       SET status = 'suspended', status_reason = why, status_changed_by = _actor,
           status_changed_at = now(), updated_at = now()
     WHERE id = _member;
  ELSIF _change = 'resume' THEN
    IF m.status <> 'suspended' THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members
       SET status = 'active', status_reason = why, status_changed_by = _actor,
           status_changed_at = now(), updated_at = now()
     WHERE id = _member;
  ELSIF _change = 'revoke' THEN
    IF why IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members
       SET status = 'revoked', status_reason = why, status_changed_by = _actor,
           status_changed_at = now(), updated_at = now()
     WHERE id = _member;
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  PERFORM private.bw_company_log(_actor, m.user_id, 'company_member_' || _change, m.company_id,
    jsonb_build_object('member_id', m.id, 'level', CASE WHEN _change = 'level' THEN _level ELSE m.level END,
                       'previous_level', m.level, 'reason', why));
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_space_set(
  _actor uuid, _company uuid, _status text, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE why text := left(nullif(btrim(coalesce(_reason, '')), ''), 500);
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _status NOT IN ('active', 'suspended') OR (_status = 'suspended' AND why IS NULL) THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  INSERT INTO public.bw_company_spaces (company_id, status, reason, changed_by, changed_at)
  VALUES (_company, _status, why, _actor, now())
  ON CONFLICT (company_id) DO UPDATE
    SET status = excluded.status, reason = excluded.reason,
        changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  PERFORM private.bw_company_log(_actor, NULL, 'company_space_' || _status, _company,
    jsonb_build_object('reason', why));
END $$;

-- 4. Côté collaborateur (identité vérifiée par le serveur) --------------------------------------

-- Acceptation d'une invitation. Renvoie un code de résultat ; le nom de la compagnie n'est
-- donné qu'en cas de succès, pour qu'un lien intercepté ne révèle rien.
CREATE OR REPLACE FUNCTION public.bw_company_invite_accept(_user uuid, _token_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inv public.bw_company_invites;
  u record;
  live public.bw_company_members;
  done jsonb;
BEGIN
  SELECT * INTO inv FROM public.bw_company_invites WHERE token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  SELECT id, email, email_confirmed_at,
         (deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now())) AS active
    INTO u FROM auth.users WHERE id = _user;
  IF NOT FOUND OR NOT u.active THEN RETURN jsonb_build_object('result', 'account_inactive'); END IF;
  SELECT jsonb_build_object('companyId', c.id, 'companyName', c.name) INTO done
    FROM public.companies c WHERE c.id = inv.company_id;
  IF inv.status = 'accepted' THEN
    IF inv.accepted_by = _user THEN RETURN done || jsonb_build_object('result', 'already_accepted'); END IF;
    RETURN jsonb_build_object('result', 'used');
  END IF;
  IF inv.status = 'revoked' THEN RETURN jsonb_build_object('result', 'revoked'); END IF;
  IF inv.expires_at <= now() THEN RETURN jsonb_build_object('result', 'expired'); END IF;
  IF lower(coalesce(u.email, '')) <> inv.email THEN
    PERFORM private.bw_company_log(_user, _user, 'company_invite_wrong_account', inv.company_id,
      jsonb_build_object('invite_id', inv.id));
    RETURN jsonb_build_object('result', 'wrong_account');
  END IF;
  IF u.email_confirmed_at IS NULL THEN RETURN jsonb_build_object('result', 'email_unconfirmed'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_access:' || inv.company_id::text));
  SELECT * INTO live FROM public.bw_company_members
   WHERE company_id = inv.company_id AND user_id = _user AND status <> 'revoked';
  IF FOUND AND live.status = 'suspended' THEN
    RETURN jsonb_build_object('result', 'suspended');
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.bw_company_members (company_id, user_id, level, invite_id, granted_by)
    VALUES (inv.company_id, _user, inv.level, inv.id, inv.created_by);
  END IF;
  UPDATE public.bw_company_invites
     SET status = 'accepted', accepted_by = _user, accepted_at = now()
   WHERE id = inv.id;
  PERFORM private.bw_company_log(_user, _user, 'company_invite_accepted', inv.company_id,
    jsonb_build_object('invite_id', inv.id, 'level', inv.level, 'email', inv.email));
  RETURN done || jsonb_build_object('result', CASE WHEN live.id IS NULL THEN 'accepted' ELSE 'already_member' END);
END $$;

-- Les compagnies d'un compte (accès non retirés), avec l'état de l'espace.
CREATE OR REPLACE FUNCTION public.bw_company_my_access(_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'companyId', c.id, 'name', c.name, 'slug', c.slug, 'logoUrl', c.logo_url,
    'level', m.level, 'status', m.status, 'spaceStatus', coalesce(s.status, 'active'),
    'usable', private.bw_company_access(_user, c.id, 'read')
  ) ORDER BY c.name), '[]'::jsonb)
  FROM public.bw_company_members m
  JOIN public.companies c ON c.id = m.company_id
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.bw_company_spaces s ON s.company_id = m.company_id
  WHERE m.user_id = _user AND m.status <> 'revoked'
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now());
$$;

-- L'équipe d'une compagnie, vue par un de ses collaborateurs (ou un administrateur BledWay) :
-- nom affiché et niveau seulement, jamais l'adresse e-mail complète.
CREATE OR REPLACE FUNCTION public.bw_company_team(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (private.bw_company_access(_user, _company, 'read') OR private.bw_company_admin_ok(_user)) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'name', coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)),
      'level', m.level, 'since', m.granted_at, 'you', m.user_id = _user
    ) ORDER BY m.granted_at)
    FROM public.bw_company_members m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.company_id = _company AND m.status = 'active'
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
  ), '[]'::jsonb);
END $$;

-- 5. Droits : serveur uniquement --------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.bw_company_access_overview(uuid, uuid),
  public.bw_company_invite_create(uuid, uuid, text, text, text, text),
  public.bw_company_invite_revoke(uuid, uuid, text),
  public.bw_company_member_update(uuid, uuid, text, text, text),
  public.bw_company_space_set(uuid, uuid, text, text),
  public.bw_company_invite_accept(uuid, text),
  public.bw_company_my_access(uuid),
  public.bw_company_team(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_access_overview(uuid, uuid),
  public.bw_company_invite_create(uuid, uuid, text, text, text, text),
  public.bw_company_invite_revoke(uuid, uuid, text),
  public.bw_company_member_update(uuid, uuid, text, text, text),
  public.bw_company_space_set(uuid, uuid, text, text),
  public.bw_company_invite_accept(uuid, text),
  public.bw_company_my_access(uuid),
  public.bw_company_team(uuid, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
