-- BledWay · Ma traversée, Flash info, lieux pratiques, signalements « Ce n'est plus le cas » et « Utile ».
-- Script additif et autonome : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
-- Il fonctionne même si des migrations précédentes n'ont pas été exécutées : les parties qui dépendent
-- d'une table absente (signalements, historique des départs) sont simplement ignorées.
BEGIN;

-- 0. Fonctions de droits utilisées ci-dessous (mêmes définitions que la migration user_management ;
--    recréées ici au cas où celle-ci n'aurait pas été exécutée).
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.bw_account_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()
    AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()));
$$;
REVOKE ALL ON FUNCTION private.bw_account_active() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.bw_account_active() TO authenticated;

CREATE OR REPLACE FUNCTION private.bw_staff_permission(_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=auth.uid() AND r.role::text=ANY(_roles) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION private.bw_staff_permission(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bw_staff_permission(text[]) TO authenticated;

-- 1. Flash info : actualités et perturbations Europe ↔ Algérie, sélectionnées à la main et sourcées.
CREATE TABLE IF NOT EXISTS public.bw_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'info' CHECK (kind IN ('perturbation','info')),
  origin text NOT NULL DEFAULT 'media' CHECK (origin IN ('official','media','bledway')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 160),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 400),
  source_name text NOT NULL DEFAULT '' CHECK (char_length(source_name) <= 80),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  route_ids uuid[] NOT NULL DEFAULT '{}',
  port_ids uuid[] NOT NULL DEFAULT '{}',
  company_ids uuid[] NOT NULL DEFAULT '{}',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS bw_news_live ON public.bw_news(starts_at DESC) WHERE published;
ALTER TABLE public.bw_news ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_news TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_news TO authenticated;
GRANT ALL ON public.bw_news TO service_role;
DROP POLICY IF EXISTS bw_news_public_read ON public.bw_news;
CREATE POLICY bw_news_public_read ON public.bw_news FOR SELECT TO anon, authenticated
  USING (published AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));
DROP POLICY IF EXISTS bw_news_staff_manage ON public.bw_news;
CREATE POLICY bw_news_staff_manage ON public.bw_news FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));

-- 2. Lieux pratiques autour des ports (station-service, change, distributeur…), saisis par l'équipe.
CREATE TABLE IF NOT EXISTS public.bw_port_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  port_id uuid NOT NULL REFERENCES public.ports(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fuel','exchange','atm','pharmacy','parking','food','sim','other')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 200),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  hours text NOT NULL DEFAULT '' CHECK (char_length(hours) <= 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  distance_label text NOT NULL DEFAULT '' CHECK (char_length(distance_label) <= 60),
  verified_at timestamptz,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_port_places_port ON public.bw_port_places(port_id) WHERE published;
ALTER TABLE public.bw_port_places ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_port_places TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_port_places TO authenticated;
GRANT ALL ON public.bw_port_places TO service_role;
DROP POLICY IF EXISTS bw_port_places_public_read ON public.bw_port_places;
CREATE POLICY bw_port_places_public_read ON public.bw_port_places FOR SELECT TO anon, authenticated USING (published);
DROP POLICY IF EXISTS bw_port_places_staff_manage ON public.bw_port_places;
CREATE POLICY bw_port_places_staff_manage ON public.bw_port_places FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));

-- 3. « Utile » sur les avis de port publiés (un vote par compte, réversible).
CREATE TABLE IF NOT EXISTS public.bw_review_helpful (
  review_id uuid NOT NULL REFERENCES public.port_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(review_id,user_id)
);
ALTER TABLE public.bw_review_helpful ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_review_helpful FROM anon, authenticated;
GRANT ALL ON public.bw_review_helpful TO service_role;

