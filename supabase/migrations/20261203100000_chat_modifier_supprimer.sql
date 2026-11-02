-- BledWay · Chacun peut modifier ou supprimer son propre message, question ou réponse.
-- Une modification repasse les règles et la relecture de l'agent ; un message masqué ne se modifie plus.

ALTER TABLE public.bw_chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE OR REPLACE FUNCTION public.bw_chat_edit(p_message uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')); refusal text;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
  IF (SELECT count(*) FROM public.bw_chat_strikes s WHERE s.user_id = me AND s.created_at > now() - interval '24 hours') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'muted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bw_chat_messages m WHERE m.id = p_message AND m.user_id = me AND m.hidden_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  refusal := private.bw_chat_refusal(clean_body);
  IF refusal IS NOT NULL THEN
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (me, refusal);
    RETURN jsonb_build_object('ok', false, 'refused', refusal);
  END IF;
  UPDATE public.bw_chat_messages SET body = clean_body, edited_at = now(), reviewed_at = NULL WHERE id = p_message;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Supprimer une question retire aussi ses réponses.
CREATE OR REPLACE FUNCTION public.bw_chat_delete(p_message uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  DELETE FROM public.bw_chat_messages m WHERE m.id = p_message AND m.user_id = me AND m.hidden_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

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

CREATE OR REPLACE FUNCTION public.bw_chat_questions(p_route uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT q.created_at, jsonb_build_object(
      'id', q.id, 'body', q.body, 'place', q.place, 'created_at', q.created_at, 'me', q.user_id = me,
      'edited', q.edited_at IS NOT NULL,
      'author', private.bw_traveller_card(private.bw_ensure_traveller(q.user_id)),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = q.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = q.id AND r.user_id = me),
      'replies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'body', a.body, 'place', a.place, 'created_at', a.created_at, 'me', a.user_id = me,
          'edited', a.edited_at IS NOT NULL,
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

REVOKE ALL ON FUNCTION public.bw_chat_edit(uuid, text), public.bw_chat_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_edit(uuid, text), public.bw_chat_delete(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
