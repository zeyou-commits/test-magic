-- BledWay · « Erreurs signalées » lisibles par l'équipe (26/11/2026).
-- Avant : la carte de l'admin disait seulement « Départ · Autre » et le message. Impossible de
-- savoir qui signalait, sur quelle traversée, ni ce qui avait été décidé.
-- Désormais :
--   • reports.context : ce que le voyageur avait sous les yeux en signalant (page, horaire et
--     navire affichés), enregistré par le formulaire ;
--   • reports.resolution_note : ce que l'équipe a fait (corrigé, déjà juste, test, doublon…) ;
--   • bw_reports_staff() : chaque signalement avec son auteur, la fiche visée telle qu'elle est
--     maintenant, les autres signalements sur la même fiche et qui l'a traité.
-- Réservé à l'équipe (admin, ou modérateur ayant la rubrique). L'adresse e-mail de l'auteur
-- n'est donnée qu'aux administrateurs. Le script peut être relancé.
BEGIN;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS context jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_context_size;
ALTER TABLE public.reports ADD CONSTRAINT reports_context_size
  CHECK (context IS NULL OR pg_column_size(context) < 4000);
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_resolution_note_size;
ALTER TABLE public.reports ADD CONSTRAINT reports_resolution_note_size
  CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500);

-- Qui a traité : rempli automatiquement quand le statut change.
CREATE OR REPLACE FUNCTION private.bw_reports_handled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved', 'rejected', 'in_progress') THEN
    NEW.handled_by := coalesce(auth.uid(), NEW.handled_by);
    NEW.handled_at := coalesce(NEW.handled_at, now());
  END IF;
  IF NEW.status = 'new' THEN
    NEW.handled_by := NULL;
    NEW.handled_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_reports_handled ON public.reports;
CREATE TRIGGER bw_reports_handled BEFORE UPDATE OF status ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.bw_reports_handled();

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

NOTIFY pgrst, 'reload schema';
COMMIT;
