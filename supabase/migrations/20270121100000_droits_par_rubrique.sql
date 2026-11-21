-- Rôles et droits, lot 2 : la base applique le réglage de l'administrateur rubrique par rubrique.
-- Pour l'éditeur et le modérateur, l'admin peut fermer une rubrique de leur cadre (la base refuse
-- alors les actions qui ne relèvent que de cette rubrique) ou en ouvrir une en plus.
-- Sans réglage, chaque contrôle donne exactement le même résultat qu'avant.
-- Les sections 3 et 4 sont générées depuis les définitions en place (pg_policies,
-- pg_get_functiondef) : seul l'appel bw_staff_permission(rôles) y devient bw_staff_can(rôles, rubriques).
BEGIN;

-- 1. Rubriques ouvertes en plus, à côté des rubriques fermées.
ALTER TABLE public.bw_staff_role_config
  ADD COLUMN IF NOT EXISTS added_tabs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(added_tabs) <= 60);

-- Cadre de chaque rôle : doit rester identique à ROLE_CATALOG (src/lib/admin/permissions.ts).
CREATE OR REPLACE FUNCTION private.bw_role_frame(_role text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _role
    WHEN 'editor' THEN ARRAY['overview','planning','assign','incidents','watch','commercial','departures',
      'schedules','import','vessels','ports','routes','companies','companyRequests','alerts','data','flash',
      'emails','signals','places','illustrations','library','walletMedia','health','tickets']
    WHEN 'moderator' THEN ARRAY['overview','reviews','community','reports','companyRequests']
    ELSE '{}'::text[] END;
$$;

-- Rubriques que l'admin ne peut jamais ouvrir à un autre rôle (comptes, rôles, diffusion, référence).
CREATE OR REPLACE FUNCTION private.bw_admin_only_tabs() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['overview','users','roles','notifications','reference'];
$$;

-- Le cœur : _roles = rôles admis avant ce lot, _tabs = rubriques qui mènent à cette action.
-- Administrateur : inchangé. Autre rôle r : admis s'il l'était avant, sauf si l'admin lui a fermé
-- toutes les rubriques de son cadre qui mènent ici ; ou si l'une de ces rubriques lui a été ouverte en plus.
CREATE OR REPLACE FUNCTION private.bw_staff_can_for(_uid uuid, _roles text[], _tabs text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles r
    JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN public.bw_staff_role_config c ON c.role = r.role::text
    WHERE r.user_id = _uid
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND (
        (r.role::text = 'admin' AND 'admin' = ANY(_roles))
        OR (r.role::text <> 'admin' AND (
          (r.role::text = ANY(_roles) AND (
            NOT (_tabs && private.bw_role_frame(r.role::text))
            OR EXISTS (SELECT 1 FROM unnest(_tabs) t
                       WHERE t = ANY(private.bw_role_frame(r.role::text))
                         AND NOT (t = ANY(coalesce(c.removed_tabs, '{}'))))
          ))
          OR (_tabs && coalesce(c.added_tabs, '{}'))
        ))
      )
  );
$$;
CREATE OR REPLACE FUNCTION private.bw_staff_can(_roles text[], _tabs text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.bw_staff_can_for(auth.uid(), _roles, _tabs);
$$;
REVOKE ALL ON FUNCTION private.bw_role_frame(text), private.bw_admin_only_tabs(),
  private.bw_staff_can_for(uuid, text[], text[]), private.bw_staff_can(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bw_role_frame(text), private.bw_admin_only_tabs(),
  private.bw_staff_can(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.bw_staff_can_for(uuid, text[], text[]) TO service_role;

-- Pour le serveur du site (clé de service) : même contrôle pour un compte donné.
CREATE OR REPLACE FUNCTION public.bw_staff_can_check(p_user uuid, p_roles text[], p_tabs text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.bw_staff_can_for(p_user, p_roles, p_tabs);
$$;
REVOKE ALL ON FUNCTION public.bw_staff_can_check(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_staff_can_check(uuid, text[], text[]) TO service_role;

-- Réglages partagés (bw_admin_settings) : chaque clé relève d'une rubrique.
CREATE OR REPLACE FUNCTION private.bw_setting_tabs(_key text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _key LIKE 'email\_%' THEN ARRAY['emails']
    WHEN _key = 'assign_rules' THEN ARRAY['assign']
    WHEN _key IN ('watch_claude', 'chat_demo') THEN ARRAY['watch']
    WHEN _key = 'ais_collector' THEN ARRAY['health']
    WHEN _key = 'hotel_booking' THEN ARRAY['reference']
    ELSE '{}'::text[] END;
$$;
REVOKE ALL ON FUNCTION private.bw_setting_tabs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bw_setting_tabs(text) TO authenticated;

-- 2. Enregistrement du réglage : rubriques fermées (dans le cadre) et ouvertes en plus (hors cadre).
DROP FUNCTION IF EXISTS public.bw_admin_set_role_config(text, text[], text);
CREATE OR REPLACE FUNCTION public.bw_admin_set_role_config(p_role text, p_removed text[], p_home text, p_added text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before public.bw_staff_role_config; frame text[]; rem text[]; add text[];
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('editor','moderator') THEN RAISE EXCEPTION 'Rôle inconnu'; END IF;
  frame := private.bw_role_frame(p_role);
  rem := ARRAY(SELECT DISTINCT t FROM unnest(coalesce(p_removed, '{}')) t
               WHERE t = ANY(frame) AND t <> 'overview' ORDER BY 1);
  add := ARRAY(SELECT DISTINCT t FROM unnest(coalesce(p_added, '{}')) t
               WHERE NOT t = ANY(frame) AND NOT t = ANY(private.bw_admin_only_tabs()) AND t ~ '^[a-zA-Z]{2,30}$' ORDER BY 1);
  SELECT * INTO before FROM public.bw_staff_role_config WHERE role = p_role;
  INSERT INTO public.bw_staff_role_config(role, removed_tabs, added_tabs, home_tab, updated_by, updated_at)
  VALUES (p_role, rem, add, nullif(p_home, ''), auth.uid(), now())
  ON CONFLICT (role) DO UPDATE SET removed_tabs = excluded.removed_tabs, added_tabs = excluded.added_tabs,
    home_tab = excluded.home_tab, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO public.bw_user_admin_log(actor_id, target_id, action, details)
  VALUES (auth.uid(), NULL, 'role_config', jsonb_build_object(
    'role', p_role,
    'removed_before', coalesce(before.removed_tabs, '{}'), 'removed_after', rem,
    'added_before', coalesce(before.added_tabs, '{}'), 'added_after', add,
    'home_before', before.home_tab, 'home_after', nullif(p_home, '')));
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_set_role_config(text, text[], text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_admin_set_role_config(text, text[], text, text[]) TO authenticated;

-- 3. Politiques : mêmes rôles qu'avant + réglage par rubrique (généré depuis pg_policies).
ALTER POLICY "bw_admin_settings_staff" ON public.bw_admin_settings USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], private.bw_setting_tabs(key)) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], private.bw_setting_tabs(key)) AS bw_staff_permission));
ALTER POLICY "bw_moderator_manage" ON public.bw_alert_confirmations USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community']) AS bw_staff_permission));
ALTER POLICY "bw_assign_log_staff" ON public.bw_assign_log USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['assign']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['assign']) AS bw_staff_permission));
ALTER POLICY "bw_assign_settings_staff" ON public.bw_assign_settings USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['assign']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['assign']) AS bw_staff_permission));
ALTER POLICY "bw_avatars_staff" ON public.bw_avatars USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false)) WITH CHECK (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false));
ALTER POLICY "bw_chat_demo_staff" ON public.bw_chat_demo_messages USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_chat_demo_read" ON public.bw_chat_demo_messages USING ((active OR ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)));
ALTER POLICY "bw_chat_starters_read" ON public.bw_chat_starters USING ((active OR ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)));
ALTER POLICY "bw_chat_starters_staff" ON public.bw_chat_starters USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_chat_words_staff" ON public.bw_chat_words USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_dinar_voices_write" ON public.bw_dinar_voices USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission));
ALTER POLICY "bw_entity_reviews_moderator_read" ON public.bw_entity_reviews USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reviews']) AS bw_staff_permission));
ALTER POLICY "bw_illustrations_write" ON public.bw_illustrations USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['illustrations']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['illustrations']) AS bw_staff_permission));
ALTER POLICY "bw_import_aliases_staff" ON public.bw_import_aliases USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['import']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['import']) AS bw_staff_permission));
ALTER POLICY "bw_import_batches_staff_read" ON public.bw_import_batches USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['import']) AS bw_staff_permission));
ALTER POLICY "bw_incident_departures_staff" ON public.bw_incident_departures USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['incidents']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['incidents']) AS bw_staff_permission));
ALTER POLICY "bw_incident_events_staff" ON public.bw_incident_events USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['incidents']) AS bw_staff_permission));
ALTER POLICY "bw_library_categories_staff" ON public.bw_library_categories USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false)) WITH CHECK (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false));
ALTER POLICY "bw_library_category_items_staff" ON public.bw_library_category_items USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false)) WITH CHECK (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['library']), false));
ALTER POLICY "bw_moods_staff" ON public.bw_moods USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission));
ALTER POLICY "bw_news_staff_manage" ON public.bw_news USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['flash','watch']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['flash','watch']) AS bw_staff_permission));
ALTER POLICY "bw_planning_decisions_staff" ON public.bw_planning_decisions USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text, 'moderator'::text], ARRAY['planning','alerts']), false)) WITH CHECK (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'editor'::text, 'moderator'::text], ARRAY['planning','alerts']), false));
ALTER POLICY "bw_port_places_staff_manage" ON public.bw_port_places USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['places']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['places']) AS bw_staff_permission));
ALTER POLICY "bw_report_anomalies_staff_read" ON public.bw_report_anomalies USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'moderator'::text], ARRAY['community']), false));
ALTER POLICY "bw_report_anomalies_staff_update" ON public.bw_report_anomalies USING (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'moderator'::text], ARRAY['community']), false)) WITH CHECK (COALESCE(private.bw_staff_can(ARRAY['admin'::text, 'moderator'::text], ARRAY['community']), false));
ALTER POLICY "bw_signal_options_staff" ON public.bw_signal_options USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission));
ALTER POLICY "bw_signal_services_staff" ON public.bw_signal_services USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission));
ALTER POLICY "bw_signal_situations_staff" ON public.bw_signal_situations USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission));
ALTER POLICY "bw_moderator_manage" ON public.bw_travel_alerts USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community']) AS bw_staff_permission));
ALTER POLICY "bw_trip_steps_staff" ON public.bw_trip_steps USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['signals']) AS bw_staff_permission));
ALTER POLICY "Les administrateurs lisent la mesure" ON public.bw_usage_events USING (private.bw_staff_can(ARRAY['admin'::text], ARRAY['usage']));
ALTER POLICY "bw_incidents_staff" ON public.bw_vessel_incidents USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['incidents']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['incidents']) AS bw_staff_permission));
ALTER POLICY "bw_moderator_manage" ON public.bw_vessel_reviews USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community','reviews']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['community','reviews']) AS bw_staff_permission));
ALTER POLICY "bw_wallet_media_delete" ON public.bw_wallet_media USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission));
ALTER POLICY "bw_wallet_media_insert" ON public.bw_wallet_media WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission));
ALTER POLICY "bw_wallet_media_update" ON public.bw_wallet_media USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission));
ALTER POLICY "bw_watch_items_staff" ON public.bw_watch_items USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_watch_proposals_staff" ON public.bw_watch_proposals USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_watch_runs_staff" ON public.bw_watch_runs USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_watch_sources_staff" ON public.bw_watch_sources USING (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['watch']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.companies USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['companies','vessels','import','commercial']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['companies','vessels','import','commercial']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.departures USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['departures','planning','commercial','alerts','incidents','import','assign','vessels','data']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['departures','planning','commercial','alerts','incidents','import','assign','vessels','data']) AS bw_staff_permission));
ALTER POLICY "bw_vessel_photos_insert" ON storage.objects WITH CHECK (((bucket_id = 'vessel-photos'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['vessels']) AS bw_staff_permission)));
ALTER POLICY "bw_vessel_photos_delete" ON storage.objects USING (((bucket_id = 'vessel-photos'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['vessels']) AS bw_staff_permission)));
ALTER POLICY "bw_banknotes_insert" ON storage.objects WITH CHECK (((bucket_id = 'bledway-banknotes'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)));
ALTER POLICY "bw_banknotes_delete" ON storage.objects USING (((bucket_id = 'bledway-banknotes'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)));
ALTER POLICY "bw_illustrations_insert" ON storage.objects WITH CHECK (((bucket_id = 'bledway-illustrations'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['illustrations']) AS bw_staff_permission)));
ALTER POLICY "bw_illustrations_delete" ON storage.objects USING (((bucket_id = 'bledway-illustrations'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['illustrations']) AS bw_staff_permission)));
ALTER POLICY "bw_voices_delete" ON storage.objects USING (((bucket_id = 'bledway-voices'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)));
ALTER POLICY "bw_voices_insert" ON storage.objects WITH CHECK (((bucket_id = 'bledway-voices'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['walletMedia']) AS bw_staff_permission)));
ALTER POLICY "bw_vessel_photos_select" ON storage.objects USING (((bucket_id = 'vessel-photos'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['vessels']) AS bw_staff_permission)));
ALTER POLICY "bw_vessel_photos_update" ON storage.objects USING (((bucket_id = 'vessel-photos'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['vessels']) AS bw_staff_permission))) WITH CHECK (((bucket_id = 'vessel-photos'::text) AND ( SELECT private.bw_staff_can(ARRAY['admin'::text, 'editor'::text], ARRAY['vessels']) AS bw_staff_permission)));
ALTER POLICY "bw_moderator_manage" ON public.port_reviews USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reviews']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reviews']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.ports USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['ports','data']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['ports','data']) AS bw_staff_permission));
ALTER POLICY "bw_moderator_manage" ON public.reports USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reports','incidents','community']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reports','incidents','community']) AS bw_staff_permission));
ALTER POLICY "bw_moderator_manage" ON public.review_ratings USING (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reviews']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['moderator'::text], ARRAY['reviews']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.route_operators USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['routes','commercial','companies','import']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['routes','commercial','companies','import']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.routes USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['routes','import','data']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['routes','import','data']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.schedule_exceptions USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['schedules','commercial','data']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['schedules','commercial','data']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.schedules USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['schedules','commercial','data']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['schedules','commercial','data']) AS bw_staff_permission));
ALTER POLICY "bw_editor_manage" ON public.vessels USING (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['vessels','departures','commercial','import','assign']) AS bw_staff_permission)) WITH CHECK (( SELECT private.bw_staff_can(ARRAY['editor'::text], ARRAY['vessels','departures','commercial','import','assign']) AS bw_staff_permission));

