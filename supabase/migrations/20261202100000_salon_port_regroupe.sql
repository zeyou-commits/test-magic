-- BledWay · Moins d'espaces : le fil du port regroupe ses messages et ceux des traversées qui le touchent.
-- Les règles d'écriture ne changent pas : sur place pour le port, passager pour une traversée.

-- Lire. Port : 24 h, avec les traversées qui en partent ou y arrivent, chacune nommée.
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
      'crossing', (SELECT a.name || ' → ' || b.name
                     FROM public.departures d
                     JOIN public.routes r ON r.id = d.route_id
                     JOIN public.ports a ON a.id = r.departure_port_id
                     JOIN public.ports b ON b.id = r.arrival_port_id
                    WHERE p_kind = 'port' AND m.room_kind = 'crossing' AND d.id = m.room_id),
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

-- « Pareil ici » : aussi pour qui est sur un port de cette traversée.
CREATE OR REPLACE FUNCTION public.bw_chat_react(p_message uuid, p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); msg public.bw_chat_messages;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  SELECT * INTO msg FROM public.bw_chat_messages m WHERE m.id = p_message AND m.hidden_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF msg.room_kind = 'crossing' AND private.bw_chat_crossing_place(msg.room_id, me) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.departures d JOIN public.routes r ON r.id = d.route_id
        WHERE d.id = msg.room_id
          AND (private.bw_chat_near_port(r.departure_port_id, p_lat, p_lon)
               OR private.bw_chat_near_port(r.arrival_port_id, p_lat, p_lon))) THEN
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

-- Le nombre de messages d'une liste de traversées, en une seule demande.
CREATE OR REPLACE FUNCTION public.bw_chat_counts(p_departures uuid[])
RETURNS TABLE(departure_id uuid, messages integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT m.room_id, count(*)::integer
    FROM public.bw_chat_messages m
   WHERE m.room_kind = 'crossing' AND m.hidden_at IS NULL
     AND m.room_id = ANY (p_departures[1:100])
   GROUP BY m.room_id;
$$;
REVOKE ALL ON FUNCTION public.bw_chat_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_counts(uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
