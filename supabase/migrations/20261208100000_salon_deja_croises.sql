-- BledWay · Les voyageurs déjà croisés : deux personnes déclarées sur une même traversée passée.
-- Visible seulement par la personne connectée, et jamais pour qui a choisi de ne pas apparaître.

CREATE OR REPLACE FUNCTION public.bw_chat_met(p_departure uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH trips AS (
    SELECT f.user_id, f.target_id AS departure_id FROM public.bw_follows f
     WHERE f.target_kind = 'departure' AND f.traveller
    UNION
    SELECT s.user_id, s.departure_id FROM public.bw_trip_status s
  ),
  mine AS (
    SELECT t.departure_id FROM trips t
      JOIN public.departures d ON d.id = t.departure_id
     WHERE t.user_id = auth.uid()
       AND d.status <> 'cancelled'
       AND coalesce(d.arrival_at, d.departure_at) < now()
  ),
  met AS (
    SELECT DISTINCT p.user_id, p.handle
      FROM trips t
      JOIN mine m ON m.departure_id = t.departure_id
      JOIN public.bw_traveller_profiles p ON p.user_id = t.user_id
     WHERE t.user_id <> auth.uid() AND p.show_on_trip
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM met),
    'here', (SELECT coalesce(jsonb_agg(met.handle), '[]'::jsonb) FROM met
              WHERE EXISTS (SELECT 1 FROM trips t WHERE t.user_id = met.user_id AND t.departure_id = p_departure))
  );
$$;
REVOKE ALL ON FUNCTION public.bw_chat_met(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_met(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