-- 4. Fonctions : même corps, contrôle par rubrique (généré depuis pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.bw_admin_archive_vessel(p_vessel uuid, p_release_upcoming boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE n_departures int := 0; n_schedules int := 0;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['vessels']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.vessels SET status = 'inactive' WHERE id = p_vessel;
  IF NOT FOUND THEN RAISE EXCEPTION 'Navire introuvable'; END IF;
  IF p_release_upcoming THEN
    UPDATE public.departures SET vessel_id = NULL WHERE vessel_id = p_vessel AND departure_at >= now();
    GET DIAGNOSTICS n_departures = ROW_COUNT;
    UPDATE public.schedules SET default_vessel_id = NULL WHERE default_vessel_id = p_vessel;
    GET DIAGNOSTICS n_schedules = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('departures', n_departures, 'schedules', n_schedules);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_company_usage(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r record; n bigint; result jsonb := '{}'::jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['companies','vessels']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.companies'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_company;
    IF n > 0 THEN result := result || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;
  IF to_regclass('public.bw_news') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.bw_news WHERE $1 = ANY(company_ids)' INTO n USING p_company;
    IF n > 0 THEN result := result || jsonb_build_object('bw_news.company_ids', n); END IF;
  END IF;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_merge_departures(p_keep uuid, p_remove uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r record;
  row_id tid;
  n bigint;
  dropped bigint;
  moved jsonb := '{}'::jsonb;
  kept public.departures;
  gone public.departures;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['departures','planning','commercial','alerts','data']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_keep IS NULL OR p_remove IS NULL OR p_keep = p_remove THEN RAISE EXCEPTION 'Choisissez deux départs différents'; END IF;
  SELECT * INTO gone FROM public.departures WHERE id = p_remove FOR UPDATE;
  SELECT * INTO kept FROM public.departures WHERE id = p_keep FOR UPDATE;
  IF gone.id IS NULL OR kept.id IS NULL THEN RAISE EXCEPTION 'Départ introuvable (déjà fusionné ?)'; END IF;
  IF gone.route_id <> kept.route_id THEN RAISE EXCEPTION 'Les deux départs ne sont pas sur la même liaison'; END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.departures'::regclass AND cardinality(c.conkey) = 1
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_remove;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
      -- Ligne par ligne : celles qui existent déjà côté départ gardé sont retirées.
      n := 0; dropped := 0;
      FOR row_id IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING p_remove LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING p_keep, row_id;
          n := n + 1;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING row_id;
          dropped := dropped + 1;
        END;
      END LOOP;
      IF dropped > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col || ' (doublons retirés)', dropped); END IF;
    END;
    IF n > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;

  IF to_regclass('public.bw_news') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bw_news' AND column_name = 'departure_ids') THEN
    EXECUTE $q$
      UPDATE public.bw_news
         SET departure_ids = ARRAY(SELECT DISTINCT unnest(array_replace(departure_ids, $2, $1)))
       WHERE $2 = ANY(departure_ids)
    $q$ USING p_keep, p_remove;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object('bw_news.departure_ids', n); END IF;
  END IF;

  -- Le départ gardé récupère ce qui lui manque (bateau, notes, source).
  UPDATE public.departures k SET
    vessel_id = coalesce(k.vessel_id, gone.vessel_id),
    notes = coalesce(nullif(k.notes, ''), gone.notes),
    source_url = coalesce(k.source_url, gone.source_url)
  WHERE k.id = p_keep;
  DELETE FROM public.departures WHERE id = p_remove;
  RETURN moved;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_merge_vessels(p_keep uuid, p_remove uuid, p_alias_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r record; row_id tid; n bigint; dropped bigint; moved jsonb := '{}'::jsonb; gone public.vessels;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['vessels']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_keep IS NULL OR p_remove IS NULL OR p_keep = p_remove THEN RAISE EXCEPTION 'Choisissez deux navires différents'; END IF;
  SELECT * INTO gone FROM public.vessels WHERE id = p_remove FOR UPDATE;
  IF gone.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_keep) THEN RAISE EXCEPTION 'Navire introuvable'; END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.vessels'::regclass AND cardinality(c.conkey) = 1
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING p_keep, p_remove;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
      n := 0; dropped := 0;
      FOR row_id IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING p_remove LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING p_keep, row_id;
          n := n + 1;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING row_id;
          dropped := dropped + 1;
        END;
      END LOOP;
      IF dropped > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col || ' (doublons retirés)', dropped); END IF;
    END;
    IF n > 0 THEN moved := moved || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;

  -- Le MMSI est unique : on le libère sur la fiche retirée avant de le reporter.
  DELETE FROM public.vessels WHERE id = p_remove;
  UPDATE public.vessels k SET
    mmsi = coalesce(k.mmsi, gone.mmsi),
    imo = coalesce(k.imo, gone.imo),
    photo_url = coalesce(k.photo_url, gone.photo_url),
    company_id = coalesce(k.company_id, gone.company_id),
    description = coalesce(nullif(k.description, ''), gone.description),
    build_year = coalesce(k.build_year, gone.build_year),
    length_meters = coalesce(k.length_meters, gone.length_meters),
    passenger_capacity = coalesce(k.passenger_capacity, gone.passenger_capacity),
    car_capacity = coalesce(k.car_capacity, gone.car_capacity),
    freight_lane_meters = coalesce(k.freight_lane_meters, gone.freight_lane_meters),
    speed_knots = coalesce(k.speed_knots, gone.speed_knots)
  WHERE k.id = p_keep;

  -- Le nom retiré reste reconnu aux prochains imports.
  IF to_regclass('public.bw_import_aliases') IS NOT NULL AND coalesce(p_alias_key, '') <> '' THEN
    INSERT INTO public.bw_import_aliases (kind, raw_key, target_id)
    VALUES ('vessel', left(p_alias_key, 120), p_keep)
    ON CONFLICT (kind, raw_key) DO UPDATE SET target_id = excluded.target_id;
  END IF;
  RETURN moved;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_publish_import(p_file_name text, p_company uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_inserts jsonb, p_updates jsonb, p_cancels uuid[], p_aliases jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  batch uuid;
  source text := left('Import Excel — ' || coalesce(nullif(p_file_name, ''), 'fichier'), 200);
  new_ids uuid[];
  before jsonb;
  n_updates int;
  n_cancels int;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['import']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  INSERT INTO public.bw_import_batches (file_name, company_id, scope_from, scope_to)
  VALUES (coalesce(p_file_name, ''), p_company, p_from, p_to) RETURNING id INTO batch;

  -- État d'avant, pour pouvoir annuler.
  SELECT coalesce(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb) INTO before
  FROM public.departures d
  WHERE d.id IN (SELECT (u->>'id')::uuid FROM jsonb_array_elements(coalesce(p_updates, '[]')) u)
     OR d.id = ANY(coalesce(p_cancels, '{}'));

  WITH created AS (
    INSERT INTO public.departures
      (route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status,
       reliability, source_name, last_verified_at)
    SELECT x.route_id, x.company_id, x.vessel_id, x.departure_at, x.arrival_at, x.duration_minutes,
           x.status::public.departure_status, 'verified', source, now()
    FROM jsonb_to_recordset(coalesce(p_inserts, '[]')) AS x(
      route_id uuid, company_id uuid, vessel_id uuid, departure_at timestamptz,
      arrival_at timestamptz, duration_minutes int, status text)
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO new_ids FROM created;

  UPDATE public.departures d SET
    departure_at = x.departure_at,
    arrival_at = x.arrival_at,
    duration_minutes = x.duration_minutes,
    vessel_id = coalesce(x.vessel_id, d.vessel_id),
    status = CASE
      WHEN x.status = 'cancelled' THEN 'cancelled'::public.departure_status
      WHEN d.departure_at <> x.departure_at THEN 'modified'::public.departure_status
      ELSE x.status::public.departure_status END,
    reliability = 'verified',
    source_name = source,
    last_verified_at = now()
  FROM jsonb_to_recordset(coalesce(p_updates, '[]')) AS x(
    id uuid, vessel_id uuid, departure_at timestamptz, arrival_at timestamptz,
    duration_minutes int, status text)
  WHERE d.id = x.id;
  GET DIAGNOSTICS n_updates = ROW_COUNT;

  UPDATE public.departures SET status = 'cancelled', last_verified_at = now()
  WHERE id = ANY(coalesce(p_cancels, '{}')) AND status <> 'cancelled';
  GET DIAGNOSTICS n_cancels = ROW_COUNT;

  -- Une liaison suspendue redevient visible dès qu'elle reçoit des départs.
  UPDATE public.routes SET status = 'active'
  WHERE status <> 'active' AND id IN (SELECT route_id FROM public.departures WHERE id = ANY(new_ids));

  INSERT INTO public.bw_import_aliases (kind, raw_key, target_id)
  SELECT a.kind, a.raw_key, a.target_id
  FROM jsonb_to_recordset(coalesce(p_aliases, '[]')) AS a(kind text, raw_key text, target_id uuid)
  WHERE a.kind IN ('port','company','vessel') AND coalesce(a.raw_key, '') <> ''
  ON CONFLICT (kind, raw_key) DO UPDATE SET target_id = excluded.target_id, created_at = now();

  UPDATE public.bw_import_batches SET
    inserted = new_ids,
    previous = before,
    counts = jsonb_build_object('added', cardinality(new_ids), 'changed', n_updates, 'cancelled', n_cancels)
  WHERE id = batch;
  RETURN batch;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_remove_departure(p_id uuid, p_confirm boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  d public.departures;
  r record;
  n bigint;
  linked jsonb := '{}'::jsonb;
  followers bigint := 0;
  messages bigint := 0;
  v_day date;
  v_zone text;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['departures','planning','commercial','alerts','data']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO d FROM public.departures WHERE id = p_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Départ introuvable (déjà retiré ?)'; END IF;

  -- Ce qui est rattaché à ce départ : tables reliées par clé étrangère (y compris les futures).
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.departures'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_id;
    IF n > 0 THEN linked := linked || jsonb_build_object(r.tbl::text, n); END IF;
  END LOOP;
  IF to_regclass('public.bw_follows') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.bw_follows WHERE target_kind = ''departure'' AND target_id = $1 AND active'
      INTO followers USING p_id;
  END IF;
  IF to_regclass('public.bw_chat_messages') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.bw_chat_messages WHERE room_kind = ''crossing'' AND room_id = $1'
      INTO messages USING p_id;
  END IF;

  IF NOT p_confirm THEN
    RETURN jsonb_build_object(
      'removed', false,
      'followers', followers,
      'messages', messages,
      'linked', linked,
      'recurring', d.schedule_id IS NOT NULL,
      'status', d.status::text
    );
  END IF;

  -- Calendrier récurrent : la date est exclue, sinon la génération la recréerait.
  IF d.schedule_id IS NOT NULL THEN
    SELECT public.bw_port_zone(p.country_code) INTO v_zone
      FROM public.routes rt JOIN public.ports p ON p.id = rt.departure_port_id WHERE rt.id = d.route_id;
    v_day := coalesce(d.bw_schedule_date, (d.departure_at AT TIME ZONE coalesce(v_zone, 'Europe/Paris'))::date);
    INSERT INTO public.schedule_exceptions(schedule_id, exception_date, exception_type, reason)
    VALUES (d.schedule_id, v_day, 'cancellation', left(coalesce(nullif(trim(p_reason), ''), 'Date retirée depuis le planning'), 300))
    ON CONFLICT (schedule_id, exception_date)
      DO UPDATE SET exception_type = 'cancellation', new_departure_time = NULL, new_vessel_id = NULL,
                    reason = EXCLUDED.reason;
  END IF;

  -- Les suivis et la Flash info ne pointent plus vers une traversée qui n'existe plus.
  IF to_regclass('public.bw_follows') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.bw_follows WHERE target_kind = ''departure'' AND target_id = $1' USING p_id;
  END IF;
  IF to_regclass('public.bw_news') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bw_news' AND column_name = 'departure_ids') THEN
    EXECUTE 'UPDATE public.bw_news SET departure_ids = array_remove(departure_ids, $1) WHERE $1 = ANY(departure_ids)'
      USING p_id;
  END IF;
  -- Le reste suit les règles de la base : suppression en cascade ou lien remis à vide.
  DELETE FROM public.departures WHERE id = p_id;
  RETURN jsonb_build_object('removed', true, 'followers', followers, 'messages', messages, 'linked', linked,
                            'recurring', d.schedule_id IS NOT NULL);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_replace_vessel(p_vessel uuid, p_replacement uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE n_departures int; n_schedules int; n_exceptions int := 0;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['vessels']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_replacement IS NULL OR p_replacement = p_vessel THEN RAISE EXCEPTION 'Choisissez un autre navire'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_replacement) THEN RAISE EXCEPTION 'Navire de remplacement introuvable'; END IF;
  UPDATE public.departures SET vessel_id = p_replacement WHERE vessel_id = p_vessel AND departure_at >= now();
  GET DIAGNOSTICS n_departures = ROW_COUNT;
  UPDATE public.schedules SET default_vessel_id = p_replacement WHERE default_vessel_id = p_vessel;
  GET DIAGNOSTICS n_schedules = ROW_COUNT;
  UPDATE public.schedules SET vessel_rotation = array_replace(vessel_rotation, p_vessel, p_replacement)
    WHERE p_vessel = ANY (vessel_rotation);
  IF to_regclass('public.schedule_exceptions') IS NOT NULL THEN
    UPDATE public.schedule_exceptions SET new_vessel_id = p_replacement WHERE new_vessel_id = p_vessel;
    GET DIAGNOSTICS n_exceptions = ROW_COUNT;
  END IF;
  UPDATE public.vessels SET status = 'inactive' WHERE id = p_vessel;
  RETURN jsonb_build_object('departures', n_departures, 'schedules', n_schedules, 'exceptions', n_exceptions);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_undo_assign(p_log uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE l public.bw_assign_log; n integer;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['assign','planning','health']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO l FROM public.bw_assign_log WHERE id = p_log FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Passage introuvable'; END IF;
  IF l.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà annulé'; END IF;
  UPDATE public.departures d SET vessel_id = NULL
  FROM jsonb_to_recordset(l.items) AS x(departure_id uuid, vessel_id uuid)
  WHERE d.id = x.departure_id AND d.vessel_id = x.vessel_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.bw_assign_log SET undone_at = now() WHERE id = p_log;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_undo_import(p_batch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE b public.bw_import_batches; n_deleted int; n_restored int;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['import']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO b FROM public.bw_import_batches WHERE id = p_batch FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Import introuvable'; END IF;
  IF b.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Cet import a déjà été annulé'; END IF;
  IF b.created_at < now() - interval '30 days' THEN RAISE EXCEPTION 'Import trop ancien pour être annulé (30 jours)'; END IF;

  DELETE FROM public.departures WHERE id = ANY(b.inserted);
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  UPDATE public.departures d SET
    departure_at = p.departure_at,
    arrival_at = p.arrival_at,
    duration_minutes = p.duration_minutes,
    vessel_id = p.vessel_id,
    status = p.status,
    reliability = p.reliability,
    source_name = p.source_name,
    last_verified_at = p.last_verified_at
  FROM jsonb_populate_recordset(NULL::public.departures, b.previous) AS p
  WHERE d.id = p.id;
  GET DIAGNOSTICS n_restored = ROW_COUNT;

  UPDATE public.bw_import_batches SET undone_at = now() WHERE id = p_batch;
  RETURN jsonb_build_object('deleted', n_deleted, 'restored', n_restored);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_admin_vessel_usage(p_vessel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r record; n bigint; result jsonb := '{}'::jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['vessels']), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.vessels'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING p_vessel;
    IF n > 0 THEN result := result || jsonb_build_object(r.tbl::text || '.' || r.col, n); END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.departures WHERE vessel_id = p_vessel AND departure_at >= now() AND status <> 'cancelled';
  IF n > 0 THEN result := result || jsonb_build_object('upcoming', n); END IF;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_alert_action(p_alert uuid, p_action text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.bw_travel_alerts; n_denials integer; n_confirms integer;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO a FROM public.bw_travel_alerts WHERE id=p_alert AND NOT resolved AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ce signalement a expiré'; END IF;
  IF p_action IN ('confirm','deny') AND NOT private.bw_on_site(a.target_kind,a.target_id,p_lat,p_lng) THEN
    RAISE EXCEPTION 'Pour répondre à ce signalement, il faut être sur place, localisation activée.';
  END IF;
  IF p_action='validate' THEN
    IF NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['community']),false) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
    UPDATE public.bw_travel_alerts SET validated_at=now(), validated_by=auth.uid() WHERE id=p_alert;
  ELSIF p_action='resolve' AND (a.user_id=auth.uid() OR coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['community']),false)) THEN
    UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
  ELSIF p_action='confirm' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_denials WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_confirmations(alert_id,user_id,on_site)
    VALUES(p_alert,auth.uid(),true)
    ON CONFLICT (alert_id,user_id) DO UPDATE SET on_site = true;
  ELSIF p_action='deny' AND a.user_id<>auth.uid() THEN
    DELETE FROM public.bw_alert_confirmations WHERE alert_id=p_alert AND user_id=auth.uid();
    INSERT INTO public.bw_alert_denials(alert_id,user_id) VALUES(p_alert,auth.uid()) ON CONFLICT DO NOTHING;
    SELECT count(*) INTO n_denials FROM public.bw_alert_denials WHERE alert_id=p_alert;
    SELECT count(*) INTO n_confirms FROM public.bw_alert_confirmations WHERE alert_id=p_alert;
    IF n_denials >= 2 AND n_denials > n_confirms AND a.validated_at IS NULL THEN
      UPDATE public.bw_travel_alerts SET resolved=true WHERE id=p_alert;
    END IF;
  ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_anomaly_context_staff(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['community']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 100 THEN RAISE EXCEPTION 'Demande invalide'; END IF;

  SELECT coalesce(jsonb_object_agg(a.id, jsonb_build_object(
    'author', jsonb_build_object(
      'card', private.bw_traveller_card(p),
      'joined_at', u.created_at,
      'observations', (SELECT jsonb_build_object(
          'total', count(*),
          'published', count(*) FILTER (WHERE x.decision = 'published'),
          'handled', count(*) FILTER (WHERE x.status = 'handled' AND x.decision IS DISTINCT FROM 'published'),
          'dismissed', count(*) FILTER (WHERE x.status = 'dismissed'))
        FROM public.bw_report_anomalies x WHERE x.user_id = a.user_id AND x.id <> a.id),
      'alerts', (SELECT jsonb_build_object(
          'total', count(*),
          'on_site', count(*) FILTER (WHERE t.on_site),
          'validated', count(*) FILTER (WHERE t.validated_at IS NOT NULL),
          'denied', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id = t.id)),
          'confirmed', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id = t.id AND c.user_id <> t.user_id)))
        FROM public.bw_travel_alerts t WHERE t.user_id = a.user_id)
    ),
    'device', (SELECT jsonb_build_object(
        'platform', CASE
          WHEN bool_or(l.detail->>'ua' ~* 'android') THEN 'android'
          WHEN bool_or(l.detail->>'ua' ~* 'iphone|ipad|ipod') THEN 'ios'
          WHEN bool_or(l.detail->>'ua' ~* 'windows|macintosh|linux|cros') THEN 'desktop'
          ELSE NULL END,
        'installed', bool_or((l.detail->>'standalone')::boolean),
        'permission', (array_agg(l.detail->>'permission' ORDER BY l.created_at DESC)
                         FILTER (WHERE l.event = 'start' AND l.detail ? 'permission'))[1],
        'online', bool_and(coalesce((l.detail->>'online')::boolean, true)),
        'attempts', count(*) FILTER (WHERE l.event = 'start'),
        'timeouts', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '3'),
        'denied', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '1'),
        'unavailable', count(*) FILTER (WHERE l.event = 'error' AND l.detail->>'code' = '2'),
        'silent', count(*) FILTER (WHERE l.event = 'silent'),
        'unsupported', count(*) FILTER (WHERE l.event = 'unsupported'),
        'success', count(*) FILTER (WHERE l.event = 'ok'),
        'logs', count(*))
      FROM private.bw_location_logs l
      WHERE l.user_id = a.user_id
        AND l.created_at BETWEEN a.created_at - interval '10 minutes' AND a.created_at + interval '1 minute'),
    'crossing', (SELECT jsonb_build_object(
        'departure_at', d.departure_at, 'arrival_at', d.arrival_at, 'status', d.status,
        'from', pf.name, 'to', pt.name, 'vessel', v.name,
        'reported_delay', d.reported_delay_minutes)
      FROM public.departures d
      LEFT JOIN public.routes r ON r.id = d.route_id
      LEFT JOIN public.ports pf ON pf.id = r.departure_port_id
      LEFT JOIN public.ports pt ON pt.id = r.arrival_port_id
      LEFT JOIN public.vessels v ON v.id = d.vessel_id
      WHERE d.id = a.departure_id),
    'ais', (SELECT jsonb_build_object('speed_knots', vp.speed_knots, 'reported_at', vp.reported_at, 'status', vp.status)
      FROM public.vessels v JOIN public.vessel_positions vp ON vp.mmsi = v.mmsi
      WHERE v.id = a.vessel_id ORDER BY vp.reported_at DESC NULLS LAST LIMIT 1),
    'nearby', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'kind', n.kind, 'category', n.category, 'detail', n.detail, 'delay_minutes', n.delay_minutes,
          'created_at', n.created_at, 'same_author', n.user_id = a.user_id, 'on_site', n.on_site,
          'confirmations', n.confirmations, 'denials', n.denials, 'validated', n.validated,
          'status', n.status) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT 'alert' kind, t.category, t.detail, t.delay_minutes, t.created_at, t.user_id, t.on_site,
               (SELECT count(*) FROM public.bw_alert_confirmations c WHERE c.alert_id = t.id) confirmations,
               (SELECT count(*) FROM public.bw_alert_denials d WHERE d.alert_id = t.id) denials,
               t.validated_at IS NOT NULL validated,
               CASE WHEN t.resolved THEN 'resolved' WHEN t.expires_at < now() THEN 'expired' ELSE 'active' END status
        FROM public.bw_travel_alerts t
        WHERE t.target_id = coalesce(a.vessel_id, a.port_id)
          AND t.created_at BETWEEN a.created_at - interval '3 hours' AND a.created_at + interval '3 hours'
        UNION ALL
        SELECT 'observation', o.category, o.detail, o.delay_minutes, o.created_at, o.user_id, false, 0, 0, false, o.status
        FROM public.bw_report_anomalies o
        WHERE o.id <> a.id AND coalesce(o.vessel_id, o.port_id) = coalesce(a.vessel_id, a.port_id)
          AND o.created_at BETWEEN a.created_at - interval '3 hours' AND a.created_at + interval '3 hours'
        LIMIT 20
      ) n),
    'lifetime', (SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes)
      FROM public.bw_signal_situations s
      LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = a.detail
      WHERE s.code = a.category),
    'moderator', (SELECT private.bw_traveller_card(mp) FROM private.bw_ensure_traveller(a.handled_by) mp
                  WHERE a.handled_by IS NOT NULL)
  )), '{}'::jsonb) INTO result
  FROM public.bw_report_anomalies a
  JOIN auth.users u ON u.id = a.user_id
  CROSS JOIN LATERAL private.bw_ensure_traveller(a.user_id) p
  WHERE a.id = ANY(p_ids);
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_anomaly_publish(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.bw_report_anomalies; life integer; ends timestamptz;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['community']),false) THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  SELECT * INTO r FROM public.bw_report_anomalies WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Observation déjà traitée'; END IF;
  IF r.vessel_id IS NOT NULL AND r.departure_id IS NULL THEN
    RAISE EXCEPTION 'Traversée inconnue : cette observation ne peut pas être publiée';
  END IF;
  SELECT coalesce(o.lifetime_minutes, s.lifetime_minutes) INTO life
  FROM public.bw_signal_situations s
  LEFT JOIN public.bw_signal_options o ON o.situation = s.code AND o.code = r.detail
  WHERE s.code = r.category;
  ends := r.created_at + make_interval(mins => coalesce(life, 120));
  IF ends <= now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Observation trop ancienne pour être publiée : marquez-la « Traité » ou « Écarter »';
  END IF;
  INSERT INTO public.bw_travel_alerts(target_kind,target_id,user_id,category,delay_minutes,detail,on_site,expires_at,departure_id,validated_at,validated_by,created_at)
  VALUES(
    CASE WHEN r.vessel_id IS NOT NULL THEN 'vessel' ELSE 'port' END,
    coalesce(r.vessel_id, r.port_id), r.user_id, r.category, r.delay_minutes, r.detail, false,
    ends, r.departure_id, now(), auth.uid(), r.created_at
  );
  UPDATE public.bw_report_anomalies SET status = 'handled', decision = 'published' WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_avatar_usage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['library']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  SELECT coalesce(jsonb_object_agg(avatar, n), '{}'::jsonb) INTO result
    FROM (SELECT avatar, count(*) n FROM public.bw_traveller_profiles GROUP BY avatar) x;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_chat_moderation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin','editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT m.created_at, jsonb_build_object('id', m.id, 'body', m.body, 'room_kind', m.room_kind, 'room_id', m.room_id,
      'created_at', m.created_at, 'hidden_at', m.hidden_at, 'hidden_reason', m.hidden_reason,
      'reports', (SELECT count(*) FROM public.bw_chat_reports r WHERE r.message_id = m.id),
      'author', private.bw_traveller_card(private.bw_ensure_traveller(m.user_id))) AS item
    FROM public.bw_chat_messages m
    WHERE m.created_at > now() - interval '30 days'
      AND (m.hidden_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.bw_chat_reports r WHERE r.message_id = m.id))
    ORDER BY m.created_at DESC LIMIT 100) x);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_chat_words_import(p_words text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE added integer;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF cardinality(p_words) > 5000 THEN RAISE EXCEPTION 'Fichier trop long (5000 termes au plus)'; END IF;
  WITH clean AS (
    SELECT DISTINCT lower(btrim(regexp_replace(w, '\s+', ' ', 'g'))) AS word FROM unnest(p_words) w
  )
  INSERT INTO public.bw_chat_words(word, source)
  SELECT word, 'import' FROM clean
  WHERE char_length(word) BETWEEN 2 AND 80 AND private.bw_chat_normalize(word) <> ''
  ON CONFLICT (word) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN jsonb_build_object('added', added, 'received', cardinality(p_words));
END $function$;

CREATE OR REPLACE FUNCTION public.bw_community_feed(p_kind text DEFAULT NULL::text, p_target uuid DEFAULT NULL::uuid, p_moderation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF p_moderation AND NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['community','reviews']),false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT jsonb_build_object('enabled',true,
    'rating_count',(SELECT count(*)::integer FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'rating_average',(SELECT avg(score) FROM public.bw_vessel_reviews WHERE p_kind='vessel' AND vessel_id=p_target AND status='published'),
    'alerts',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT a.id,a.target_kind,a.target_id,a.departure_id,a.category,a.delay_minutes,a.detail,a.on_site,a.created_at,a.expires_at,
        a.user_id = auth.uid() AS own,
        a.validated_at IS NOT NULL AS validated,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id) AS confirmations,
        (SELECT count(*)::integer FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.on_site) AS on_site_confirmations,
        EXISTS(SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id=a.id AND c.user_id=auth.uid()) AS confirmed,
        (SELECT count(*)::integer FROM public.bw_alert_denials d WHERE d.alert_id=a.id) AS denials,
        EXISTS(SELECT 1 FROM public.bw_alert_denials d WHERE d.alert_id=a.id AND d.user_id=auth.uid()) AS denied
      FROM public.bw_travel_alerts a WHERE NOT a.resolved AND a.expires_at>now()
        AND (p_kind IS NULL OR a.target_kind=p_kind) AND (p_target IS NULL OR a.target_id=p_target)
        AND ((a.target_kind='vessel' AND a.departure_id IS NOT NULL
          AND EXISTS(SELECT 1 FROM public.departures d WHERE d.id=a.departure_id AND d.vessel_id=a.target_id AND d.status<>'cancelled'))
          OR (a.target_kind='port' AND EXISTS(SELECT 1 FROM public.ports p WHERE p.id=a.target_id AND p.status='active')))
      ORDER BY a.created_at DESC LIMIT 300
    ) x),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT r.id,r.vessel_id,r.score,r.comment,r.status,r.created_at, r.user_id = auth.uid() AS own
      FROM public.bw_vessel_reviews r WHERE (p_moderation OR (p_kind='vessel' AND p_target=r.vessel_id))
        AND (p_moderation OR r.status='published' OR r.user_id=auth.uid())
      ORDER BY (p_moderation AND r.status='pending') DESC, (r.user_id=auth.uid()) DESC NULLS LAST, r.created_at DESC LIMIT 200
    ) x),'[]'::jsonb)) INTO result;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_delete_avatar(p_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE fallback text; moved integer;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['library']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  SELECT id INTO fallback FROM public.bw_avatars
    WHERE active AND kind = 'persona' AND id <> p_id ORDER BY sort LIMIT 1;
  IF fallback IS NULL THEN RAISE EXCEPTION 'Gardez au moins un personnage actif'; END IF;
  UPDATE public.bw_traveller_profiles SET avatar = fallback WHERE avatar = p_id;
  GET DIAGNOSTICS moved = ROW_COUNT;
  DELETE FROM public.bw_avatars WHERE id = p_id;
  RETURN moved;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_delete_library_category(p_id uuid, p_move_to uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE moved integer;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['library']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF p_move_to = p_id THEN RAISE EXCEPTION 'Choisissez une autre catégorie'; END IF;
  SELECT count(*) INTO moved FROM public.bw_library_category_items WHERE category_id = p_id;
  IF p_move_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bw_library_categories WHERE id = p_move_to) THEN
      RAISE EXCEPTION 'Catégorie de destination introuvable';
    END IF;
    INSERT INTO public.bw_library_category_items(category_id, item_id, sort)
      SELECT p_move_to, item_id, sort FROM public.bw_library_category_items WHERE category_id = p_id
      ON CONFLICT DO NOTHING;
  END IF;
  DELETE FROM public.bw_library_categories WHERE id = p_id;
  RETURN moved;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_dm_report_resolve(p_thread uuid, p_sanction boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE rep public.bw_dm_reports; t public.bw_dm_threads; culprit uuid;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin','editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO t FROM public.bw_dm_threads x WHERE x.id = p_thread;
  FOR rep IN SELECT * FROM public.bw_dm_reports r WHERE r.thread_id = p_thread AND r.resolved_at IS NULL LOOP
    IF p_sanction THEN
      culprit := CASE WHEN t.requester_id = rep.reporter_id THEN t.recipient_id ELSE t.requester_id END;
      INSERT INTO public.bw_chat_strikes(user_id, reason) SELECT culprit, 'dm_report' FROM generate_series(1, 5);
    END IF;
  END LOOP;
  UPDATE public.bw_dm_reports r SET resolved_at = now() WHERE r.thread_id = p_thread AND r.resolved_at IS NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_dm_reported()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin','editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT rep.created_at, jsonb_build_object(
      'id', t.id, 'intro', t.intro, 'reported_at', rep.created_at,
      'reporter', private.bw_traveller_card(private.bw_ensure_traveller(rep.reporter_id))->>'pseudo',
      'reported', private.bw_traveller_card(private.bw_ensure_traveller(
                    CASE WHEN t.requester_id = rep.reporter_id THEN t.recipient_id ELSE t.requester_id END))->>'pseudo',
      'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'body', m.body,
                      'from', private.bw_traveller_card(private.bw_ensure_traveller(m.sender_id))->>'pseudo') ORDER BY m.created_at), '[]'::jsonb)
                     FROM public.bw_dm_messages m WHERE m.thread_id = t.id)
    ) AS item
    FROM public.bw_dm_reports rep JOIN public.bw_dm_threads t ON t.id = rep.thread_id
    WHERE rep.resolved_at IS NULL) x);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_moderate_entity_review(p_review uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.bw_account_active()
 OR NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['reviews','community']), false)
 OR p_status IS NULL OR p_status NOT IN ('published','hidden') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 UPDATE public.bw_entity_reviews SET status=p_status,
 published_scores=CASE WHEN p_status='published' THEN scores ELSE NULL END,
 published_at=CASE WHEN p_status='published' THEN now() ELSE NULL END WHERE id=p_review;
 IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_moderate_review(p_review uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['reviews','community']),false) OR p_status NOT IN ('published','hidden') OR p_status IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.bw_vessel_reviews SET status=p_status WHERE id=p_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avis introuvable'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_news_merge(p_keep uuid, p_drop uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.bw_news%ROWTYPE; extra jsonb;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['flash','watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_keep = p_drop THEN RAISE EXCEPTION 'Choisissez deux actualités différentes'; END IF;
  SELECT * INTO d FROM public.bw_news WHERE id = p_drop FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.bw_news WHERE id = p_keep) THEN RAISE EXCEPTION 'Actualité introuvable'; END IF;
  PERFORM private.bw_news_add_source(p_keep, d.source_name, d.source_url, coalesce(d.source_title, d.title), d.source_published_at, d.departure_ids);
  FOR extra IN SELECT * FROM jsonb_array_elements(d.extra_sources) LOOP
    PERFORM private.bw_news_add_source(p_keep, extra->>'name', extra->>'url', extra->>'title', (extra->>'published_at')::timestamptz, '{}');
  END LOOP;
  UPDATE public.bw_news k SET
    company_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.company_ids || d.company_ids) x),
    route_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.route_ids || d.route_ids) x),
    port_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.port_ids || d.port_ids) x),
    vessel_id = coalesce(k.vessel_id, d.vessel_id)
  WHERE k.id = p_keep;
  UPDATE public.bw_news SET published = false, updated_at = now() WHERE id = p_drop;
  UPDATE public.bw_watch_proposals SET duplicate_of = p_keep WHERE duplicate_of = p_drop;
