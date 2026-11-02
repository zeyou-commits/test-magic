-- BledWay · Salons : charte acceptée avant le premier message, mentions @voyageur et réponses notifiées,
-- sourdine par salon.

-- La charte : acceptée une fois par compte, à refaire si sa version change.
CREATE TABLE IF NOT EXISTS public.bw_charter_acceptances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bw_charter_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_charter_acceptances FROM anon, authenticated;

-- Sourdine : plus aucune notification venue de ce salon (mentions, réponses).
CREATE TABLE IF NOT EXISTS public.bw_chat_room_mutes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_kind text NOT NULL CHECK (room_kind IN ('crossing', 'port', 'route')),
  room_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_kind, room_id)
);
ALTER TABLE public.bw_chat_room_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_chat_room_mutes FROM anon, authenticated;

/** Version en vigueur de la charte : l'augmenter oblige chacun à la relire. */
CREATE OR REPLACE FUNCTION private.bw_charter_version()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$ SELECT 1 $$;

CREATE OR REPLACE FUNCTION private.bw_charter_ok(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.bw_charter_acceptances c
                  WHERE c.user_id = p_user AND c.version >= private.bw_charter_version());
$$;

CREATE OR REPLACE FUNCTION public.bw_charter_accept(p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF p_version IS DISTINCT FROM private.bw_charter_version() THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'charter');
  END IF;
  INSERT INTO public.bw_charter_acceptances(user_id, version) VALUES (me, p_version)
  ON CONFLICT (user_id) DO UPDATE SET version = excluded.version, accepted_at = now();
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.bw_charter_accept(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_charter_accept(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bw_chat_mute(p_kind text, p_room uuid, p_muted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF p_kind NOT IN ('crossing', 'port', 'route') THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF p_muted THEN
    INSERT INTO public.bw_chat_room_mutes(user_id, room_kind, room_id) VALUES (me, p_kind, p_room)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.bw_chat_room_mutes m WHERE m.user_id = me AND m.room_kind = p_kind AND m.room_id = p_room;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.bw_chat_mute(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_chat_mute(text, uuid, boolean) TO authenticated;

-- Une mention s'écrit @[identifiant] dans le message ; on l'affiche @Pseudo.
CREATE OR REPLACE FUNCTION private.bw_chat_mentions(p_body text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(jsonb_object_agg(p.handle, p.pseudo), '{}'::jsonb)
    FROM (SELECT DISTINCT (regexp_matches(p_body, '@\[([0-9a-f]{10})\]', 'g'))[1] AS handle) x
    JOIN public.bw_traveller_profiles p ON p.handle = x.handle;
$$;

CREATE OR REPLACE FUNCTION private.bw_chat_plain(p_body text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE result text := p_body; entry record;
BEGIN
  FOR entry IN SELECT key, value FROM jsonb_each_text(private.bw_chat_mentions(p_body)) LOOP
    result := replace(result, '@[' || entry.key || ']', '@' || entry.value);
  END LOOP;
  RETURN result;
END $$;

/** Prévenir quelqu'un d'une activité d'un salon, sauf s'il l'a mis en sourdine ou coupé la communauté. */
CREATE OR REPLACE FUNCTION private.bw_chat_notify_user(p_user uuid, p_key text, p_title text, p_body text,
  p_kind text, p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  IF NOT coalesce((SELECT n.community FROM public.bw_notification_preferences n WHERE n.user_id = p_user), true) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_room_mutes m
              WHERE m.user_id = p_user AND m.room_kind = p_kind AND m.room_id = p_room) THEN RETURN; END IF;
  INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
  VALUES (p_user, p_key, p_title, left(p_body, 200),
          CASE p_kind WHEN 'crossing' THEN '/?select=departure&id=' || p_room || '&room=1'
                      WHEN 'port' THEN '/?select=port&id=' || p_room
                      ELSE '/?select=route&id=' || p_room END)
  ON CONFLICT (user_id, event_key) DO UPDATE SET read_at = NULL, created_at = now();
END $$;

REVOKE ALL ON FUNCTION private.bw_charter_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_chat_mentions(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_chat_plain(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_chat_notify_user(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

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
        OR (p_kind = 'port' AND m.created_at > now() - interval '24 hours' AND (
          (m.room_kind = 'port' AND m.room_id = p_room)
          OR (m.room_kind = 'crossing' AND EXISTS (
            SELECT 1 FROM public.departures d JOIN public.routes r ON r.id = d.route_id
             WHERE d.id = m.room_id AND p_room IN (r.departure_port_id, r.arrival_port_id)))
        ))
      )
    ORDER BY m.created_at DESC LIMIT 80
  ) x;
  RETURN jsonb_build_object('access', access, 'staff', staff, 'messages', items,
    'charter', me IS NOT NULL AND private.bw_charter_ok(me),
    'muted', me IS NOT NULL AND EXISTS (SELECT 1 FROM public.bw_chat_room_mutes u
                                         WHERE u.user_id = me AND u.room_kind = p_kind AND u.room_id = p_room));
END $function$;

CREATE OR REPLACE FUNCTION public.bw_chat_questions(p_route uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); items jsonb; staff boolean := private.bw_chat_is_staff();
BEGIN
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) INTO items FROM (
    SELECT q.created_at, jsonb_build_object(
      'id', q.id, 'body', q.body, 'place', q.place, 'created_at', q.created_at, 'me', q.user_id = me,
      'edited', q.edited_at IS NOT NULL,
      'mentions', private.bw_chat_mentions(q.body),
      'author', private.bw_chat_author(q.user_id, q.official),
      'same', (SELECT count(*) FROM public.bw_chat_reactions r WHERE r.message_id = q.id),
      'reacted', EXISTS (SELECT 1 FROM public.bw_chat_reactions r WHERE r.message_id = q.id AND r.user_id = me),
      'replies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'body', a.body, 'place', a.place, 'created_at', a.created_at, 'me', a.user_id = me,
          'edited', a.edited_at IS NOT NULL,
          'mentions', private.bw_chat_mentions(a.body),
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
                            'staff', staff, 'questions', items,
                            'charter', me IS NOT NULL AND private.bw_charter_ok(me));
END $function$;

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

-- Messages privés : la charte vaut aussi pour eux.
CREATE OR REPLACE FUNCTION public.bw_dm_request(p_departure uuid, p_handle text, p_body text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        target uuid; refusal text; new_id uuid; my_name text;
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
  SELECT p.user_id INTO target FROM public.bw_traveller_profiles p WHERE p.handle = p_handle;
  IF target IS NULL OR target = me
     OR private.bw_chat_crossing_place(p_departure, me) IS NULL
     OR private.bw_chat_crossing_place(p_departure, target) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'dm_not_same');
  END IF;
  -- Le blocage et le refus restent discrets : le même motif, sans dire lequel.
  IF EXISTS (SELECT 1 FROM public.bw_dm_blocks b WHERE (b.blocker_id = target AND b.blocked_id = me) OR (b.blocker_id = me AND b.blocked_id = target))
     OR EXISTS (SELECT 1 FROM public.bw_dm_threads t WHERE t.requester_id = me AND t.recipient_id = target AND t.status = 'refused') THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'dm_unavailable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bw_dm_threads t WHERE t.departure_id = p_departure
             AND least(t.requester_id, t.recipient_id) = least(me, target)
             AND greatest(t.requester_id, t.recipient_id) = greatest(me, target)) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'dm_exists');
  END IF;
  IF (SELECT count(*) FROM public.bw_dm_threads t WHERE t.requester_id = me AND t.status = 'pending') >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'dm_pending');
  END IF;
  refusal := private.bw_chat_refusal(clean_body);
  IF refusal IS NOT NULL THEN
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (me, refusal);
    RETURN jsonb_build_object('ok', false, 'refused', refusal);
  END IF;
  INSERT INTO public.bw_dm_threads(departure_id, requester_id, recipient_id, intro)
  VALUES (p_departure, me, target, clean_body) RETURNING id INTO new_id;
  SELECT p.pseudo INTO my_name FROM public.bw_traveller_profiles p WHERE p.user_id = me;
  PERFORM private.bw_dm_notify(target, 'dm-request:' || new_id, coalesce(my_name, 'Un voyageur') || ' souhaite vous écrire', p_departure);
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $function$;

CREATE OR REPLACE FUNCTION public.bw_dm_send(p_thread uuid, p_body text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        t public.bw_dm_threads; refusal text; other uuid; my_name text;
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
  SELECT * INTO t FROM public.bw_dm_threads x WHERE x.id = p_thread AND me IN (x.requester_id, x.recipient_id) FOR UPDATE;
  IF NOT FOUND OR t.status <> 'accepted' THEN RETURN jsonb_build_object('ok', false, 'refused', 'dm_closed'); END IF;
  IF (SELECT count(*) FROM public.bw_dm_messages m WHERE m.thread_id = p_thread AND m.sender_id = me) >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'dm_quota');
  END IF;
  refusal := private.bw_chat_refusal(clean_body);
  IF refusal IS NOT NULL THEN
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (me, refusal);
    RETURN jsonb_build_object('ok', false, 'refused', refusal);
  END IF;
  INSERT INTO public.bw_dm_messages(thread_id, sender_id, body) VALUES (p_thread, me, clean_body);
  other := CASE WHEN t.requester_id = me THEN t.recipient_id ELSE t.requester_id END;
  SELECT p.pseudo INTO my_name FROM public.bw_traveller_profiles p WHERE p.user_id = me;
  PERFORM private.bw_dm_notify(other, 'dm-message:' || t.id || ':' || other, coalesce(my_name, 'Un voyageur') || ' vous a écrit', t.departure_id);
  RETURN jsonb_build_object('ok', true);
END $function$;

