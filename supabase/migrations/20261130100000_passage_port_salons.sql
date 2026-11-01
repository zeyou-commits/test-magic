-- BledWay · Le passage du port : le voyage continue après l'arrivée, jusqu'à la sortie du port.
-- Salons courts : tout le monde lit, seuls les passagers et les personnes sur le port écrivent.
-- L'identifiant d'un compte n'est jamais public : auteurs lus par la carte voyageur, tables fermées.

-- 1. Deux étapes de plus : « arrived » devient la sortie du port.
ALTER TABLE public.bw_trip_status DROP CONSTRAINT IF EXISTS bw_trip_status_status_check;
ALTER TABLE public.bw_trip_status ADD CONSTRAINT bw_trip_status_status_check
  CHECK (status = ANY (ARRAY['en_route','port','onboard','landing','controls','arrived']));
ALTER TABLE public.bw_trip_steps DROP CONSTRAINT IF EXISTS bw_trip_steps_code_check;
ALTER TABLE public.bw_trip_steps ADD CONSTRAINT bw_trip_steps_code_check
  CHECK (code = ANY (ARRAY['en_route','port','onboard','landing','controls','arrived']));
INSERT INTO public.bw_trip_steps(code, label, short_label, image, sort) VALUES
  ('landing', 'Débarquement', 'Débarquement', '/cabas/humeurs/27_debarquement.webp', 32),
  ('controls', 'Police et douane', 'Contrôles', '/cabas/humeurs/14_controle.webp', 36)
ON CONFLICT (code) DO NOTHING;
UPDATE public.bw_trip_steps SET label = 'Sorti du port', short_label = 'Sorti'
 WHERE code = 'arrived' AND label = 'Arrivé' AND short_label = 'Arrivé';