END $function$;

CREATE OR REPLACE FUNCTION private.bw_photo_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['reviews']), false);
$function$;

CREATE OR REPLACE FUNCTION public.bw_review_authors_staff(p_kind text, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb := '{}'::jsonb; row record; prof public.bw_traveller_profiles; joined timestamptz;
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','moderator'], ARRAY['reviews','community']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF p_kind NOT IN ('port_review','vessel_review','entity_review','alert') OR coalesce(array_length(p_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Demande invalide';
  END IF;
  FOR row IN
    SELECT id, user_id FROM public.port_reviews WHERE p_kind = 'port_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_vessel_reviews WHERE p_kind = 'vessel_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_entity_reviews WHERE p_kind = 'entity_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_travel_alerts WHERE p_kind = 'alert' AND id = ANY(p_ids)
  LOOP
    CONTINUE WHEN row.user_id IS NULL;
    -- Un auteur illisible ne doit pas cacher les autres.
    BEGIN
      prof := private.bw_ensure_traveller(row.user_id);
      SELECT u.created_at INTO joined FROM auth.users u WHERE u.id = row.user_id;
      result := result || jsonb_build_object(row.id::text, jsonb_build_object(
        'card', private.bw_traveller_card(prof),
        'joined_at', joined,
        'reviews', (SELECT count(*) FROM (
            SELECT 1 FROM public.port_reviews r WHERE r.user_id = row.user_id
            UNION ALL SELECT 1 FROM public.bw_vessel_reviews r WHERE r.user_id = row.user_id
            UNION ALL SELECT 1 FROM public.bw_entity_reviews r WHERE r.user_id = row.user_id) g),
        'hidden', (SELECT count(*) FROM (
            SELECT 1 FROM public.port_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden'
            UNION ALL SELECT 1 FROM public.bw_vessel_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden'
            UNION ALL SELECT 1 FROM public.bw_entity_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden') g),
        'alerts', (SELECT count(*) FROM public.bw_travel_alerts a WHERE a.user_id = row.user_id)));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_route_stop_decide(p_id uuid, p_decision text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.bw_route_stops%ROWTYPE;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['community']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'pending') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  SELECT * INTO s FROM public.bw_route_stops WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Halte introuvable'; END IF;
  IF p_decision = 'approved' AND COALESCE(p_lat, s.lat) IS NULL THEN
    RAISE EXCEPTION 'Place la halte (latitude, longitude) avant de la publier.';
  END IF;
  UPDATE public.bw_route_stops SET
    status = p_decision,
    lat = COALESCE(p_lat, lat),
    lon = COALESCE(p_lon, lon),
    decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
    decided_by = CASE WHEN p_decision = 'pending' THEN NULL ELSE auth.uid() END,
    decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END
  WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_route_stops_admin(p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['community']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  RETURN jsonb_build_object(
    'pending', (SELECT count(*) FROM public.bw_route_stops WHERE status = 'pending'),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'route_code', s.route_code, 'kind', s.kind, 'name', s.name, 'place', s.place,
        'lat', s.lat, 'lon', s.lon, 'features', s.features, 'direction', s.direction, 'note', s.note,
        'status', s.status, 'created_at', s.created_at, 'decided_at', s.decided_at, 'decision_note', s.decision_note,
        'author', (SELECT t.pseudo FROM public.bw_traveller_profiles t WHERE t.user_id = s.user_id))
        ORDER BY s.created_at DESC)
      FROM (SELECT * FROM public.bw_route_stops
            WHERE (p_status = 'pending' AND status = 'pending') OR (p_status <> 'pending' AND status <> 'pending')
            ORDER BY created_at DESC LIMIT 200) s), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION private.bw_schedule_editor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['schedules','commercial','planning','departures','import']), false);
