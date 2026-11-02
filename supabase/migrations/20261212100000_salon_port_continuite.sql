-- BledWay · Salon du port : après un premier message écrit sur place, on peut continuer
-- la conversation pendant 24 h (la durée de vie des messages du port), même en s'éloignant.

CREATE OR REPLACE FUNCTION public.bw_chat_post(p_kind text, p_room uuid, p_body text, p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL, p_parent uuid DEFAULT NULL, p_reply_to uuid DEFAULT NULL,
  p_official boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        my_place text; refusal text; new_id uuid; asked public.bw_chat_messages;
        staff boolean := private.bw_chat_is_staff(); my_name text; quoted uuid; plain text; target uuid;
        notified uuid[] := ARRAY[]::uuid[];
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
  IF NOT private.bw_charter_ok(me) THEN RETURN jsonb_build_object('ok', false, 'refused', 'charter'); END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_bans b WHERE b.user_id = me AND b.until > now()) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'banned');
  END IF;
  IF (SELECT count(*) FROM public.bw_chat_strikes s WHERE s.user_id = me AND s.created_at > now() - interval '24 hours') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'muted');
  END IF;
  IF p_kind = 'crossing' THEN
    my_place := CASE WHEN staff THEN 'staff' ELSE private.bw_chat_crossing_place(p_room, me) END;
    IF my_place IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'not_member'); END IF;
  ELSIF p_kind = 'port' THEN
    -- Sur place pour le premier message ; ensuite, on continue la conversation pendant 24 h,
    -- la durée de vie des messages du port, même en s'éloignant.
    IF NOT staff AND NOT private.bw_chat_near_port(p_room, p_lat, p_lon) AND NOT EXISTS (
      SELECT 1 FROM public.bw_chat_messages m
       WHERE m.user_id = me AND m.room_kind = 'port' AND m.room_id = p_room
         AND m.created_at > now() - interval '24 hours') THEN
      RETURN jsonb_build_object('ok', false, 'refused', 'not_here');
    END IF;
    my_place := CASE WHEN staff THEN 'staff' ELSE 'port' END;
  ELSIF p_kind = 'route' THEN
    IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = p_room) THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
    my_place := CASE WHEN staff THEN 'staff' ELSE private.bw_chat_route_place(p_room, me) END;
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
  -- Seule l'équipe parle au nom de BledWay.
  INSERT INTO public.bw_chat_messages(room_kind, room_id, user_id, body, place, parent_id, reply_to_id, official)
  VALUES (p_kind, p_room, me, clean_body, my_place, p_parent, p_reply_to, coalesce(p_official, false) AND staff)
  RETURNING id INTO new_id;
  my_name := CASE WHEN coalesce(p_official, false) AND staff THEN 'BledWay'
                  ELSE coalesce((SELECT p.pseudo FROM public.bw_traveller_profiles p WHERE p.user_id = me), 'Un voyageur') END;
  plain := private.bw_chat_plain(clean_body);
  -- Mentions : 5 personnes au plus par message, jamais soi-même.
  FOR target IN
    SELECT p.user_id FROM public.bw_traveller_profiles p
     WHERE p.handle IN (SELECT DISTINCT (regexp_matches(clean_body, '@\[([0-9a-f]{10})\]', 'g'))[1]) AND p.user_id <> me
     LIMIT 5
  LOOP
    PERFORM private.bw_chat_notify_user(target, 'chat-mention:' || new_id || ':' || target,
      my_name || ' vous a mentionné', plain, p_kind, p_room);
    notified := notified || target;
  END LOOP;
  -- Réponse : l'auteur du message cité est prévenu, une seule fois même s'il est aussi mentionné.
  IF p_reply_to IS NOT NULL THEN
    SELECT m.user_id INTO quoted FROM public.bw_chat_messages m WHERE m.id = p_reply_to;
    IF quoted IS NOT NULL AND quoted <> me AND NOT quoted = ANY (notified) THEN
      PERFORM private.bw_chat_notify_user(quoted, 'chat-reply:' || new_id,
        my_name || ' vous a répondu', plain, p_kind, p_room);
    END IF;
  END IF;
  -- Prévenir l'auteur de la question : une seule notification par question, remise à non lue.
  IF p_parent IS NOT NULL AND asked.user_id <> me AND NOT asked.user_id = ANY (notified)
     AND coalesce((SELECT n.community FROM public.bw_notification_preferences n WHERE n.user_id = asked.user_id), true)
     AND NOT EXISTS (SELECT 1 FROM public.bw_chat_room_mutes u
                      WHERE u.user_id = asked.user_id AND u.room_kind = 'route' AND u.room_id = p_room) THEN
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
    VALUES (asked.user_id, 'question-reply:' || p_parent, 'On a répondu à votre question', private.bw_chat_plain(asked.body),
            '/?select=route&id=' || p_room)
    ON CONFLICT (user_id, event_key) DO UPDATE SET read_at = NULL, created_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $function$;