CREATE OR REPLACE FUNCTION public.bw_set_trip_status(p_departure uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE d public.departures;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  SELECT * INTO d FROM public.departures WHERE id = p_departure;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traversée introuvable'; END IF;
  IF p_status IS NULL THEN
    DELETE FROM public.bw_trip_status WHERE user_id = auth.uid() AND departure_id = p_departure;
    RETURN;
  END IF;
  IF p_status NOT IN ('en_route','port','onboard','landing','controls','arrived') THEN RAISE EXCEPTION 'Statut inconnu'; END IF;
  IF d.departure_at < now() - interval '3 days' OR d.departure_at > now() + interval '36 hours' THEN
    RAISE EXCEPTION 'Le statut s’active la veille de la traversée';
  END IF;
  INSERT INTO public.bw_trip_status(user_id, departure_id, status) VALUES (auth.uid(), p_departure, p_status)
  ON CONFLICT (user_id, departure_id) DO UPDATE SET status = excluded.status, updated_at = now();
END $$;

DROP FUNCTION IF EXISTS public.bw_trip_presence();
CREATE FUNCTION public.bw_trip_presence()
RETURNS TABLE(departure_id uuid, vessel_id uuid, departure_port_id uuid, arrival_port_id uuid,
              en_route integer, at_port integer, onboard integer, landing integer, controls integer, arrived integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT d.id, d.vessel_id, r.departure_port_id, r.arrival_port_id,
         count(*) FILTER (WHERE s.status = 'en_route')::integer,
         count(*) FILTER (WHERE s.status = 'port')::integer,
         count(*) FILTER (WHERE s.status = 'onboard')::integer,
         count(*) FILTER (WHERE s.status = 'landing')::integer,
         count(*) FILTER (WHERE s.status = 'controls')::integer,
         count(*) FILTER (WHERE s.status = 'arrived')::integer
  FROM public.bw_trip_status s
  JOIN public.departures d ON d.id = s.departure_id
  JOIN public.routes r ON r.id = d.route_id
  WHERE s.updated_at > now() - interval '24 hours'
    AND d.departure_at BETWEEN now() - interval '3 days' AND now() + interval '36 hours'
  GROUP BY d.id, d.vessel_id, r.departure_port_id, r.arrival_port_id;
$$;
REVOKE ALL ON FUNCTION public.bw_trip_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_trip_presence() TO anon, authenticated;

-- 2. Depuis quand le navire est à quai : premier arrêt observé près du port d'arrivée.
CREATE OR REPLACE FUNCTION public.bw_docked_since(p_departure uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT min(o.reported_at)
  FROM public.departures d
  JOIN public.vessels v ON v.id = d.vessel_id
  JOIN public.routes r ON r.id = d.route_id
  JOIN public.ports p ON p.id = r.arrival_port_id
  JOIN public.vessel_position_observations o ON o.mmsi = v.mmsi
  WHERE d.id = p_departure
    AND o.reported_at >= d.departure_at
    AND o.speed_knots < 1.5
    AND private.bw_km(o.latitude, o.longitude, p.latitude, p.longitude) < 6;
$$;
REVOKE ALL ON FUNCTION public.bw_docked_since(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_docked_since(uuid) TO anon, authenticated;

-- 3. Salons.
CREATE TABLE IF NOT EXISTS public.bw_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_kind text NOT NULL CHECK (room_kind IN ('crossing', 'port')),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  place text NOT NULL CHECK (place IN ('aboard', 'port', 'trip')),
  hidden_at timestamptz,
  hidden_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_chat_messages_room ON public.bw_chat_messages(room_kind, room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_chat_messages_review ON public.bw_chat_messages(created_at) WHERE reviewed_at IS NULL;
CREATE TABLE IF NOT EXISTS public.bw_chat_reactions (
  message_id uuid NOT NULL REFERENCES public.bw_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.bw_chat_reports (
  message_id uuid NOT NULL REFERENCES public.bw_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.bw_chat_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_chat_strikes_user ON public.bw_chat_strikes(user_id, created_at DESC);
-- Mots refusés : liste modifiable, à enrichir avec le vocabulaire réel.
CREATE TABLE IF NOT EXISTS public.bw_chat_words (word text PRIMARY KEY CHECK (word = lower(word)));
INSERT INTO public.bw_chat_words(word) VALUES
  ('connard'),('connasse'),('salope'),('encule'),('enculé'),('pute'),('putain'),('nique'),('ntm'),('fdp'),
  ('batard'),('bâtard'),('pd'),('kahba'),('qahba'),('zebi'),('zeb'),('nik'),('nikmok'),('hmar'),('tahan')
ON CONFLICT DO NOTHING;

ALTER TABLE public.bw_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_chat_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_chat_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bw_chat_words_staff ON public.bw_chat_words;
CREATE POLICY bw_chat_words_staff ON public.bw_chat_words FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
REVOKE ALL ON public.bw_chat_messages, public.bw_chat_reactions, public.bw_chat_reports, public.bw_chat_strikes FROM anon, authenticated;
REVOKE ALL ON public.bw_chat_words FROM anon;
GRANT SELECT, INSERT, DELETE ON public.bw_chat_words TO authenticated;
GRANT ALL ON public.bw_chat_messages, public.bw_chat_strikes TO service_role;

-- Règles appliquées avant publication. Renvoie le motif du refus, ou null.
CREATE OR REPLACE FUNCTION private.bw_chat_refusal(p_body text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE clean text := lower(p_body);
BEGIN
  IF clean ~ '(https?://|www\.|\m[a-z0-9-]+\.(com|fr|net|org|dz|es|info|me|ly|io)\M)' THEN RETURN 'link'; END IF;
  IF clean ~ '[a-z0-9._-]+@[a-z0-9-]+\.[a-z]' THEN RETURN 'email'; END IF;
  IF regexp_replace(clean, '[^0-9]', '', 'g') ~ '[0-9]{8,}' AND clean ~ '[0-9][0-9 .()+-]{7,}[0-9]' THEN RETURN 'phone'; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_words w WHERE clean ~ ('\m' || w.word || '\M')) THEN RETURN 'word'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_chat_refusal(text) FROM PUBLIC, anon, authenticated;

-- Qui peut écrire dans une traversée, et pendant quelle période.
CREATE OR REPLACE FUNCTION private.bw_chat_crossing_place(p_departure uuid, p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE d public.departures; step text; member boolean; stopped timestamptz;
BEGIN
  SELECT * INTO d FROM public.departures WHERE id = p_departure;
  IF NOT FOUND OR p_user IS NULL THEN RETURN NULL; END IF;
  -- Fermé 8 h après l'arrêt constaté ; sans arrêt connu, 12 h après l'heure prévue, pour couvrir un retard.
  stopped := coalesce(d.reported_arrived_at, d.web_arrived_at, public.bw_docked_since(p_departure));
  IF now() < d.departure_at - interval '24 hours'
     OR (stopped IS NOT NULL AND now() > stopped + interval '8 hours')
     OR (stopped IS NULL AND now() > coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '12 hours') THEN
    RETURN NULL;
  END IF;
  SELECT s.status INTO step FROM public.bw_trip_status s WHERE s.user_id = p_user AND s.departure_id = p_departure;
  SELECT EXISTS (SELECT 1 FROM public.bw_follows f WHERE f.user_id = p_user AND f.target_kind = 'departure'
                 AND f.target_id = p_departure AND f.active AND f.traveller) INTO member;
  -- Sorti du port : la personne lit encore, mais n'écrit plus.
  IF step = 'arrived' OR (step IS NULL AND NOT member) THEN RETURN NULL; END IF;
  RETURN CASE WHEN step = 'onboard' THEN 'aboard' WHEN step IN ('port', 'landing', 'controls') THEN 'port' ELSE 'trip' END;
END $$;
REVOKE ALL ON FUNCTION private.bw_chat_crossing_place(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.bw_chat_near_port(p_port uuid, p_lat double precision, p_lon double precision)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT p_lat IS NOT NULL AND p_lon IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ports p WHERE p.id = p_port AND private.bw_km(p_lat, p_lon, p.latitude, p.longitude) < 6);
$$;
REVOKE ALL ON FUNCTION private.bw_chat_near_port(uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;

-- Écrire : renvoie { ok, id } ou { ok: false, refused: motif }. Un refus n'écrit jamais le message.
CREATE OR REPLACE FUNCTION public.bw_chat_post(p_kind text, p_room uuid, p_body text,
  p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        my_place text; refusal text; new_id uuid;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
  IF (SELECT count(*) FROM public.bw_chat_strikes s WHERE s.user_id = me AND s.created_at > now() - interval '24 hours') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'muted');
  END IF;
  IF p_kind = 'crossing' THEN
    my_place := private.bw_chat_crossing_place(p_room, me);
    IF my_place IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'not_member'); END IF;
  ELSIF p_kind = 'port' THEN
    IF NOT private.bw_chat_near_port(p_room, p_lat, p_lon) THEN RETURN jsonb_build_object('ok', false, 'refused', 'not_here'); END IF;
    my_place := 'port';
  ELSE
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  IF (SELECT count(*) FROM public.bw_chat_messages m WHERE m.user_id = me AND m.created_at > now() - interval '1 minute') >= 5
     OR EXISTS (SELECT 1 FROM public.bw_chat_messages m WHERE m.user_id = me AND lower(m.body) = lower(clean_body)
                AND m.created_at > now() - interval '10 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'rate');
  END IF;
  refusal := private.bw_chat_refusal(clean_body);
  IF refusal IS NOT NULL THEN
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (me, refusal);
    RETURN jsonb_build_object('ok', false, 'refused', refusal);
  END IF;
  INSERT INTO public.bw_chat_messages(room_kind, room_id, user_id, body, place)
  VALUES (p_kind, p_room, me, clean_body, my_place) RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $$;

-- Lire : ouvert à tous. Traversée : 7 jours ; port : 24 h.
CREATE OR REPLACE FUNCTION public.bw_chat_feed(p_kind text, p_room uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); access text := 'read'; items jsonb;
BEGIN
  IF p_kind = 'crossing' AND private.bw_chat_crossing_place(p_room, me) IS NOT NULL THEN access := 'member';
  ELSIF p_kind = 'port' AND me IS NOT NULL THEN access := 'position';
  END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT m.created_at, jsonb_build_object(
      'id', m.id, 'body', m.body, 'place', m.place, 'created_at', m.created_at,
      'me', m.user_id = me,
      'author', private.bw_traveller_card(private.bw_ensure_traveller(m.user_id)),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = m.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = m.id AND r.user_id = me)
    ) AS item
    FROM public.bw_chat_messages m
    WHERE m.room_kind = p_kind AND m.room_id = p_room AND m.hidden_at IS NULL
      AND m.created_at > now() - CASE WHEN p_kind = 'port' THEN interval '24 hours' ELSE interval '7 days' END
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'messages', items);
END $$;

-- « Pareil ici » : seulement pour qui peut écrire dans ce salon.
CREATE OR REPLACE FUNCTION public.bw_chat_react(p_message uuid, p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); msg public.bw_chat_messages;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  SELECT * INTO msg FROM public.bw_chat_messages m WHERE m.id = p_message AND m.hidden_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF msg.room_kind = 'crossing' AND private.bw_chat_crossing_place(msg.room_id, me) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'not_member');
  END IF;
  IF msg.room_kind = 'port' AND NOT private.bw_chat_near_port(msg.room_id, p_lat, p_lon) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'not_here');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = p_message AND r.user_id = me) THEN
    DELETE FROM public.bw_chat_reactions r WHERE r.message_id = p_message AND r.user_id = me;
  ELSE
    INSERT INTO public.bw_chat_reactions(message_id, user_id) VALUES (p_message, me);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Signaler : masqué à 3 personnes différentes, en attendant une vérification.
CREATE OR REPLACE FUNCTION public.bw_chat_report(p_message uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); author uuid; total integer;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  SELECT m.user_id INTO author FROM public.bw_chat_messages m WHERE m.id = p_message AND m.hidden_at IS NULL;
  IF author IS NULL OR author = me THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  INSERT INTO public.bw_chat_reports(message_id, user_id) VALUES (p_message, me) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO total FROM public.bw_chat_reports r WHERE r.message_id = p_message;
  IF total >= 3 THEN
    UPDATE public.bw_chat_messages SET hidden_at = now(), hidden_reason = 'Signalements' WHERE id = p_message AND hidden_at IS NULL;
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (author, 'reports');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Équipe : ce qui a été masqué, et de quoi le rétablir ou masquer à la main.
CREATE OR REPLACE FUNCTION public.bw_chat_moderation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin','editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT m.created_at, jsonb_build_object('id', m.id, 'body', m.body, 'room_kind', m.room_kind, 'room_id', m.room_id,
      'created_at', m.created_at, 'hidden_at', m.hidden_at, 'hidden_reason', m.hidden_reason,
      'reports', (SELECT count(*) FROM public.bw_chat_reports r WHERE r.message_id = m.id),
      'author', private.bw_traveller_card(private.bw_ensure_traveller(m.user_id))) AS item
    FROM public.bw_chat_messages m
    WHERE m.created_at > now() - interval '30 days'
      AND (m.hidden_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.bw_chat_reports r WHERE r.message_id = m.id))
    ORDER BY m.created_at DESC LIMIT 100) x);
END $$;

CREATE OR REPLACE FUNCTION public.bw_chat_set_hidden(p_message uuid, p_hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin','editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  UPDATE public.bw_chat_messages
     SET hidden_at = CASE WHEN p_hidden THEN now() END,
         hidden_reason = CASE WHEN p_hidden THEN 'Équipe' END,
         reviewed_at = now()
   WHERE id = p_message;
  IF NOT p_hidden THEN DELETE FROM public.bw_chat_reports r WHERE r.message_id = p_message; END IF;
END $$;

REVOKE ALL ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision),
  public.bw_chat_feed(text, uuid),
  public.bw_chat_react(uuid, double precision, double precision),
  public.bw_chat_report(uuid), public.bw_chat_moderation(), public.bw_chat_set_hidden(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_feed(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision),
  public.bw_chat_react(uuid, double precision, double precision),
  public.bw_chat_report(uuid), public.bw_chat_moderation(), public.bw_chat_set_hidden(uuid, boolean) TO authenticated;

-- Les messages ne sont pas conservés au-delà de 30 jours.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bledway-salons-purge';
SELECT cron.schedule('bledway-salons-purge', '43 4 * * *', $job$
  DELETE FROM public.bw_chat_messages WHERE created_at < now() - interval '30 days';
  DELETE FROM public.bw_chat_strikes WHERE created_at < now() - interval '30 days';
$job$);

NOTIFY pgrst, 'reload schema';
