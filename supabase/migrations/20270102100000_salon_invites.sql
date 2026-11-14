-- BledWay · Inviter un proche dans le salon de sa traversée.
-- Un passager partage un lien personnel ; la personne invitée (famille, ami) peut écrire dans ce
-- salon, avec la mention « invité », jusqu'à 24 h après l'arrivée. Elle n'est pas comptée parmi
-- les passagers : pas de messages privés, pas de présence à bord. 10 invités au plus par passager.

CREATE TABLE IF NOT EXISTS public.bw_room_invites (
  token text PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  max_uses integer NOT NULL DEFAULT 10 CHECK (max_uses BETWEEN 1 AND 50),
  uses integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  UNIQUE (departure_id, inviter_id)
);
CREATE TABLE IF NOT EXISTS public.bw_room_guests (
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL REFERENCES public.bw_room_invites(token) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (departure_id, user_id)
);
CREATE INDEX IF NOT EXISTS bw_room_guests_user_idx ON public.bw_room_guests (user_id);
CREATE INDEX IF NOT EXISTS bw_room_guests_token_idx ON public.bw_room_guests (token);
CREATE INDEX IF NOT EXISTS bw_room_invites_inviter_idx ON public.bw_room_invites (inviter_id);
-- Lecture et écriture seulement par les fonctions ci-dessous.
ALTER TABLE public.bw_room_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_room_guests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_room_invites, public.bw_room_guests FROM anon, authenticated;

-- Un message d'invité porte la mention « invité ».
ALTER TABLE public.bw_chat_messages DROP CONSTRAINT IF EXISTS bw_chat_messages_place_check;
ALTER TABLE public.bw_chat_messages ADD CONSTRAINT bw_chat_messages_place_check
  CHECK (place = ANY (ARRAY['aboard', 'port', 'trip', 'done', 'asker', 'staff', 'guest']));

