-- Routes du bled : chaque voyageur retrouve ses propres haltes proposées (en attente, publiées, refusées)
-- dans son carnet, et peut en proposer jusqu'au Grand Sud (Tindouf est à 27,7° N).
-- Script rejouable : n'ajoute qu'une fonction et élargit une contrainte de latitude.
BEGIN;

-- Le Grand Sud algérien descend jusqu'à 19° N : l'ancienne borne (30° N) refusait tout au sud de Béchar.
ALTER TABLE public.bw_route_stops DROP CONSTRAINT IF EXISTS bw_route_stops_lat_check;
ALTER TABLE public.bw_route_stops
  ADD CONSTRAINT bw_route_stops_lat_check CHECK (lat BETWEEN 18 AND 52);

-- Mes haltes : celles en attente, et celles décidées depuis moins de 60 jours.
CREATE OR REPLACE FUNCTION public.bw_route_stops_mine()
RETURNS TABLE (id uuid, route_code text, kind text, name text, place text, lat double precision,
               lon double precision, features text[], status text, decision_note text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.route_code, s.kind, s.name, s.place, s.lat, s.lon, s.features, s.status, s.decision_note, s.created_at
  FROM public.bw_route_stops s
  WHERE s.user_id = auth.uid()
    AND (s.status = 'pending' OR s.created_at > now() - interval '60 days')
  ORDER BY s.created_at DESC
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.bw_route_stops_mine() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_route_stops_mine() TO authenticated;

COMMIT;

-- Contrôle :
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'bw_route_stops_lat_check';
-- SELECT to_regprocedure('public.bw_route_stops_mine()') IS NOT NULL AS mine_ok;
