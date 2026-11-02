-- BledWay · L'équipe dans les salons : badges Admin / Modérateur, messages officiels « BledWay »,
-- écriture dans tous les salons, et modération en direct (masquer, rendre muet, exclure).

ALTER TABLE public.bw_chat_messages ADD COLUMN IF NOT EXISTS official boolean NOT NULL DEFAULT false;

-- Exclusions décidées par l'équipe depuis un salon. Aucune lecture directe : tout passe par les fonctions.
CREATE TABLE IF NOT EXISTS public.bw_chat_bans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  reason text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_chat_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_chat_bans FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.bw_chat_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.bw_staff_permission(ARRAY['admin','editor','moderator']);
$$;

-- L'auteur affiché : le compte officiel BledWay, ou la carte du voyageur avec son rôle dans l'équipe.
CREATE OR REPLACE FUNCTION private.bw_chat_author(p_user uuid, p_official boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT CASE WHEN p_official THEN
    jsonb_build_object('handle', 'bledway', 'pseudo', 'BledWay', 'avatar', null, 'color', '#0f6b4f',
                       'mood', null, 'official', true)
  ELSE
    private.bw_traveller_card(private.bw_ensure_traveller(p_user)) || jsonb_build_object('role', (
      SELECT CASE WHEN bool_or(r.role::text = 'admin') THEN 'admin'
                  WHEN bool_or(r.role::text IN ('editor', 'moderator')) THEN 'moderator' END
        FROM public.user_roles r WHERE r.user_id = p_user))
  END;
$$;
REVOKE ALL ON FUNCTION private.bw_chat_is_staff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_chat_author(uuid, boolean) FROM PUBLIC, anon, authenticated;

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
      'crossing', (SELECT a.name || ' → ' || b.name
                     FROM public.departures d
                     JOIN public.routes r ON r.id = d.route_id
                     JOIN public.ports a ON a.id = r.departure_port_id
                     JOIN public.ports b ON b.id = r.arrival_port_id
                    WHERE p_kind = 'port' AND m.room_kind = 'crossing' AND d.id = m.room_id),
      -- Un message masqué n'est plus cité.
      'reply_to', (SELECT jsonb_build_object('id', q.id, 'body', q.body, 'me', q.user_id = me,
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
        OR (p_kind = 'port' AND m.created_at > now() - interval '24 hours' AND (
          (m.room_kind = 'port' AND m.room_id = p_room)
          OR (m.room_kind = 'crossing' AND EXISTS (
            SELECT 1 FROM public.departures d JOIN public.routes r ON r.id = d.route_id
             WHERE d.id = m.room_id AND p_room IN (r.departure_port_id, r.arrival_port_id)))
        ))
      )
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'staff', staff, 'messages', items);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_chat_questions(p_route uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); items jsonb; staff boolean := private.bw_chat_is_staff();
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT q.created_at, jsonb_build_object(
      'id', q.id, 'body', q.body, 'place', q.place, 'created_at', q.created_at, 'me', q.user_id = me,
      'edited', q.edited_at IS NOT NULL,
      'author', private.bw_chat_author(q.user_id, q.official),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = q.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = q.id AND r.user_id = me),
      'replies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'body', a.body, 'place', a.place, 'created_at', a.created_at, 'me', a.user_id = me,
          'edited', a.edited_at IS NOT NULL,
          'author', private.bw_chat_author(a.user_id, a.official),
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
  RETURN jsonb_build_object('access', CASE WHEN staff THEN 'staff' WHEN me IS NOT NULL THEN 'member' ELSE 'read' END,
                            'staff', staff, 'questions', items);
END $function$;

-- Nouvelle signature (p_official) : l'ancienne est retirée pour éviter deux versions ambiguës.
DROP FUNCTION IF EXISTS public.bw_chat_post(text, uuid, text, double precision, double precision, uuid, uuid);
CREATE FUNCTION public.bw_chat_post(p_kind text, p_room uuid, p_body text, p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL, p_parent uuid DEFAULT NULL, p_reply_to uuid DEFAULT NULL,
  p_official boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        my_place text; refusal text; new_id uuid; asked public.bw_chat_messages;
        staff boolean := private.bw_chat_is_staff();
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
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
    IF NOT staff AND NOT private.bw_chat_near_port(p_room, p_lat, p_lon) THEN RETURN jsonb_build_object('ok', false, 'refused', 'not_here'); END IF;
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
  -- Prévenir l'auteur de la question : une seule notification par question, remise à non lue.
  IF p_parent IS NOT NULL AND asked.user_id <> me
     AND coalesce((SELECT n.community FROM public.bw_notification_preferences n WHERE n.user_id = asked.user_id), true) THEN
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
    VALUES (asked.user_id, 'question-reply:' || p_parent, 'On a répondu à votre question', asked.body,
            '/?select=route&id=' || p_room)
    ON CONFLICT (user_id, event_key) DO UPDATE SET read_at = NULL, created_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $function$;
REVOKE ALL ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_chat_post(text, uuid, text, double precision, double precision, uuid, uuid, boolean) TO authenticated;

-- Les modérateurs masquent aussi, en direct.
CREATE OR REPLACE FUNCTION public.bw_chat_set_hidden(p_message uuid, p_hidden boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NOT private.bw_chat_is_staff() THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  UPDATE public.bw_chat_messages
     SET hidden_at = CASE WHEN p_hidden THEN now() END,
         hidden_reason = CASE WHEN p_hidden THEN 'Équipe' END,
         reviewed_at = now()
   WHERE id = p_message;
  IF NOT p_hidden THEN DELETE FROM public.bw_chat_reports r WHERE r.message_id = p_message; END IF;
END $function$;

-- Depuis un message : l'auteur ne peut plus écrire pendant 1 ou 7 jours, et le message disparaît.
-- Une exclusion de 7 jours retire aussi ses messages des dernières 24 h dans ce salon.
CREATE OR REPLACE FUNCTION public.bw_chat_sanction(p_message uuid, p_days integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE msg public.bw_chat_messages; me uuid := auth.uid();
BEGIN
  IF NOT private.bw_chat_is_staff() THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_days NOT IN (1, 7) THEN RAISE EXCEPTION 'Durée non prévue'; END IF;
  SELECT * INTO msg FROM public.bw_chat_messages m WHERE m.id = p_message;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF msg.user_id = me OR EXISTS (SELECT 1 FROM public.user_roles r
       WHERE r.user_id = msg.user_id AND r.role::text IN ('admin', 'editor', 'moderator')) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'staff_target');
  END IF;
  INSERT INTO public.bw_chat_bans(user_id, until, reason, decided_by)
  VALUES (msg.user_id, now() + make_interval(days => p_days), 'Salon', me)
  ON CONFLICT (user_id) DO UPDATE
    SET until = greatest(public.bw_chat_bans.until, excluded.until), reason = excluded.reason,
        decided_by = excluded.decided_by, created_at = now();
  UPDATE public.bw_chat_messages m
     SET hidden_at = now(), hidden_reason = 'Équipe', reviewed_at = now()
   WHERE m.hidden_at IS NULL
     AND (m.id = p_message OR (p_days = 7 AND m.user_id = msg.user_id AND m.room_kind = msg.room_kind
          AND m.room_id = msg.room_id AND m.created_at > now() - interval '24 hours'));
  RETURN jsonb_build_object('ok', true);
END $function$;
REVOKE ALL ON FUNCTION public.bw_chat_sanction(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_chat_sanction(uuid, integer) TO authenticated;
