-- BledWay · Rejoindre en invité le salon d'une autre traversée.
-- Un voyageur connecté qui lit le salon d'une traversée sur laquelle il ne voyage pas peut le
-- rejoindre « en invité » pour y poser une question. Ses messages portent la mention
-- « invité · autre traversée ». Il peut réagir et mentionner, mais pas envoyer de photo ni de
-- message privé, et il n'invite personne.
-- Limites tenues par la base : 3 salons en invité à la fois, 1 message par minute et 10 par heure
-- dans ce salon, accès retiré dès qu'un de ses messages y est masqué (signalements, équipe ou
-- modération automatique), fin 24 h après l'arrivée du navire. Il peut quitter le salon à tout moment.
-- Le script peut être relancé. Rien n'est supprimé.

BEGIN;

-- 1. Les invités venus d'une autre traversée --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bw_room_visitors (
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- Sorti de lui-même : il peut revenir.
  left_at timestamptz,
  -- Retiré après un message masqué : il ne peut plus revenir dans ce salon.
  removed_at timestamptz,
  PRIMARY KEY (departure_id, user_id)
);
CREATE INDEX IF NOT EXISTS bw_room_visitors_user_idx ON public.bw_room_visitors (user_id);
-- Lecture et écriture seulement par les fonctions ci-dessous.
ALTER TABLE public.bw_room_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_room_visitors FROM PUBLIC, anon, authenticated, service_role;

-- Un message d'invité d'une autre traversée porte sa propre mention.
ALTER TABLE public.bw_chat_messages DROP CONSTRAINT IF EXISTS bw_chat_messages_place_check;
ALTER TABLE public.bw_chat_messages ADD CONSTRAINT bw_chat_messages_place_check
  CHECK (place = ANY (ARRAY['aboard', 'port', 'trip', 'done', 'asker', 'staff', 'guest', 'visitor']));

CREATE OR REPLACE FUNCTION private.bw_chat_is_visitor(p_departure uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bw_room_visitors v
     WHERE v.departure_id = p_departure AND v.user_id = p_user
       AND v.left_at IS NULL AND v.removed_at IS NULL AND v.expires_at > now());
$$;
REVOKE ALL ON FUNCTION private.bw_chat_is_visitor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Ce que le salon dit à une personne connectée qui n'y voyage pas : peut-elle entrer en invité ?
CREATE OR REPLACE FUNCTION private.bw_room_visit_state(p_departure uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE visit public.bw_room_visitors; until timestamptz; active integer;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO visit FROM public.bw_room_visitors v WHERE v.departure_id = p_departure AND v.user_id = p_user;
  IF FOUND AND visit.removed_at IS NOT NULL THEN RETURN jsonb_build_object('open', false, 'refused', 'removed'); END IF;
  IF FOUND AND visit.left_at IS NULL AND visit.expires_at > now() THEN
    RETURN jsonb_build_object('open', true, 'joined', true, 'until', visit.expires_at);
  END IF;
  until := private.bw_room_guest_until(p_departure);
  IF until IS NULL OR now() >= until THEN RETURN jsonb_build_object('open', false, 'refused', 'expired'); END IF;
  SELECT count(*) INTO active FROM public.bw_room_visitors v
   WHERE v.user_id = p_user AND v.departure_id <> p_departure
     AND v.left_at IS NULL AND v.removed_at IS NULL AND v.expires_at > now();
  IF active >= 3 THEN RETURN jsonb_build_object('open', false, 'refused', 'too_many'); END IF;
  RETURN jsonb_build_object('open', true, 'joined', false, 'until', until);
END $$;
REVOKE ALL ON FUNCTION private.bw_room_visit_state(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. Rejoindre en invité ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bw_room_visit_join(p_departure uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); state jsonb;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF NOT private.bw_charter_ok(me) THEN RETURN jsonb_build_object('ok', false, 'refused', 'charter'); END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_bans b WHERE b.user_id = me AND b.until > now()) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'banned');
  END IF;
  IF (SELECT count(*) FROM public.bw_chat_strikes s WHERE s.user_id = me AND s.created_at > now() - interval '24 hours') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'muted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.departures d WHERE d.id = p_departure) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  -- Déjà passager, déjà invité par un proche, ou équipe : rien à ajouter.
  IF private.bw_chat_crossing_place(p_departure, me) IS NOT NULL OR private.bw_chat_is_guest(p_departure, me)
     OR private.bw_chat_is_staff() THEN
    RETURN jsonb_build_object('ok', true, 'status', 'member');
  END IF;
  -- Une demande à la fois par compte : deux demandes simultanées ne dépassent pas la limite.
  PERFORM pg_advisory_xact_lock(hashtext('bw_room_visit:' || me::text));
  state := private.bw_room_visit_state(p_departure, me);
  IF NOT coalesce((state->>'open')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'refused', state->>'refused');
  END IF;
  IF coalesce((state->>'joined')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'visitor', 'until', state->'until');
  END IF;
  INSERT INTO public.bw_room_visitors(departure_id, user_id, expires_at)
  VALUES (p_departure, me, (state->>'until')::timestamptz)
  ON CONFLICT (departure_id, user_id) DO UPDATE
    SET joined_at = now(), expires_at = excluded.expires_at, left_at = NULL
  WHERE public.bw_room_visitors.removed_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'status', 'visitor', 'until', state->'until');
