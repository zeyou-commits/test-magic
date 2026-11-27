-- BledWay · Réponse aux voyageurs qui signalent une erreur, et badge « Vigie » (27/11/2026).
-- Avant : un signalement partait dans l'admin et le voyageur n'avait plus jamais de nouvelles.
-- Désormais :
--   • accusé de réception automatique dans « Mes notifications » (sans push : il vient d'envoyer) ;
--   • à la clôture, l'équipe choisit l'issue (corrigé, transmis à la compagnie, déjà juste, pas assez
--     d'éléments, écarté) et envoie une réponse pré-remplie qu'elle peut modifier
--     (bw_report_reply) : notification + push, ou e-mail si aucun téléphone n'est abonné ;
--   • chaque signalement « Traité » compte comme une fiche corrigée : badge « Vigie » à 1, 5, 15 et
--     50, annoncé au voyageur, visible sur son profil public, dans son compte et dans l'admin.
-- Textes : supabase/functions/_shared/reportTemplate.ts, modifiables dans l'admin (Contenus →
-- E-mails → Signalements, réglage « report_replies »). Le script peut être relancé.
BEGIN;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reply_outcome text,
  ADD COLUMN IF NOT EXISTS reply_text text,
  ADD COLUMN IF NOT EXISTS reply_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reply_outcome_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_reply_outcome_check
  CHECK (reply_outcome IS NULL OR reply_outcome IN
         ('corrected', 'forwarded', 'already_right', 'insufficient', 'dismissed'));
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reply_text_size;
ALTER TABLE public.reports ADD CONSTRAINT reports_reply_text_size
  CHECK (reply_text IS NULL OR char_length(reply_text) <= 600);

-- Textes d'origine (copie de reportTemplate.ts), remplacés par ceux de l'admin s'ils existent.
CREATE OR REPLACE FUNCTION private.bw_report_text(p_lang text, p_key text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
  WITH d AS (SELECT $json${"fr":{"ackTitle":"Merci, on vérifie ton signalement","ackBody":"{fiche} : l'équipe regarde ce que tu as signalé. Tu recevras la réponse ici dès que c'est vérifié.","badgeTitle":"Nouveau badge : {badge} 🏅","badgeBody":"Tes signalements ont déjà corrigé {n} fiche(s). Merci de rendre BledWay plus fiable pour tout le monde !"},"ar":{"ackTitle":"شكرًا، نحن نتحقق من بلاغك","ackBody":"{fiche}: فريقنا يراجع ما أبلغت عنه. ستصلك الإجابة هنا فور التحقق.","badgeTitle":"شارة جديدة: {badge} 🏅","badgeBody":"بلاغاتك صحّحت حتى الآن {n} معلومة. شكرًا لأنك تجعل BledWay أكثر موثوقية للجميع!"},"en":{"ackTitle":"Thanks, we're checking your report","ackBody":"{fiche}: the team is looking into what you reported. You'll get the answer here as soon as it's checked.","badgeTitle":"New badge: {badge} 🏅","badgeBody":"Your reports have already fixed {n} listing(s). Thanks for making BledWay more reliable for everyone!"}}$json$::jsonb AS v),
       s AS (SELECT value AS v FROM public.bw_admin_settings WHERE key = 'report_replies')
  SELECT coalesce(
    nullif(btrim((SELECT s.v -> p_lang ->> p_key FROM s)), ''),
    (SELECT d.v -> p_lang ->> p_key FROM d),
    (SELECT d.v -> 'fr' ->> p_key FROM d));
$f$;
REVOKE ALL ON FUNCTION private.bw_report_text(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.bw_report_fill(p_text text, p_fiche text, p_badge text, p_n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $f$
  SELECT btrim(regexp_replace(
    replace(replace(replace(coalesce(p_text, ''), '{fiche}', coalesce(p_fiche, '')),
                    '{badge}', coalesce(p_badge, '')), '{n}', coalesce(p_n::text, '')),
    '^\s*:\s*', ''));
$f$;

-- La fiche signalée en quelques mots : « Marseille → Alger · 27/11 ».
CREATE OR REPLACE FUNCTION private.bw_report_subject(p_type text, p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
  SELECT CASE p_type
    WHEN 'departure' THEN (
      SELECT dp.name || ' → ' || ap.name || ' · ' || to_char(d.departure_at AT TIME ZONE 'Europe/Paris', 'DD/MM')
        FROM public.departures d
        JOIN public.routes rt ON rt.id = d.route_id
        JOIN public.ports dp ON dp.id = rt.departure_port_id
        JOIN public.ports ap ON ap.id = rt.arrival_port_id
       WHERE d.id = p_id)
    WHEN 'route' THEN (
      SELECT dp.name || ' → ' || ap.name
        FROM public.routes rt
        JOIN public.ports dp ON dp.id = rt.departure_port_id
        JOIN public.ports ap ON ap.id = rt.arrival_port_id
       WHERE rt.id = p_id)
    WHEN 'schedule' THEN (
      SELECT dp.name || ' → ' || ap.name
        FROM public.schedules s
        JOIN public.routes rt ON rt.id = s.route_id
        JOIN public.ports dp ON dp.id = rt.departure_port_id
        JOIN public.ports ap ON ap.id = rt.arrival_port_id
       WHERE s.id = p_id)
    WHEN 'port' THEN (SELECT name FROM public.ports WHERE id = p_id)
    WHEN 'vessel' THEN (SELECT name FROM public.vessels WHERE id = p_id)
    WHEN 'company' THEN (SELECT name FROM public.companies WHERE id = p_id)
  END;
$f$;
REVOKE ALL ON FUNCTION private.bw_report_subject(text, uuid) FROM PUBLIC, anon, authenticated;

-- Fiches corrigées grâce à un voyageur, et palier « Vigie » atteint.
CREATE OR REPLACE FUNCTION private.bw_report_fixes(p_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
  SELECT count(*)::integer FROM public.reports WHERE reporter_id = p_user AND status = 'resolved';
$f$;
REVOKE ALL ON FUNCTION private.bw_report_fixes(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.bw_vigie(p_fixes integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f$
  SELECT l FROM jsonb_array_elements($json$[{"at":1,"code":"vigie","label":{"fr":"Vigie","ar":"الحارس","en":"Lookout"}},{"at":5,"code":"vigie_confirmee","label":{"fr":"Vigie confirmée","ar":"حارس متمرّس","en":"Seasoned lookout"}},{"at":15,"code":"vigie_or","label":{"fr":"Vigie d'or","ar":"الحارس الذهبي","en":"Golden lookout"}},{"at":50,"code":"capitaine_vigies","label":{"fr":"Capitaine des vigies","ar":"قائد الحراس","en":"Lookout captain"}}]$json$::jsonb) AS l
   WHERE (l ->> 'at')::integer <= coalesce(p_fixes, 0)
   ORDER BY (l ->> 'at')::integer DESC
   LIMIT 1;
$f$;

CREATE OR REPLACE FUNCTION private.bw_report_lang(p_context jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f$
  SELECT CASE WHEN p_context ->> 'locale' IN ('fr', 'ar', 'en') THEN p_context ->> 'locale' ELSE 'fr' END;
$f$;

-- La réponse ne s'écrit que par l'équipe (bw_report_reply), jamais par le formulaire du voyageur.
CREATE OR REPLACE FUNCTION private.bw_reports_clean_reply() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.reply_outcome := NULL;
    NEW.reply_text := NULL;
    NEW.reply_sent := false;
    NEW.replied_at := NULL;
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS bw_reports_clean_reply ON public.reports;
CREATE TRIGGER bw_reports_clean_reply BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.bw_reports_clean_reply();

-- Accusé de réception : dans « Mes notifications » seulement (déjà marqué comme poussé : le
-- voyageur vient d'envoyer, un push serait de trop).
CREATE OR REPLACE FUNCTION private.bw_reports_ack() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE lang text;
BEGIN
  BEGIN
    IF NEW.reporter_id IS NULL THEN RETURN NULL; END IF;
    lang := private.bw_report_lang(NEW.context);
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url, pushed_at)
    VALUES (NEW.reporter_id, 'moderation:report:' || NEW.id || ':received',
            left(private.bw_report_text(lang, 'ackTitle'), 120),
            left(private.bw_report_fill(private.bw_report_text(lang, 'ackBody'),
                 private.bw_report_subject(NEW.target_type::text, NEW.target_id), NULL, NULL), 600),
            '/compte#contributions', now())
    ON CONFLICT (user_id, event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.bw_reports_ack() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_reports_ack ON public.reports;
CREATE TRIGGER bw_reports_ack AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.bw_reports_ack();

-- Décision de l'équipe + réponse au voyageur + badge, en une fois.
CREATE OR REPLACE FUNCTION public.bw_report_reply(
  p_id uuid, p_status text, p_outcome text, p_note text,
  p_send boolean, p_title text, p_body text, p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE r public.reports; before integer := 0; fixes integer := 0; level jsonb; old_level jsonb;
        lang text; sending boolean; badge jsonb := NULL;
BEGIN
  IF NOT (coalesce(private.has_role(auth.uid(), 'admin'::public.app_role), false)
          OR coalesce(private.bw_staff_can(ARRAY['moderator'], ARRAY['reports', 'incidents', 'community']), false)) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF p_status NOT IN ('resolved', 'rejected') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('corrected', 'forwarded', 'already_right', 'insufficient', 'dismissed') THEN
    RAISE EXCEPTION 'Issue inconnue';
  END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signalement introuvable'; END IF;
  IF r.reporter_id IS NOT NULL THEN before := private.bw_report_fixes(r.reporter_id); END IF;
  sending := coalesce(p_send, false) AND r.reporter_id IS NOT NULL AND btrim(coalesce(p_body, '')) <> '';

  UPDATE public.reports SET
    status = p_status::public.report_status,
    resolution_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    handled_at = now(),
    reply_outcome = p_outcome,
    reply_text = CASE WHEN sending THEN left(btrim(p_body), 600) END,
    reply_sent = sending,
    replied_at = CASE WHEN sending THEN now() END
  WHERE id = p_id;

  IF sending THEN
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
    VALUES (r.reporter_id,
            'moderation:report:' || r.id || ':reply:' || floor(extract(epoch FROM now()))::bigint,
            left(coalesce(nullif(btrim(p_title), ''), 'Réponse à ton signalement'), 120),
            left(btrim(p_body), 600),
            CASE WHEN p_url LIKE '/%' THEN left(p_url, 300) ELSE '/compte#contributions' END)
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END IF;

  IF r.reporter_id IS NOT NULL THEN
    fixes := private.bw_report_fixes(r.reporter_id);
    level := private.bw_vigie(fixes);
    old_level := private.bw_vigie(before);
    IF level IS NOT NULL AND fixes > before
       AND (old_level IS NULL OR old_level ->> 'code' <> level ->> 'code') THEN
      lang := private.bw_report_lang(r.context);
      INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
      VALUES (r.reporter_id, 'moderation:badge:' || (level ->> 'code'),
              left(private.bw_report_fill(private.bw_report_text(lang, 'badgeTitle'), NULL,
                   level -> 'label' ->> lang, fixes), 120),
              left(private.bw_report_fill(private.bw_report_text(lang, 'badgeBody'), NULL,
                   level -> 'label' ->> lang, fixes), 600),
              '/compte#contributions')
      ON CONFLICT (user_id, event_key) DO NOTHING;
      badge := level;
    END IF;
  END IF;
  RETURN jsonb_build_object('sent', sending, 'fixes', fixes, 'badge', badge);
END $f$;
REVOKE ALL ON FUNCTION public.bw_report_reply(uuid, text, text, text, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_report_reply(uuid, text, text, text, boolean, text, text, text) TO authenticated;

-- Mes fiches corrigées et mon badge (compte du voyageur).
CREATE OR REPLACE FUNCTION public.bw_my_report_reward() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE fixes integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  fixes := private.bw_report_fixes(auth.uid());
  RETURN jsonb_build_object('fixes', fixes, 'level', private.bw_vigie(fixes));
END $f$;
REVOKE ALL ON FUNCTION public.bw_my_report_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_my_report_reward() TO authenticated;

-- E-mail de secours : la réponse et le badge partent aussi par e-mail quand aucun téléphone
-- n'est abonné aux notifications (modèle « report » de la fonction alert-email).
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
  UNION ALL
  SELECT n.id, n.user_id, 'report'
    FROM new_rows n
   WHERE (n.event_key LIKE 'moderation:report:%:reply:%' OR n.event_key LIKE 'moderation:badge:%')
     AND NOT EXISTS (SELECT 1 FROM public.bw_push_subscriptions s WHERE s.user_id = n.user_id)
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
  RETURN NULL;
END $function$;

-- Liste de l'équipe : la réponse envoyée s'affiche avec la décision.
CREATE OR REPLACE FUNCTION public.bw_reports_staff(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE is_admin boolean; result jsonb;
BEGIN
  is_admin := coalesce(private.has_role(auth.uid(), 'admin'::public.app_role), false);
  IF NOT (is_admin OR coalesce(private.bw_staff_can(ARRAY['moderator'], ARRAY['reports', 'incidents', 'community']), false)) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY (item->>'created_at') DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'reason', r.reason,
      'message', r.message,
      'status', r.status,
      'context', r.context,
      'resolution_note', r.resolution_note,
      'reply_outcome', r.reply_outcome,
      'reply_text', r.reply_text,
      'replied_at', r.replied_at,
      'reply_sent', r.reply_sent,
      'created_at', r.created_at,
      'handled_at', r.handled_at,
      'handled_by', (SELECT coalesce(tp.pseudo, p.display_name)
                       FROM public.profiles p
                       LEFT JOIN public.bw_traveller_profiles tp ON tp.user_id = p.id
                      WHERE p.id = r.handled_by),
      'reporter', (
        SELECT jsonb_build_object(
          'id', u.id,
          'pseudo', tp.pseudo,
          'name', p.display_name,
          'avatar', tp.avatar,
          'email', CASE WHEN is_admin THEN u.email END,
          'since', u.created_at,
          'staff', EXISTS (SELECT 1 FROM public.user_roles ur
                            WHERE ur.user_id = u.id AND ur.role::text IN ('admin', 'editor', 'moderator')),
          'reports', (SELECT count(*) FROM public.reports x WHERE x.reporter_id = u.id),
          'rejected', (SELECT count(*) FROM public.reports x WHERE x.reporter_id = u.id AND x.status = 'rejected'),
          'resolved', (SELECT count(*) FROM public.reports x WHERE x.reporter_id = u.id AND x.status = 'resolved')
        )
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.bw_traveller_profiles tp ON tp.user_id = u.id
        WHERE u.id = r.reporter_id
      ),
      -- Autres signalements sur la même fiche (30 derniers jours).
      'same_target', (SELECT count(*) FROM public.reports x
                       WHERE x.target_type = r.target_type AND x.target_id = r.target_id
                         AND x.id <> r.id AND x.created_at > now() - interval '30 days'),
      -- La fiche visée, telle qu'elle est maintenant.
      'target', CASE r.target_type
        WHEN 'departure' THEN (
          SELECT jsonb_build_object(
            'label', dp.name || ' → ' || ap.name,
            'departure_at', d.departure_at,
            'arrival_at', d.arrival_at,
            'duration_minutes', d.duration_minutes,
            'status', d.status,
            'vessel', v.name,
            'company', c.name,
            'route_id', d.route_id,
            'port_country', dp.country_code,
            'source_name', d.source_name,
            'source_url', d.source_url,
            'last_verified_at', d.last_verified_at,
            'delay_minutes', d.reported_delay_minutes,
            'updated_at', d.updated_at)
          FROM public.departures d
          JOIN public.routes rt ON rt.id = d.route_id
          JOIN public.ports dp ON dp.id = rt.departure_port_id
          JOIN public.ports ap ON ap.id = rt.arrival_port_id
          LEFT JOIN public.vessels v ON v.id = d.vessel_id
          LEFT JOIN public.companies c ON c.id = d.company_id
          WHERE d.id = r.target_id)
        WHEN 'route' THEN (
          SELECT jsonb_build_object('label', dp.name || ' → ' || ap.name, 'slug', rt.slug, 'status', rt.status)
          FROM public.routes rt
          JOIN public.ports dp ON dp.id = rt.departure_port_id
          JOIN public.ports ap ON ap.id = rt.arrival_port_id
          WHERE rt.id = r.target_id)
        WHEN 'schedule' THEN (
          SELECT jsonb_build_object('label', dp.name || ' → ' || ap.name || ' · ' || to_char(s.departure_time, 'HH24:MI'),
                                    'company', c.name, 'route_id', s.route_id, 'status', s.status)
          FROM public.schedules s
          JOIN public.routes rt ON rt.id = s.route_id
          JOIN public.ports dp ON dp.id = rt.departure_port_id
          JOIN public.ports ap ON ap.id = rt.arrival_port_id
          LEFT JOIN public.companies c ON c.id = s.company_id
          WHERE s.id = r.target_id)
        WHEN 'port' THEN (SELECT jsonb_build_object('label', name, 'slug', slug, 'status', status)
                            FROM public.ports WHERE id = r.target_id)
        WHEN 'vessel' THEN (SELECT jsonb_build_object('label', v.name, 'slug', v.slug, 'company', c.name, 'status', v.status)
                              FROM public.vessels v LEFT JOIN public.companies c ON c.id = v.company_id
                             WHERE v.id = r.target_id)
        WHEN 'company' THEN (SELECT jsonb_build_object('label', name, 'slug', slug, 'status', status)
                               FROM public.companies WHERE id = r.target_id)
        ELSE NULL END
    ) AS item, r.created_at
    FROM public.reports r
    WHERE p_status IS NULL OR r.status::text = p_status
    ORDER BY r.created_at DESC
    LIMIT 200
  ) rows;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_reports_staff(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_reports_staff(text) TO authenticated;

-- Profil public : fiches corrigées et badge « Vigie » (palier le plus haut).
CREATE OR REPLACE FUNCTION public.bw_public_profile(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public.bw_traveller_profiles; uid uuid;
  alerts integer; confirmed integer; confirmations integer; reviews integer; trips integer;
  fav_vessel text; fav_vessel_n integer; fav_port text; fav_port_n integer; since integer;
  badges jsonb := '[]'::jsonb; thanks integer; fixes integer; vigie jsonb;
BEGIN
  SELECT * INTO p FROM public.bw_traveller_profiles WHERE handle = p_handle;
  IF NOT FOUND THEN RETURN NULL; END IF;
  uid := p.user_id;
  SELECT count(*) INTO alerts FROM public.bw_travel_alerts WHERE user_id = uid;
  SELECT count(*) INTO confirmed FROM public.bw_travel_alerts a
   WHERE a.user_id = uid AND EXISTS (SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id = a.id);
  SELECT count(*) INTO confirmations FROM public.bw_alert_confirmations WHERE user_id = uid;
  SELECT count(*) INTO reviews FROM (
    SELECT 'port' AS kind,port_id AS target FROM public.port_reviews WHERE user_id=uid AND status='published'
    UNION SELECT 'vessel',vessel_id FROM public.bw_vessel_reviews WHERE user_id=uid AND status='published'
    UNION SELECT target_kind,target_id FROM public.bw_entity_reviews WHERE user_id=uid AND published_scores IS NOT NULL
  ) reviewed;

  SELECT count(*) INTO trips FROM public.bw_follows f JOIN public.departures d ON d.id = f.target_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller AND d.departure_at < now();
  SELECT v.name, count(*) INTO fav_vessel, fav_vessel_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.vessels v ON v.id = d.vessel_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY v.name ORDER BY count(*) DESC, v.name LIMIT 1;
  SELECT po.name, count(*) INTO fav_port, fav_port_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.routes r ON r.id = d.route_id
    JOIN public.ports po ON po.id = r.departure_port_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY po.name ORDER BY count(*) DESC, po.name LIMIT 1;
  -- « Merci » reçus sur ses signalements et ses avis (hors les siens).
  SELECT count(*) INTO thanks FROM public.bw_reactions x
   WHERE x.code = 'merci' AND x.user_id <> uid AND (
         (x.target_kind = 'alert' AND EXISTS (SELECT 1 FROM public.bw_travel_alerts a WHERE a.id = x.target_id AND a.user_id = uid))
      OR (x.target_kind = 'port_review' AND EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = x.target_id AND r.user_id = uid))
      OR (x.target_kind = 'vessel_review' AND EXISTS (SELECT 1 FROM public.bw_vessel_reviews r WHERE r.id = x.target_id AND r.user_id = uid)));
  SELECT extract(year FROM created_at)::integer INTO since FROM auth.users WHERE id = uid;
  fixes := private.bw_report_fixes(uid);
  vigie := private.bw_vigie(fixes);
  IF vigie IS NOT NULL THEN
    badges := badges || jsonb_build_object('code', vigie ->> 'code', 'label',
      (vigie -> 'label' ->> 'fr') || ' · ' || fixes || CASE WHEN fixes > 1 THEN ' fiches corrigées' ELSE ' fiche corrigée' END);
  END IF;
  IF alerts >= 1 THEN badges := badges || '{"code":"premier_signalement","label":"Premier signalement"}'; END IF;
  IF confirmed >= 10 THEN badges := badges || '{"code":"oeil_de_lynx","label":"10 infos confirmées"}'; END IF;
  IF confirmations >= 10 THEN badges := badges || '{"code":"entraide","label":"Toujours là pour confirmer"}'; END IF;
  IF thanks >= 25 THEN badges := badges || '{"code":"merci","label":"25 mercis reçus"}'; END IF;
  IF reviews >= 1 THEN badges := badges || '{"code":"plume","label":"A donné son avis"}'; END IF;
  IF trips >= 5 THEN badges := badges || '{"code":"habitue","label":"5 traversées"}'; END IF;
  IF fav_vessel_n >= 3 THEN badges := badges || jsonb_build_object('code', 'fidele', 'label', 'Fidèle du ' || fav_vessel); END IF;
  IF fav_port_n >= 3 THEN badges := badges || jsonb_build_object('code', 'port', 'label', 'Habitué·e de ' || fav_port); END IF;
  RETURN private.bw_traveller_card(p) || jsonb_build_object(
    'since', since, 'contributions', alerts + reviews, 'confirmed', confirmed,
    'confirmations', confirmations, 'reviews', reviews, 'thanks', thanks, 'trips', trips,
    'fixes', fixes, 'favorite_vessel', fav_vessel, 'favorite_port', fav_port, 'badges', badges,
    'me', uid = auth.uid());
END $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
