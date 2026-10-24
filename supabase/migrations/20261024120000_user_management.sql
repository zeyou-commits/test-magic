ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.bw_user_admin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_user_admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_user_admin_log FROM anon, authenticated;
GRANT ALL ON public.bw_user_admin_log TO service_role;

-- Le contrôle reste valable pour un ancien JWT, même après bannissement/suppression.
CREATE OR REPLACE FUNCTION private.bw_account_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()
    AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()));
$$;
REVOKE ALL ON FUNCTION private.bw_account_active() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.bw_account_active() TO authenticated;

-- Politique restrictive : complète les politiques existantes, sans ouvrir aucun droit.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND c.relrowsecurity AND (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS bw_active_account ON %I.%I', t.nspname,t.relname);
    EXECUTE format('CREATE POLICY bw_active_account ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.bw_account_active())) WITH CHECK ((SELECT private.bw_account_active()))',t.nspname,t.relname);
  END LOOP;
END $$;

-- Droits limités des collaborateurs ; les voyageurs ne peuvent pas se promouvoir.
CREATE OR REPLACE FUNCTION private.bw_staff_permission(_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=auth.uid() AND r.role::text=ANY(_roles) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION private.bw_staff_permission(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bw_staff_permission(text[]) TO authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ports','routes','route_operators','companies','vessels','schedules','schedule_exceptions','departures'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS bw_editor_manage ON public.%I',t);
      EXECUTE format('CREATE POLICY bw_editor_manage ON public.%I FOR ALL TO authenticated USING ((SELECT private.bw_staff_permission(ARRAY[''editor'']))) WITH CHECK ((SELECT private.bw_staff_permission(ARRAY[''editor''])))',t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['port_reviews','review_ratings','reports','bw_vessel_reviews','bw_travel_alerts','bw_alert_confirmations'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS bw_moderator_manage ON public.%I',t);
      EXECUTE format('CREATE POLICY bw_moderator_manage ON public.%I FOR ALL TO authenticated USING ((SELECT private.bw_staff_permission(ARRAY[''moderator'']))) WITH CHECK ((SELECT private.bw_staff_permission(ARRAY[''moderator''])))',t);
    END IF;
  END LOOP;
END $$;

-- Un même verrou sérialise les changements de rôles et d'état Auth.
CREATE OR REPLACE FUNCTION private.bw_guard_user_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(24102026);
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.role::text='admin' THEN
    IF auth.uid()=OLD.user_id THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer vos propres droits.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id
      WHERE r.role::text='admin' AND r.user_id<>OLD.user_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))
      THEN RAISE EXCEPTION 'Impossible de retirer le dernier administrateur actif.'; END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=NEW.user_id AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now()))
    THEN RAISE EXCEPTION 'Réactivez le compte avant de lui attribuer un rôle.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_user_roles_guard ON public.user_roles;
CREATE TRIGGER bw_user_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION private.bw_guard_user_role();

CREATE OR REPLACE FUNCTION private.bw_guard_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(24102026);
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.deleted_at IS NOT NULL OR NEW.banned_until>now())) THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=OLD.id AND role::text='admin') THEN
      RAISE EXCEPTION 'Retirez le rôle administrateur avant de bannir ou supprimer ce compte.';
    END IF;
    DELETE FROM public.bw_push_subscriptions WHERE user_id=OLD.id;
    UPDATE public.bw_follows SET active=false WHERE user_id=OLD.id;
    UPDATE public.bw_itinerary_watches SET active=false WHERE user_id=OLD.id;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_auth_user_guard ON auth.users;
CREATE TRIGGER bw_auth_user_guard BEFORE UPDATE OF banned_until, deleted_at OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.bw_guard_auth_user();

