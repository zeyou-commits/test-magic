-- BledWay · Écrire avant le voyage : les passagers dès qu'une traversée existe,
-- et un espace Questions par ligne, ouvert à tout compte connecté, avec réponses et notification.

-- 1. Le salon de traversée s'ouvre à ses passagers dès que la traversée existe.
CREATE OR REPLACE FUNCTION private.bw_chat_crossing_place(p_departure uuid, p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE d public.departures; step text; member boolean; stopped timestamptz;
BEGIN
  SELECT * INTO d FROM public.departures WHERE id = p_departure;
  IF NOT FOUND OR p_user IS NULL THEN RETURN NULL; END IF;
  -- Fermé 8 h après l'arrêt constaté ; sans arrêt connu, 12 h après l'heure prévue, pour couvrir un retard.
  stopped := coalesce(d.reported_arrived_at, d.web_arrived_at, public.bw_docked_since(p_departure));
  IF (stopped IS NOT NULL AND now() > stopped + interval '8 hours')
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

-- 2. Des messages de ligne, et des réponses rattachées à une question.
ALTER TABLE public.bw_chat_messages DROP CONSTRAINT IF EXISTS bw_chat_messages_room_kind_check;
ALTER TABLE public.bw_chat_messages ADD CONSTRAINT bw_chat_messages_room_kind_check
  CHECK (room_kind IN ('crossing', 'port', 'route'));
ALTER TABLE public.bw_chat_messages DROP CONSTRAINT IF EXISTS bw_chat_messages_place_check;
ALTER TABLE public.bw_chat_messages ADD CONSTRAINT bw_chat_messages_place_check
  CHECK (place IN ('aboard', 'port', 'trip', 'done', 'asker'));
ALTER TABLE public.bw_chat_messages
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.bw_chat_messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS bw_chat_messages_parent ON public.bw_chat_messages(parent_id) WHERE parent_id IS NOT NULL;

-- A voyagé sur cette ligne, dans un sens ou dans l'autre, d'après ses propres traversées passées.
CREATE OR REPLACE FUNCTION private.bw_chat_route_place(p_route uuid, p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM public.routes me
    JOIN public.routes r ON (r.id = me.id
      OR (r.departure_port_id = me.arrival_port_id AND r.arrival_port_id = me.departure_port_id))
    JOIN public.departures d ON d.route_id = r.id
    WHERE me.id = p_route
      AND d.status <> 'cancelled'
      AND coalesce(d.arrival_at, d.departure_at) < now()
      AND (EXISTS (SELECT 1 FROM public.bw_follows f WHERE f.user_id = p_user AND f.target_kind = 'departure'
                   AND f.target_id = d.id AND f.traveller)
           OR EXISTS (SELECT 1 FROM public.bw_trip_status s WHERE s.user_id = p_user AND s.departure_id = d.id))
  ) THEN 'done' ELSE 'asker' END;
$$;
REVOKE ALL ON FUNCTION private.bw_chat_route_place(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Écrire : salon, question de ligne, ou réponse à une question.
DROP FUNCTION IF EXISTS public.bw_chat_post(text, uuid, text, double precision, double precision);
CREATE FUNCTION public.bw_chat_post(p_kind text, p_room uuid, p_body text,
  p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL, p_parent uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        my_place text; refusal text; new_id uuid; asked public.bw_chat_messages;
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
  ELSIF p_kind = 'route' THEN
    IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = p_room) THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
    my_place := private.bw_chat_route_place(p_room, me);
  ELSE
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  IF p_parent IS NOT NULL THEN
    SELECT * INTO asked FROM public.bw_chat_messages m
     WHERE m.id = p_parent AND m.room_kind = 'route' AND m.room_id = p_room AND m.parent_id IS NULL AND m.hidden_at IS NULL;
    IF NOT FOUND OR p_kind <> 'route' THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
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
  INSERT INTO public.bw_chat_messages(room_kind, room_id, user_id, body, place, parent_id)
  VALUES (p_kind, p_room, me, clean_body, my_place, p_parent) RETURNING id INTO new_id;
  -- Prévenir l'auteur de la question : une seule notification par question, remise à non lue.
  IF p_parent IS NOT NULL AND asked.user_id <> me
     AND coalesce((SELECT n.community FROM public.bw_notification_preferences n WHERE n.user_id = asked.user_id), true) THEN
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
    VALUES (asked.user_id, 'question-reply:' || p_parent, 'On a répondu à votre question', asked.body,
            '/?select=route&id=' || p_room)
    ON CONFLICT (user_id, event_key) DO UPDATE SET read_at = NULL, created_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $$;

-- Lire. Traversée : du premier message jusqu'à 7 jours après l'arrivée ; port : 24 h.
CREATE OR REPLACE FUNCTION public.bw_chat_feed(p_kind text, p_room uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); access text := 'read'; items jsonb; visible boolean := true;
BEGIN
  IF p_kind = 'crossing' AND private.bw_chat_crossing_place(p_room, me) IS NOT NULL THEN access := 'member';
  ELSIF p_kind = 'port' AND me IS NOT NULL THEN access := 'position';
  END IF;
  IF p_kind = 'crossing' THEN
    SELECT now() < coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '7 days' INTO visible
      FROM public.departures d WHERE d.id = p_room;
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
    WHERE m.room_kind = p_kind AND m.room_id = p_room AND m.hidden_at IS NULL AND coalesce(visible, false)
      AND (p_kind <> 'port' OR m.created_at > now() - interval '24 hours')
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'messages', items);
END $$;

-- 3. Les questions d'une ligne : visibles 30 jours, avec leurs réponses.
CREATE OR REPLACE FUNCTION public.bw_chat_questions(p_route uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT q.created_at, jsonb_build_object(
      'id', q.id, 'body', q.body, 'place', q.place, 'created_at', q.created_at, 'me', q.user_id = me,
      'author', private.bw_traveller_card(private.bw_ensure_traveller(q.user_id)),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = q.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = q.id AND r.user_id = me),
      'replies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'body', a.body, 'place', a.place, 'created_at', a.created_at, 'me', a.user_id = me,
          'author', private.bw_traveller_card(private.bw_ensure_traveller(a.user_id)),
          'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = a.id),
          'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = a.id AND r.user_id = me)
        ) ORDER BY a.created_at), '[]'::jsonb)
        FROM public.bw_chat_messages a WHERE a.parent_id = q.id AND a.hidden_at IS NULL)
    ) AS item
    FROM public.bw_chat_messages q
    WHERE q.room_kind = 'route' AND q.room_id = p_route AND q.parent_id IS NULL AND q.hidden_at IS NULL
      AND q.created_at > now() - interval '30 days'
    ORDER BY q.created_at DESC LIMIT 40
  ) x;
  RETURN jsonb_build_object('access', CASE WHEN me IS NOT NULL THEN 'member' ELSE 'read' END, 'questions', items);
END $$;

-- « Même question » : tout compte connecté sur une ligne.
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

REVOKE ALL ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid),
  public.bw_chat_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_chat_questions(uuid) TO anon, authenticated;

-- 4. Un message de traversée doit survivre jusqu'au voyage : il part 30 jours après l'arrivée.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bledway-salons-purge';
SELECT cron.schedule('bledway-salons-purge', '43 4 * * *', $job$
  DELETE FROM public.bw_chat_messages m
   WHERE (m.room_kind <> 'crossing' AND m.created_at < now() - interval '30 days')
      OR (m.room_kind = 'crossing' AND NOT EXISTS (
            SELECT 1 FROM public.departures d WHERE d.id = m.room_id
             AND coalesce(d.arrival_at, d.departure_at + interval '48 hours') > now() - interval '30 days'));
  DELETE FROM public.bw_chat_strikes WHERE created_at < now() - interval '30 days';
$job$);

NOTIFY pgrst, 'reload schema';
