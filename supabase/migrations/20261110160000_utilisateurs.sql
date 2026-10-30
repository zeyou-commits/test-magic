-- BledWay · Gestion des utilisateurs : onglets Équipe / Voyageurs, chiffres clés, fiche d'un compte
-- (activité, téléphones, historique), export de ses données (RGPD) et historique lisible.
-- Aucune donnée n'est modifiée par ce script. Toutes les fonctions sont réservées au serveur
-- (service_role), appelées par /api/admin-users après vérification d'un administrateur actif.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.bw_active_admin(_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = _actor AND r.role::text = 'admin' AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now()));
$$;
REVOKE ALL ON FUNCTION private.bw_active_admin(uuid) FROM PUBLIC;

-- 1. Liste paginée : ajout du filtre « travellers » (comptes sans rôle d'équipe).
CREATE OR REPLACE FUNCTION public.bw_admin_users_page(_actor uuid, _search text DEFAULT '', _page integer DEFAULT 1, _filter text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  WITH matched AS (
    SELECT u.id, u.email, p.display_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
      COALESCE((SELECT jsonb_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user'), '[]'::jsonb) AS roles
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.deleted_at IS NULL
      AND (length(trim(_search)) = 0 OR position(lower(trim(_search)) IN lower(COALESCE(u.email, '') || ' ' || COALESCE(p.display_name, ''))) > 0)
      AND (_filter = 'all'
        OR (_filter = 'banned' AND u.banned_until > now())
        OR (_filter = 'team' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user'))
        OR (_filter = 'travellers' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user')))
  ), page AS (SELECT * FROM matched ORDER BY created_at DESC, id LIMIT 30 OFFSET (GREATEST(1, LEAST(_page, 100000)) - 1) * 30)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'audit', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM (SELECT actor_id, target_id, action, created_at FROM public.bw_user_admin_log ORDER BY created_at DESC LIMIT 12) l)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) TO service_role;

-- 2. Chiffres clés.
CREATE OR REPLACE FUNCTION public.bw_admin_users_stats(_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; push_users bigint := 0; push_devices bigint := 0;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  IF to_regclass('public.bw_push_subscriptions') IS NOT NULL THEN
    EXECUTE 'SELECT count(DISTINCT user_id), count(*) FROM public.bw_push_subscriptions' INTO push_users, push_devices;
  END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'active7', count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '7 days'),
    'new7', count(*) FILTER (WHERE u.created_at > now() - interval '7 days'),
    'banned', count(*) FILTER (WHERE u.banned_until > now()),
    'team', (SELECT count(DISTINCT r.user_id) FROM public.user_roles r WHERE r.role::text <> 'user'),
    'push_users', push_users,
    'push_devices', push_devices
  ) INTO result
  FROM auth.users u WHERE u.deleted_at IS NULL;
  RETURN result;
END $$;

-- Tables (et colonnes) qui pointent vers un compte, sauf rôles et journal d'administration.
CREATE OR REPLACE FUNCTION private.bw_user_tables() RETURNS TABLE (tbl regclass, col name)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.conrelid::regclass, a.attname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
    AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
    AND c.connamespace = 'public'::regnamespace
    AND c.conrelid NOT IN ('public.user_roles'::regclass, 'public.bw_user_admin_log'::regclass, 'public.profiles'::regclass);
$$;
REVOKE ALL ON FUNCTION private.bw_user_tables() FROM PUBLIC;

-- 3. Fiche d'un compte : identité, profil voyageur, activité par table, téléphones, historique.
CREATE OR REPLACE FUNCTION public.bw_admin_user_detail(_actor uuid, _target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n bigint; activity jsonb := '{}'::jsonb; account jsonb; traveller jsonb; devices jsonb := '[]'::jsonb; history jsonb;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  SELECT jsonb_build_object('id', u.id, 'email', u.email, 'display_name', p.display_name, 'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
      'roles', COALESCE((SELECT jsonb_agg(x.role::text ORDER BY x.role::text) FROM public.user_roles x WHERE x.user_id = u.id AND x.role::text <> 'user'), '[]'::jsonb))
    INTO account
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _target AND u.deleted_at IS NULL;
  IF account IS NULL THEN RAISE EXCEPTION 'Compte introuvable.'; END IF;

  IF to_regclass('public.bw_traveller_profiles') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(t) - ''user_id'' FROM public.bw_traveller_profiles t WHERE t.user_id = $1' INTO traveller USING _target;
  END IF;

  FOR r IN SELECT * FROM private.bw_user_tables() LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING _target;
    IF n > 0 THEN activity := activity || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;

  IF to_regclass('public.bw_push_subscriptions') IS NOT NULL THEN
    EXECUTE $q$SELECT COALESCE(jsonb_agg(jsonb_build_object('created_at', created_at, 'last_success_at', last_success_at,
        'host', split_part(split_part(endpoint, '://', 2), '/', 1)) ORDER BY created_at DESC), '[]'::jsonb)
      FROM public.bw_push_subscriptions WHERE user_id = $1$q$ INTO devices USING _target;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('action', l.action, 'created_at', l.created_at, 'details', l.details,
      'actor', COALESCE(ap.display_name, au.email, 'Compte supprimé')) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO history
  FROM (SELECT * FROM public.bw_user_admin_log WHERE target_id = _target ORDER BY created_at DESC LIMIT 30) l
  LEFT JOIN auth.users au ON au.id = l.actor_id LEFT JOIN public.profiles ap ON ap.id = l.actor_id;

  RETURN jsonb_build_object('account', account, 'traveller', traveller, 'activity', activity, 'devices', devices, 'history', history);
END $$;

-- 4. Export RGPD : toutes les lignes liées au compte, sans clés techniques ni secrets.
CREATE OR REPLACE FUNCTION public.bw_admin_user_export(_actor uuid, _target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; rows jsonb; data jsonb := '{}'::jsonb; account jsonb;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  SELECT jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'display_name', p.display_name)
    INTO account FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = _target;
  IF account IS NULL THEN RAISE EXCEPTION 'Compte introuvable.'; END IF;
  FOR r IN SELECT * FROM private.bw_user_tables() LOOP
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) - ARRAY[''p256dh'',''auth_key'',''endpoint'',''token'',''secret'']), ''[]''::jsonb) FROM (SELECT * FROM %s WHERE %I = $1 LIMIT 5000) t',
      r.tbl, r.col) INTO rows USING _target;
    IF jsonb_array_length(rows) > 0 THEN data := data || jsonb_build_object(r.tbl::text || '.' || r.col, rows); END IF;
  END LOOP;
  RETURN jsonb_build_object('exported_at', now(), 'account', account, 'data', data);
END $$;

-- 5. Historique lisible : qui a fait quoi, à qui.
CREATE OR REPLACE FUNCTION public.bw_admin_audit_page(_actor uuid, _limit integer DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'action', l.action, 'created_at', l.created_at, 'details', l.details, 'target_id', l.target_id,
      'actor', COALESCE(ap.display_name, au.email, 'Compte supprimé'),
      'target', CASE WHEN l.target_id IS NULL THEN NULL ELSE COALESCE(tp.display_name, tu.email, 'Compte supprimé') END
    ) ORDER BY l.created_at DESC), '[]'::jsonb) INTO result
  FROM (SELECT * FROM public.bw_user_admin_log ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(_limit, 200))) l
  LEFT JOIN auth.users au ON au.id = l.actor_id LEFT JOIN public.profiles ap ON ap.id = l.actor_id
  LEFT JOIN auth.users tu ON tu.id = l.target_id LEFT JOIN public.profiles tp ON tp.id = l.target_id;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.bw_admin_users_stats(uuid), public.bw_admin_user_detail(uuid,uuid),
  public.bw_admin_user_export(uuid,uuid), public.bw_admin_audit_page(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_users_stats(uuid), public.bw_admin_user_detail(uuid,uuid),
  public.bw_admin_user_export(uuid,uuid), public.bw_admin_audit_page(uuid,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
