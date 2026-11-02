-- BledWay · Salon : répondre à un message précis, comme dans un chat.
-- La réponse survit si le message cité est supprimé : elle perd seulement sa citation.

ALTER TABLE public.bw_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.bw_chat_messages(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.bw_chat_post(text, uuid, text, double precision, double precision, uuid);
CREATE FUNCTION public.bw_chat_post(p_kind text, p_room uuid, p_body text,
  p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL, p_parent uuid DEFAULT NULL,
  p_reply_to uuid DEFAULT NULL)
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
  -- On ne cite que ce que l'on voit : le même salon, ou une traversée de ce port.
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bw_chat_messages m
     WHERE m.id = p_reply_to AND m.hidden_at IS NULL
       AND ((m.room_kind = p_kind AND m.room_id = p_room)
         OR (p_kind = 'port' AND m.room_kind = 'crossing' AND EXISTS (
              SELECT 1 FROM public.departures d JOIN public.routes r ON r.id = d.route_id
               WHERE d.id = m.room_id AND p_room IN (r.departure_port_id, r.arrival_port_id))))
  ) THEN
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
  INSERT INTO public.bw_chat_messages(room_kind, room_id, user_id, body, place, parent_id, reply_to_id)
  VALUES (p_kind, p_room, me, clean_body, my_place, p_parent, p_reply_to) RETURNING id INTO new_id;
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
REVOKE ALL ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid, uuid) TO authenticated;

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
      'me', m.user_id = me, 'edited', m.edited_at IS NOT NULL,
      'crossing', (SELECT a.name || ' → ' || b.name
                     FROM public.departures d
                     JOIN public.routes r ON r.id = d.route_id
                     JOIN public.ports a ON a.id = r.departure_port_id
                     JOIN public.ports b ON b.id = r.arrival_port_id
                    WHERE p_kind = 'port' AND m.room_kind = 'crossing' AND d.id = m.room_id),
      -- Un message masqué n'est plus cité.
      'reply_to', (SELECT jsonb_build_object('id', q.id, 'body', q.body, 'me', q.user_id = me,
                          'pseudo', private.bw_traveller_card(private.bw_ensure_traveller(q.user_id))->>'pseudo')
                     FROM public.bw_chat_messages q WHERE q.id = m.reply_to_id AND q.hidden_at IS NULL),
      'author', private.bw_traveller_card(private.bw_ensure_traveller(m.user_id)),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = m.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = m.id AND r.user_id = me)
    ) AS item
    FROM public.bw_chat_messages m
    WHERE m.hidden_at IS NULL AND coalesce(visible, false)
      AND (
        (p_kind = 'crossing' AND m.room_kind = 'crossing' AND m.room_id = p_room)
        OR (p_kind = 'port' AND m.created_at > now() - interval '24 hours' AND (
          (m.room_kind = 'port' AND m.room_id = p_room)
          OR (m.room_kind = 'crossing' AND EXISTS (
            SELECT 1 FROM public.departures d JOIN public.routes r ON r.id = d.route_id
             WHERE d.id = m.room_id AND p_room IN (r.departure_port_id, r.arrival_port_id)))
        ))
      )
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'messages', items);
END $$;

NOTIFY pgrst, 'reload schema';