CREATE OR REPLACE FUNCTION public.bw_admin_users_page(_actor uuid, _search text DEFAULT '', _page integer DEFAULT 1, _filter text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=_actor AND r.role::text='admin' AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  WITH matched AS (
    SELECT u.id,u.email,p.display_name,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.banned_until,
      COALESCE((SELECT jsonb_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id=u.id AND r.role::text<>'user'),'[]'::jsonb) AS roles
    FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
    WHERE u.deleted_at IS NULL AND (length(trim(_search))=0 OR position(lower(trim(_search)) IN lower(COALESCE(u.email,'')||' '||COALESCE(p.display_name,'')))>0)
      AND (_filter='all' OR (_filter='banned' AND u.banned_until>now()) OR (_filter='team' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role::text<>'user')))
  ), page AS (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT 30 OFFSET (GREATEST(1,LEAST(_page,100000))-1)*30)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matched),'members',COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
    'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM (SELECT actor_id,target_id,action,created_at FROM public.bw_user_admin_log ORDER BY created_at DESC LIMIT 12) l)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.bw_admin_user_audit(_actor uuid,_target uuid,_action text,_details jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text='admin') THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  INSERT INTO public.bw_user_admin_log(actor_id,target_id,action,details) VALUES (_actor,_target,left(_action,80),_details);
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_user_audit(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_user_audit(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bw_admin_set_user_role(_actor uuid,_target uuid,_role text,_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(24102026);
  IF _actor=_target OR _role NOT IN ('admin','editor','moderator') OR NOT EXISTS
    (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=_actor AND r.role::text='admin' AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))
    THEN RAISE EXCEPTION 'Modification non autorisée.'; END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles(user_id,role) VALUES (_target,_role::public.app_role) ON CONFLICT(user_id,role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id=_target AND role::text=_role;
  END IF;
  INSERT INTO public.bw_user_admin_log(actor_id,target_id,action,details) VALUES (_actor,_target,'role_changed',jsonb_build_object('role',_role,'enabled',_enabled));
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_set_user_role(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_set_user_role(uuid,uuid,text,boolean) TO service_role;
-- Les fonctions SECURITY DEFINER vérifient aussi le compte actif et les droits de modération.
CREATE OR REPLACE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL, p_target uuid DEFAULT NULL, p_moderation boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF p_moderation AND NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT jsonb_build_object('enabled',true,
    'rating_count',(SELECT count(*)::integer FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'rating_average',(SELECT avg(score) FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'alerts',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT a.id,a.target_kind,a.target_id,a.category,a.delay_minutes,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
        EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed
      FROM public.bw_travel_alerts a WHERE NOT a.resolved AND a.expires_at>now()
        AND (p_kind IS NULL OR a.target_kind=p_kind) AND (p_target IS NULL OR a.target_id=p_target)
        AND ((a.target_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels v WHERE v.id=a.target_id AND v.status='active')) OR (a.target_kind='port' AND EXISTS(SELECT 1 FROM public.ports p WHERE p.id=a.target_id AND p.status='active')))
      ORDER BY a.created_at DESC LIMIT 300
    ) x),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT r.id,r.vessel_id,r.score,r.comment,r.status,r.created_at, r.user_id = auth.uid() AS own
      FROM public.bw_vessel_reviews r WHERE (p_moderation OR (p_kind='vessel' AND p_target=r.vessel_id))
        AND (p_moderation OR r.status='published' OR r.user_id=auth.uid())
      ORDER BY (p_moderation AND r.status='pending') DESC, (r.user_id=auth.uid()) DESC NULLS LAST, r.created_at DESC LIMIT 200
    ) x),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bw_submit_review(p_vessel uuid,p_score integer,p_comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.vessels WHERE id=p_vessel AND status='active') THEN RAISE EXCEPTION 'Navire introuvable'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_vessel_reviews WHERE user_id=auth.uid() AND updated_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'Patientez une minute avant un nouvel avis'; END IF;
  INSERT INTO public.bw_vessel_reviews(vessel_id,user_id,score,comment) VALUES(p_vessel,auth.uid(),p_score,trim(coalesce(p_comment,'')))
  ON CONFLICT(vessel_id,user_id) DO UPDATE SET score=excluded.score,comment=excluded.comment,status='pending',updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.bw_report_travel(p_kind text,p_target uuid,p_category text,p_delay integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF NOT ((p_kind='vessel' AND EXISTS(SELECT 1 FROM public.vessels WHERE id=p_target AND status='active')) OR (p_kind='port' AND EXISTS(SELECT 1 FROM public.ports WHERE id=p_target AND status='active'))) THEN RAISE EXCEPTION 'Lieu ou navire introuvable'; END IF;
  IF (SELECT count(*) FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Maximum de cinq signalements par quart d’heure'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_travel_alerts WHERE user_id=auth.uid() AND target_kind=p_kind AND target_id=p_target AND category=p_category AND NOT resolved AND expires_at>now()) THEN RAISE EXCEPTION 'Vous avez déjà signalé cette situation'; END IF;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes) VALUES(p_kind,p_target,auth.uid(),p_category,p_delay);
END $$;

CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.bw_travel_alerts;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bw_moderate_review(p_review uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false) OR p_status NOT IN ('published','hidden') OR p_status IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.bw_vessel_reviews SET status=p_status WHERE id=p_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bw_community_feed(text,uuid,boolean),public.bw_submit_review(uuid,integer,text),public.bw_report_travel(text,uuid,text,integer),public.bw_alert_action(uuid,text),public.bw_moderate_review(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_community_feed(text,uuid,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bw_submit_review(uuid,integer,text),public.bw_report_travel(text,uuid,text,integer),public.bw_alert_action(uuid,text),public.bw_moderate_review(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
