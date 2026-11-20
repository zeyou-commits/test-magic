-- Routes du bled : haltes proposées par les voyageurs, publiées après vérification par l'équipe.
-- Page /routes-du-bled. Script rejouable : il ne touche à aucune table existante.
BEGIN;

DO $check$
BEGIN
  IF to_regprocedure('private.bw_account_active()') IS NULL
     OR to_regprocedure('private.bw_staff_permission(text[])') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord les scripts « comptes » et « flash info » : fonctions de droits absentes.';
  END IF;
END
$check$;

CREATE TABLE IF NOT EXISTS public.bw_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  route_code text NOT NULL CHECK (route_code ~ '^[EA][0-9]{1,2}$'),
  kind text NOT NULL CHECK (kind IN ('carburant', 'aire', 'manger', 'priere', 'dormir', 'garage', 'billets', 'autre')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  place text NOT NULL CHECK (char_length(btrim(place)) BETWEEN 2 AND 120),
  lat double precision CHECK (lat BETWEEN 30 AND 52),
  lon double precision CHECK (lon BETWEEN -10 AND 12),
  features text[] NOT NULL DEFAULT '{}' CHECK (features <@ ARRAY[
    'h24', 'manger', 'halal', 'priere', 'ablutions', 'dormir', 'parking', 'parking_sur',
    'parking_pl', 'douches', 'toilettes', 'billets', 'garage', 'dab', 'cafe']::text[]),
  direction text NOT NULL DEFAULT 'both' CHECK (direction IN ('aller', 'retour', 'both')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lon IS NULL)),
  -- Une halte publiée a toujours une position.
  CHECK (status <> 'approved' OR lat IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS bw_route_stops_status ON public.bw_route_stops(status, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_route_stops_user ON public.bw_route_stops(user_id, created_at DESC);

-- Aucun accès direct : lecture et écriture passent par les fonctions ci-dessous.
ALTER TABLE public.bw_route_stops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_route_stops FROM anon, authenticated;

-- Lecture publique : seulement les haltes validées, sans l'auteur.
CREATE OR REPLACE FUNCTION public.bw_route_stops_public()
RETURNS TABLE (id uuid, route_code text, kind text, name text, place text, lat double precision, lon double precision,
               features text[], direction text, note text, decided_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.route_code, s.kind, s.name, s.place, s.lat, s.lon, s.features, s.direction, s.note, s.decided_at
  FROM public.bw_route_stops s
  WHERE s.status = 'approved'
  ORDER BY s.route_code, s.decided_at DESC
$$;
REVOKE ALL ON FUNCTION public.bw_route_stops_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_route_stops_public() TO anon, authenticated;

-- Proposer une halte : compte actif, 10 propositions par jour au plus.
CREATE OR REPLACE FUNCTION public.bw_route_stop_submit(
  p_route text, p_kind text, p_name text, p_place text,
  p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL,
  p_features text[] DEFAULT '{}', p_direction text DEFAULT 'both', p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); new_id uuid;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RAISE EXCEPTION 'Connecte-toi pour proposer une halte.'; END IF;
  IF (SELECT count(*) FROM public.bw_route_stops WHERE user_id = me AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'Patiente un peu : 10 haltes au plus par jour.';
  END IF;
  INSERT INTO public.bw_route_stops(user_id, route_code, kind, name, place, lat, lon, features, direction, note)
  VALUES (me, p_route, p_kind, btrim(p_name), btrim(p_place), p_lat, p_lon,
          COALESCE(p_features, '{}'), COALESCE(p_direction, 'both'), NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.bw_route_stop_submit(text, text, text, text, double precision, double precision, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_route_stop_submit(text, text, text, text, double precision, double precision, text[], text, text) TO authenticated;

-- Équipe : la liste à relire, avec le pseudo de l'auteur.
CREATE OR REPLACE FUNCTION public.bw_route_stops_admin(p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.bw_route_stops_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_route_stops_admin(text) TO authenticated;

-- Équipe : publier (position obligatoire, corrigeable) ou refuser.
CREATE OR REPLACE FUNCTION public.bw_route_stop_decide(
  p_id uuid, p_decision text, p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL,
  p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.bw_route_stops%ROWTYPE;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.bw_route_stop_decide(uuid, text, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_route_stop_decide(uuid, text, double precision, double precision, text) TO authenticated;

COMMIT;
