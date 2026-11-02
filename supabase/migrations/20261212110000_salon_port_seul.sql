-- BledWay · Le direct « sur le port » ne montre plus que les messages écrits sur place (24 h).
-- Les salons des traversées du port sont proposés à part, les plus proches en avant.

CREATE OR REPLACE FUNCTION public.bw_chat_feed(p_kind text, p_room uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); access text := 'read'; items jsonb; visible boolean := true;
        staff boolean := private.bw_chat_is_staff();
BEGIN
  IF p_kind = 'crossing' AND private.bw_chat_crossing_place(p_room, me) IS NOT NULL THEN access := 'member';
  ELSIF p_kind = 'port' AND me IS NOT NULL THEN access := 'position';
  END IF;
  -- L'équipe peut écrire partout, sans être à bord ni sur place.
  IF staff THEN access := 'staff'; END IF;
  IF p_kind = 'crossing' THEN
    SELECT now() < coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '7 days' INTO visible
      FROM public.departures d WHERE d.id = p_room;
  END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT m.created_at, jsonb_build_object(
      'id', m.id, 'body', m.body, 'place', m.place, 'created_at', m.created_at,
      'me', m.user_id = me, 'edited', m.edited_at IS NOT NULL,
      'mentions', private.bw_chat_mentions(m.body),
      'crossing', (SELECT a.name || ' → ' || b.name
                     FROM public.departures d
                     JOIN public.routes r ON r.id = d.route_id
                     JOIN public.ports a ON a.id = r.departure_port_id
                     JOIN public.ports b ON b.id = r.arrival_port_id
                    WHERE p_kind = 'port' AND m.room_kind = 'crossing' AND d.id = m.room_id),
      -- Un message masqué n'est plus cité.
      'reply_to', (SELECT jsonb_build_object('id', q.id, 'body', private.bw_chat_plain(q.body), 'me', q.user_id = me,
                          'pseudo', private.bw_chat_author(q.user_id, q.official)->>'pseudo')
                     FROM public.bw_chat_messages q WHERE q.id = m.reply_to_id AND q.hidden_at IS NULL),
      'author', private.bw_chat_author(m.user_id, m.official),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = m.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = m.id AND r.user_id = me)
    ) AS item
    FROM public.bw_chat_messages m
    WHERE m.hidden_at IS NULL AND coalesce(visible, false)
      AND (
        (p_kind = 'crossing' AND m.room_kind = 'crossing' AND m.room_id = p_room)
        -- Le direct du port : seulement ce qui s'écrit sur place, sur 24 h. Les traversées ont leurs salons.
        OR (p_kind = 'port' AND m.created_at > now() - interval '24 hours'
            AND m.room_kind = 'port' AND m.room_id = p_room)
      )
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'staff', staff, 'messages', items,
    'charter', me IS NOT NULL AND private.bw_charter_ok(me),
    'muted', me IS NOT NULL AND EXISTS (SELECT 1 FROM public.bw_chat_room_mutes u
                                         WHERE u.user_id = me AND u.room_kind = p_kind AND u.room_id = p_room));
END $function$;