END $$;

-- 3. Quitter le salon : les messages déjà écrits restent, signés « invité · autre traversée ».
CREATE OR REPLACE FUNCTION public.bw_room_visit_leave(p_departure uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  UPDATE public.bw_room_visitors SET left_at = now()
   WHERE departure_id = p_departure AND user_id = me AND left_at IS NULL;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Invité ici sans y voyager : sert au serveur pour refuser une photo.
CREATE OR REPLACE FUNCTION public.bw_room_visit_mine(p_departure uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.bw_chat_is_visitor(p_departure, auth.uid())
     AND private.bw_chat_crossing_place(p_departure, auth.uid()) IS NULL
     AND NOT private.bw_chat_is_guest(p_departure, auth.uid())
     AND NOT private.bw_chat_is_staff();
$$;

REVOKE ALL ON FUNCTION public.bw_room_visit_join(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_room_visit_leave(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_room_visit_mine(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_room_visit_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_room_visit_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_room_visit_mine(uuid) TO authenticated;

-- 4. Un message masqué (signalements, équipe, modération automatique) retire l'invité du salon.
CREATE OR REPLACE FUNCTION private.bw_room_visitor_removed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.place = 'visitor' AND NEW.room_kind = 'crossing' AND NEW.hidden_at IS NOT NULL AND OLD.hidden_at IS NULL THEN
    UPDATE public.bw_room_visitors SET removed_at = coalesce(removed_at, now())
     WHERE departure_id = NEW.room_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_room_visitor_removed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_room_visitor_removed ON public.bw_chat_messages;
CREATE TRIGGER bw_room_visitor_removed
  AFTER UPDATE OF hidden_at ON public.bw_chat_messages
  FOR EACH ROW EXECUTE FUNCTION private.bw_room_visitor_removed();

-- 5. Le fil et l'envoi connaissent l'invité d'une autre traversée -------------------------------
CREATE OR REPLACE FUNCTION public.bw_chat_feed(p_kind text, p_room uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE me uuid := auth.uid(); access text := 'read'; items jsonb; visible boolean := true;
        staff boolean := private.bw_chat_is_staff();
BEGIN
  IF p_kind = 'crossing' AND private.bw_chat_crossing_place(p_room, me) IS NOT NULL THEN access := 'member';
  -- Invité par un passager : écrit dans ce salon, sans être compté parmi les passagers.
  ELSIF p_kind = 'crossing' AND private.bw_chat_is_guest(p_room, me) THEN access := 'guest';
  -- Venu d'une autre traversée, entré de lui-même : écrit ici avec la mention « invité · autre traversée ».
  ELSIF p_kind = 'crossing' AND private.bw_chat_is_visitor(p_room, me) THEN access := 'visitor';
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
    -- Rejoindre en invité : possible, déjà fait, ou refusé (et pourquoi).
    'visit', CASE WHEN p_kind = 'crossing' AND access IN ('read', 'visitor') THEN private.bw_room_visit_state(p_room, me) END,
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
    IF my_place IS NULL AND private.bw_chat_is_visitor(p_room, me) THEN
      my_place := 'visitor';
      -- Invité d'une autre traversée : 1 message par minute et 10 par heure dans ce salon.
      IF EXISTS (SELECT 1 FROM public.bw_chat_messages m
                  WHERE m.user_id = me AND m.room_kind = 'crossing' AND m.room_id = p_room
                    AND m.place = 'visitor' AND m.created_at > now() - interval '1 minute')
         OR (SELECT count(*) FROM public.bw_chat_messages m
              WHERE m.user_id = me AND m.room_kind = 'crossing' AND m.room_id = p_room
                AND m.place = 'visitor' AND m.created_at > now() - interval '1 hour') >= 10 THEN
        RETURN jsonb_build_object('ok', false, 'refused', 'visitor_rate');
      END IF;
    END IF;
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


COMMIT;