-- Fin de l'invitation : 24 h après l'arrivée (constatée, sinon prévue, sinon 48 h après le départ).
CREATE OR REPLACE FUNCTION private.bw_room_guest_until(p_departure uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(d.reported_arrived_at, d.web_arrived_at, d.arrival_at, d.departure_at + interval '48 hours')
         + interval '24 hours'
    FROM public.departures d WHERE d.id = p_departure;
$$;
CREATE OR REPLACE FUNCTION private.bw_chat_is_guest(p_departure uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bw_room_guests g
      JOIN public.bw_room_invites i ON i.token = g.token
     WHERE g.departure_id = p_departure AND g.user_id = p_user
       AND g.expires_at > now() AND i.revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION private.bw_room_guest_until(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_chat_is_guest(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Mon lien d'invitation pour ce salon : toujours le même, créé à la première demande.
CREATE OR REPLACE FUNCTION public.bw_room_invite_create(p_departure uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); invite public.bw_room_invites;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  -- Seuls les passagers (et l'équipe) invitent ; un invité n'invite pas à son tour.
  IF private.bw_chat_crossing_place(p_departure, me) IS NULL AND NOT private.bw_chat_is_staff() THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'not_member');
  END IF;
  INSERT INTO public.bw_room_invites(departure_id, inviter_id) VALUES (p_departure, me)
  ON CONFLICT (departure_id, inviter_id) DO UPDATE SET revoked_at = NULL
  RETURNING * INTO invite;
  RETURN jsonb_build_object('ok', true, 'token', invite.token, 'left', greatest(invite.max_uses - invite.uses, 0));
END $$;

-- Ce que voit la personne invitée avant de se connecter : qui l'invite, et sur quelle traversée.
CREATE OR REPLACE FUNCTION public.bw_room_invite_info(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE invite public.bw_room_invites; line text;
BEGIN
  SELECT * INTO invite FROM public.bw_room_invites i WHERE i.token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'unknown'); END IF;
  SELECT a.name || ' → ' || b.name INTO line
    FROM public.departures d JOIN public.routes r ON r.id = d.route_id
    JOIN public.ports a ON a.id = r.departure_port_id JOIN public.ports b ON b.id = r.arrival_port_id
   WHERE d.id = invite.departure_id;
  RETURN jsonb_build_object('ok', true, 'departure_id', invite.departure_id, 'line', line,
    'inviter', coalesce((SELECT p.pseudo FROM public.bw_traveller_profiles p WHERE p.user_id = invite.inviter_id), 'Un voyageur'),
    'open', invite.revoked_at IS NULL AND invite.uses < invite.max_uses
            AND now() < private.bw_room_guest_until(invite.departure_id));
END $$;

-- Accepter : la personne connectée devient invitée de ce salon.
CREATE OR REPLACE FUNCTION public.bw_room_invite_accept(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); invite public.bw_room_invites; until timestamptz; name text;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  SELECT * INTO invite FROM public.bw_room_invites i WHERE i.token = p_token FOR UPDATE;
  IF NOT FOUND OR invite.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'unknown'); END IF;
  -- Déjà passager, ou c'est mon propre lien : rien à ajouter.
  IF invite.inviter_id = me OR private.bw_chat_crossing_place(invite.departure_id, me) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'departure_id', invite.departure_id, 'status', 'member');
  END IF;
  IF private.bw_chat_is_guest(invite.departure_id, me) THEN
    RETURN jsonb_build_object('ok', true, 'departure_id', invite.departure_id, 'status', 'guest');
  END IF;
  until := private.bw_room_guest_until(invite.departure_id);
  IF until IS NULL OR now() >= until THEN RETURN jsonb_build_object('ok', false, 'refused', 'expired'); END IF;
  IF invite.uses >= invite.max_uses THEN RETURN jsonb_build_object('ok', false, 'refused', 'full'); END IF;
  INSERT INTO public.bw_room_guests(departure_id, user_id, invited_by, token, expires_at)
  VALUES (invite.departure_id, me, invite.inviter_id, invite.token, until)
  ON CONFLICT (departure_id, user_id) DO UPDATE
    SET invited_by = excluded.invited_by, token = excluded.token, expires_at = excluded.expires_at, created_at = now();
  UPDATE public.bw_room_invites SET uses = uses + 1 WHERE token = invite.token;
  name := coalesce((SELECT p.pseudo FROM public.bw_traveller_profiles p WHERE p.user_id = me), 'Un proche');
  PERFORM private.bw_chat_notify_user(invite.inviter_id, 'room-guest:' || invite.departure_id || ':' || me,
    name || ' a rejoint votre salon', 'Votre invitation est acceptée : votre proche peut écrire dans le salon.',
    'crossing', invite.departure_id);
  RETURN jsonb_build_object('ok', true, 'departure_id', invite.departure_id, 'status', 'guest',
    'inviter', coalesce((SELECT p.pseudo FROM public.bw_traveller_profiles p WHERE p.user_id = invite.inviter_id), 'Un voyageur'));
END $$;

REVOKE ALL ON FUNCTION public.bw_room_invite_create(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_room_invite_accept(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_room_invite_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_room_invite_create(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_room_invite_accept(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_room_invite_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bw_chat_feed(p_kind text, p_room uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); access text := 'read'; items jsonb; visible boolean := true;
        staff boolean := private.bw_chat_is_staff();
BEGIN
  IF p_kind = 'crossing' AND private.bw_chat_crossing_place(p_room, me) IS NOT NULL THEN access := 'member';
  -- Invité par un passager : écrit dans ce salon, sans être compté parmi les passagers.
  ELSIF p_kind = 'crossing' AND private.bw_chat_is_guest(p_room, me) THEN access := 'guest';
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
    IF my_place IS NULL AND private.bw_chat_is_guest(p_room, me) THEN my_place := 'guest'; END IF;
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