$function$;

CREATE OR REPLACE FUNCTION public.bw_ticket_insight_decide(p_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['tickets']), false) THEN RAISE EXCEPTION 'Action réservée à l’équipe'; END IF;
  IF p_status NOT IN ('done','dismissed') THEN RAISE EXCEPTION 'Décision inconnue.'; END IF;
  UPDATE public.bw_ticket_insights SET status = p_status, decided_at = now(), decided_by = auth.uid() WHERE id = p_id;
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_ticket_insights_staff()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT coalesce(private.bw_staff_can(ARRAY['admin','editor'], ARRAY['tickets']), false) THEN RAISE EXCEPTION 'Action réservée à l’équipe'; END IF;
  RETURN jsonb_build_object(
    'schedules', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'departure_id', i.departure_id, 'company', c.name,
        'route', (SELECT a.name || ' → ' || b.name FROM public.routes r
                  JOIN public.ports a ON a.id = r.departure_port_id JOIN public.ports b ON b.id = r.arrival_port_id
                  WHERE r.id = d.route_id),
        'ticket_departure_at', i.ticket_departure_at, 'bledway_departure_at', i.bledway_departure_at,
        'current_departure_at', d.departure_at, 'ticket_vessel', i.ticket_vessel,
        'vessel', (SELECT v.name FROM public.vessels v WHERE v.id = d.vessel_id), 'created_at', i.created_at
      ) ORDER BY i.created_at DESC)
      FROM public.bw_ticket_insights i
      JOIN public.departures d ON d.id = i.departure_id
      LEFT JOIN public.companies c ON c.id = i.company_id
      WHERE i.kind = 'schedule' AND i.status = 'new'), '[]'::jsonb),
    'agencies', coalesce((SELECT jsonb_agg(jsonb_build_object('agency', x.agency, 'count', x.n, 'companies', x.companies, 'last_seen', x.last_seen) ORDER BY x.n DESC)
      FROM (SELECT min(i.agency) AS agency, count(*) AS n, max(i.created_at) AS last_seen,
                   array_remove(array_agg(DISTINCT c.name), NULL) AS companies
            FROM public.bw_ticket_insights i LEFT JOIN public.companies c ON c.id = i.company_id
            WHERE i.kind = 'agency' AND i.status <> 'dismissed'
            GROUP BY lower(i.agency)) x), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.bw_watch_adjust(p_id uuid, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; v_at timestamptz;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p.kind NOT IN ('departure', 'schedule_fix') OR p.field NOT IN ('departure_at', 'arrival_at') THEN
    RAISE EXCEPTION 'Seule une date ou une heure se corrige ici';
  END IF;
  v_at := p_value::timestamptz;
  UPDATE public.bw_watch_proposals
     SET proposed_value = to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
   WHERE id = p_id;
  RETURN jsonb_build_object('proposed_value', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END $function$;

CREATE OR REPLACE FUNCTION public.bw_watch_attach(p_id uuid, p_news uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p.kind NOT IN ('flash', 'note') THEN RAISE EXCEPTION 'Seule une actualité peut compléter une autre actualité'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bw_news WHERE id = p_news) THEN RAISE EXCEPTION 'Actualité introuvable'; END IF;
  SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
  SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
  PERFORM private.bw_news_add_source(p_news, coalesce(substring(i.title from ' - ([^-]+)$'), s.name),
    CASE WHEN i.url LIKE 'https://%' THEN coalesce(i.article_url, i.url) END, i.title, i.published_at, p.departure_ids);
  UPDATE public.bw_watch_proposals
     SET status = 'approved', applied = true, duplicate_of = p_news, decided_by = auth.uid(), decided_at = now(),
         decision_note = 'Ajoutée comme source à une actualité déjà publiée'
   WHERE id = p_id;
  RETURN jsonb_build_object('status', 'approved', 'applied', true);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_watch_decide(p_id uuid, p_decision text, p_note text DEFAULT NULL::text, p_news jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE; did boolean := false; v_source text; v_title text; v_summary text; v_deps uuid[];
  v_new jsonb; v_created uuid;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'standby') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p_decision = 'approved' THEN
    IF p.kind IN ('departure', 'vessel', 'incident', 'crossing', 'schedule_fix')
       AND private.bw_watch_current(p.kind, p.departure_id, p.vessel_id, p.field) IS DISTINCT FROM p.current_value THEN
      RAISE EXCEPTION 'La donnée a changé depuis cette proposition : vérifiez-la, puis refusez la proposition.';
    END IF;
    IF p.kind = 'departure' THEN
      IF p.field = 'status' THEN
        UPDATE public.departures SET status = p.proposed_value::public.departure_status WHERE id = p.departure_id;
      ELSIF p.field = 'departure_at' THEN
        UPDATE public.departures SET departure_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'arrival_at' THEN
        UPDATE public.departures SET arrival_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'vessel_id' THEN
        UPDATE public.departures SET vessel_id = p.proposed_value::uuid WHERE id = p.departure_id;
      END IF;
      did := true;
    ELSIF p.kind = 'schedule_fix' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      UPDATE public.departures SET
        departure_at = CASE WHEN p.field = 'departure_at' THEN p.proposed_value::timestamptz ELSE departure_at END,
        arrival_at = CASE WHEN p.field = 'arrival_at' THEN p.proposed_value::timestamptz ELSE arrival_at END,
        vessel_id = CASE WHEN p.field = 'vessel_id' THEN p.proposed_value::uuid ELSE vessel_id END,
        source_name = left(s.name, 120), source_url = s.url, last_verified_at = now()
      WHERE id = p.departure_id;
      UPDATE public.departures SET duration_minutes = round(extract(epoch FROM (arrival_at - departure_at)) / 60)
      WHERE id = p.departure_id AND arrival_at IS NOT NULL AND arrival_at > departure_at;
      did := true;
    ELSIF p.kind = 'new_departure' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      v_new := p.proposed_value::jsonb;
      INSERT INTO public.departures(route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes,
                                    status, source_name, source_url, last_verified_at, reliability)
      VALUES ((v_new->>'route_id')::uuid, p.company_id, (v_new->>'vessel_id')::uuid,
              (v_new->>'departure_at')::timestamptz, (v_new->>'arrival_at')::timestamptz,
              CASE WHEN v_new->>'arrival_at' IS NOT NULL
                   THEN round(extract(epoch FROM ((v_new->>'arrival_at')::timestamptz - (v_new->>'departure_at')::timestamptz)) / 60) END,
              'scheduled', left(s.name, 120), s.url, now(), 'verified')
      RETURNING id INTO v_created;
      UPDATE public.bw_watch_proposals SET departure_id = v_created, departure_ids = ARRAY[v_created] WHERE id = p_id;
      did := true;
    ELSIF p.kind = 'remove_departure' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      UPDATE public.bw_watch_proposals SET departure_id = NULL, departure_ids = '{}' WHERE id = p_id;
      PERFORM public.bw_admin_remove_departure(p.departure_id, true, left('Absente du planning officiel (' || s.name || ')', 300));
      did := true;
    ELSIF p.kind = 'crossing' THEN
      UPDATE public.departures SET
        web_departed_at = CASE WHEN p.field = 'web_departed_at' THEN p.proposed_value::timestamptz ELSE web_departed_at END,
        web_arrived_at = CASE WHEN p.field = 'web_arrived_at' THEN p.proposed_value::timestamptz ELSE web_arrived_at END,
        web_eta_at = CASE WHEN p.field = 'web_eta_at' THEN p.proposed_value::timestamptz ELSE web_eta_at END
      WHERE id = p.departure_id;
      did := true;
    ELSIF p.kind = 'vessel' THEN
      UPDATE public.vessels SET status = p.proposed_value::public.entity_status WHERE id = p.vessel_id;
      did := true;
    ELSIF p.kind = 'incident' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      v_source := left(coalesce(CASE WHEN s.url LIKE '%{name}%' THEN substring(i.title from ' - ([^-]+)$') END, s.name), 120);
      UPDATE public.bw_vessel_incidents
         SET verified_at = CASE WHEN p.field = 'verified_at' THEN p.proposed_value::timestamptz ELSE verified_at END,
             status = CASE WHEN p.field = 'status' THEN 'resolved' ELSE status END,
             source_name = v_source,
             source_url = CASE WHEN i.url LIKE 'https://%' THEN i.url ELSE source_url END
       WHERE vessel_id = p.vessel_id AND status IN ('verifying', 'confirmed');
      did := true;
    ELSIF p.kind = 'flash' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      v_title := left(coalesce(nullif(trim(p_news->>'title'), ''), p.title), 160);
      v_summary := left(coalesce(nullif(trim(p_news->>'summary'), ''), p.public_summary, p.summary), 400);
      IF p_news IS NOT NULL AND jsonb_typeof(p_news->'departure_ids') = 'array' THEN
        v_deps := ARRAY(
          SELECT d.id FROM public.departures d
          WHERE d.id::text IN (
            SELECT x FROM jsonb_array_elements_text(p_news->'departure_ids') x
            WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
          LIMIT 12);
      ELSE
        v_deps := CASE WHEN cardinality(p.departure_ids) > 0 THEN p.departure_ids
                       WHEN p.departure_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.departure_id] END;
      END IF;
      INSERT INTO public.bw_news(kind, origin, title, summary, source_name, source_url, vessel_id, company_ids, departure_ids,
                                 source_title, source_excerpt, source_published_at, published, created_by)
      VALUES (coalesce(p.proposed_value, 'info'), CASE WHEN s.tier = 'official' THEN 'official' ELSE 'media' END, v_title, v_summary,
              left(s.name, 80), i.url, p.vessel_id,
              CASE WHEN p.company_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.company_id] END,
              v_deps, left(i.title, 200), left(i.excerpt, 300), i.published_at,
              true, auth.uid());
      did := true;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = p_decision, applied = did, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300)
   WHERE id = p_id;
  RETURN jsonb_build_object('status', p_decision, 'applied', did);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_watch_relaunch()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run_id uuid;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_watch_runs r WHERE r.requested_by IS NOT NULL AND r.requested_at > now() - interval '3 minutes') THEN
    RAISE EXCEPTION 'Une veille vient d''être relancée : réessayez dans quelques minutes.';
  END IF;
  INSERT INTO public.bw_watch_runs(requested_by) VALUES (auth.uid()) RETURNING id INTO run_id;
  PERFORM net.http_get(
    url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/watch-collect?force=1&run=' || run_id::text,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
    timeout_milliseconds := 120000
  );
  RETURN run_id;