CREATE OR REPLACE FUNCTION public.bw_review_helpful_counts(p_port uuid)
RETURNS TABLE(review_id uuid, helpful integer, mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.id, (SELECT count(*)::integer FROM public.bw_review_helpful h WHERE h.review_id=r.id),
    EXISTS(SELECT 1 FROM public.bw_review_helpful h WHERE h.review_id=r.id AND h.user_id=auth.uid())
  FROM public.port_reviews r WHERE r.port_id=p_port AND r.status='published';
$$;

CREATE OR REPLACE FUNCTION public.bw_toggle_review_helpful(p_review uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.port_reviews WHERE id=p_review AND status='published') THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
  IF EXISTS(SELECT 1 FROM public.port_reviews WHERE id=p_review AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  IF EXISTS(SELECT 1 FROM public.bw_review_helpful WHERE review_id=p_review AND user_id=auth.uid()) THEN
    DELETE FROM public.bw_review_helpful WHERE review_id=p_review AND user_id=auth.uid();
    RETURN false;
  END IF;
  INSERT INTO public.bw_review_helpful(review_id,user_id) VALUES(p_review,auth.uid());
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bw_review_helpful_counts(uuid), public.bw_toggle_review_helpful(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_review_helpful_counts(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_toggle_review_helpful(uuid) TO authenticated;

-- 4. Ma traversée : historique public des changements d'un départ (titre, texte, date — aucune donnée personnelle).
--    Renvoie une liste vide si la table bw_voyage_events n'existe pas encore.
CREATE OR REPLACE FUNCTION public.bw_departure_events(p_departure uuid)
RETURNS TABLE(id uuid, title text, body text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('public.bw_voyage_events') IS NULL THEN RETURN; END IF;
  RETURN QUERY EXECUTE
    'SELECT e.id, e.title, e.body, e.created_at FROM public.bw_voyage_events e
     WHERE e.departure_id = $1 ORDER BY e.created_at DESC LIMIT 20' USING p_departure;
END $$;
REVOKE ALL ON FUNCTION public.bw_departure_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_departure_events(uuid) TO anon, authenticated;

-- 5. Signalements façon Waze : nouvelles situations et « Ce n'est plus le cas ».
--    Uniquement si le module communautaire (table bw_travel_alerts) est déjà installé.
DO $do$
DECLARE c record;
BEGIN
  IF to_regclass('public.bw_travel_alerts') IS NULL THEN
    RAISE NOTICE 'Module signalements absent (bw_travel_alerts) : partie 5 ignorée.';
    RETURN;
  END IF;

  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bw_travel_alerts'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.bw_travel_alerts DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_kind_check
    CHECK (target_kind IN ('vessel','port'));
  ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_category_check
    CHECK (category IN ('delay','boarding','disembarking','queue','access','parking','fluid'));
  ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_delay_check
    CHECK (delay_minutes IS NULL OR delay_minutes IN (30,60,120));
  ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_delay_rule
    CHECK ((category = 'delay' AND target_kind = 'vessel' AND delay_minutes IS NOT NULL) OR (category <> 'delay' AND delay_minutes IS NULL));
  ALTER TABLE public.bw_travel_alerts ADD CONSTRAINT bw_travel_alerts_target_rule
    CHECK ((target_kind = 'vessel' AND category IN ('delay','boarding','disembarking'))
        OR (target_kind = 'port' AND category IN ('queue','access','parking','fluid')));

  CREATE TABLE IF NOT EXISTS public.bw_alert_denials (
    alert_id uuid NOT NULL REFERENCES public.bw_travel_alerts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(alert_id,user_id)
  );
  ALTER TABLE public.bw_alert_denials ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.bw_alert_denials FROM anon, authenticated;
  GRANT ALL ON public.bw_alert_denials TO service_role;

  -- Flux communautaire : mêmes champs qu'avant, plus le nombre de « Ce n'est plus le cas ».
  CREATE OR REPLACE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL, p_target uuid DEFAULT NULL, p_moderation boolean DEFAULT false)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
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
          EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed,
          (SELECT count(*)::integer FROM public.bw_alert_denials d WHERE d.alert_id=a.id) AS denials,
          EXISTS(SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id=a.id AND d.user_id=auth.uid()) AS denied
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
  END $fn$;

  -- Actions : confirmer, « Ce n'est plus le cas », clore son propre signalement.
  -- Le signalement se ferme seul dès que les « plus le cas » l'emportent (au moins 2, et plus que les confirmations).
  CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid,p_action text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
  DECLARE a public.bw_travel_alerts; n_denials integer; n_confirms integer;
  BEGIN
    IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
    SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
    IF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_permission(ARRAY['admin','moderator']),false)) THEN
      UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
    ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
      DELETE FROM public.bw_alert_denials WHERE alert_id=p_alert AND user_id=auth.uid();
      INSERT INTO public.bw_alert_confirmations(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
    ELSIF p_action='deny' AND a.user_id<>auth.uid() THEN
      DELETE FROM public.bw_alert_confirmations WHERE alert_id=p_alert AND user_id=auth.uid();
      INSERT INTO public.bw_alert_denials(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
      SELECT count(*) INTO n_denials FROM public.bw_alert_denials WHERE alert_id=p_alert;
      SELECT count(*) INTO n_confirms FROM public.bw_alert_confirmations WHERE alert_id=p_alert;
      IF n_denials >= 2 AND n_denials > n_confirms THEN
        UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
      END IF;
    ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
  END $fn$;

  REVOKE ALL ON FUNCTION public.bw_community_feed(text,uuid,boolean), public.bw_alert_action(uuid,text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.bw_community_feed(text,uuid,boolean) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.bw_alert_action(uuid,text) TO authenticated;
END
$do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
