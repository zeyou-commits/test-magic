-- BledWay · Espace compagnie : combien de personnes suivent les traversées à venir (22/11/2026).
-- Prérequis : lots 1 et 2 de l'espace compagnie (private.bw_company_access, staff_ok).
--
-- Des chiffres seulement : aucun nom, aucun compte, aucune adresse ne sort de la base.
-- Une personne qui suit plusieurs traversées n'est comptée qu'une fois dans le total.
-- Lecture seule, relançable ; aucune table créée, aucun droit élargi.

BEGIN;

CREATE OR REPLACE FUNCTION public.bw_company_audience(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (private.bw_company_access(_user, _company, 'read')
          OR private.bw_company_staff_ok(_user, ARRAY['admin', 'editor'])) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  RETURN (
    WITH dep AS (
      SELECT d.id
        FROM public.departures d
       WHERE d.company_id = _company
         AND d.departure_at > now()
         AND d.departure_at < now() + interval '90 days'
         AND d.status <> 'cancelled'
         AND NOT coalesce(d.is_demo, false)
    ), fol AS (
      SELECT f.target_id AS departure_id, f.user_id, f.traveller
        FROM public.bw_follows f
        JOIN dep ON dep.id = f.target_id
       WHERE f.active AND f.target_kind = 'departure'
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(DISTINCT user_id) FROM fol),
      'travellers', (SELECT count(DISTINCT user_id) FROM fol WHERE traveller),
      'departures', (SELECT count(*) FROM dep),
      'byDeparture', coalesce((
        SELECT jsonb_object_agg(departure_id, n)
          FROM (SELECT departure_id, count(DISTINCT user_id) AS n FROM fol GROUP BY departure_id) x
      ), '{}'::jsonb)
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.bw_company_audience(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_company_audience(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