END $function$;

CREATE OR REPLACE FUNCTION public.bw_watch_revert(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; v_before timestamptz;
BEGIN
  IF NOT private.bw_staff_can(ARRAY['admin', 'editor'], ARRAY['watch']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR p.kind NOT IN ('crossing', 'schedule_fix', 'new_departure') OR p.status <> 'approved' OR NOT p.applied THEN
    RAISE EXCEPTION 'Cette proposition ne peut pas être annulée';
  END IF;
  IF p.kind = 'new_departure' THEN
    IF p.departure_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.departures WHERE id = p.departure_id) THEN
      RAISE EXCEPTION 'La traversée ajoutée n''existe plus.';
    END IF;
    UPDATE public.bw_watch_proposals SET departure_id = NULL, departure_ids = '{}' WHERE id = p_id;
    PERFORM public.bw_admin_remove_departure(p.departure_id, true, 'Ajout automatique annulé');
  ELSE
    IF private.bw_watch_current(p.kind, p.departure_id, p.vessel_id, p.field) IS DISTINCT FROM p.proposed_value THEN
      RAISE EXCEPTION 'Une autre correction a remplacé celle-ci : annulez d''abord la plus récente.';
    END IF;
    IF p.kind = 'crossing' THEN
      v_before := p.current_value::timestamptz;
      UPDATE public.departures SET
        web_departed_at = CASE WHEN p.field = 'web_departed_at' THEN v_before ELSE web_departed_at END,
        web_arrived_at = CASE WHEN p.field = 'web_arrived_at' THEN v_before ELSE web_arrived_at END,
        web_eta_at = CASE WHEN p.field = 'web_eta_at' THEN v_before ELSE web_eta_at END
      WHERE id = p.departure_id;
    ELSE
      UPDATE public.departures SET
        departure_at = CASE WHEN p.field = 'departure_at' THEN p.current_value::timestamptz ELSE departure_at END,
        arrival_at = CASE WHEN p.field = 'arrival_at' THEN p.current_value::timestamptz ELSE arrival_at END,
        vessel_id = CASE WHEN p.field = 'vessel_id' THEN p.current_value::uuid ELSE vessel_id END
      WHERE id = p.departure_id;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = 'rejected', applied = false, decided_by = auth.uid(), decided_at = now(), decision_note = 'Correction annulée'
   WHERE id = p_id;
  RETURN jsonb_build_object('status', 'rejected', 'applied', false);
END $function$;


NOTIFY pgrst, 'reload schema';
COMMIT;
