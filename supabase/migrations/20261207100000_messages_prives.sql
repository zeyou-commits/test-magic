-- BledWay · Messages privés entre passagers d'une même traversée.
-- Une demande à accepter, puis 3 messages chacun. Mêmes filtres que le salon. Tout disparaît
-- 7 jours après l'arrivée. L'équipe ne lit une conversation que si l'un des deux la signale.

CREATE TABLE IF NOT EXISTS public.bw_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intro text NOT NULL CHECK (char_length(intro) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CHECK (requester_id <> recipient_id)
);
-- Une seule conversation par traversée entre deux personnes, quel que soit celui qui demande.
CREATE UNIQUE INDEX IF NOT EXISTS bw_dm_threads_pair ON public.bw_dm_threads
  (departure_id, least(requester_id, recipient_id), greatest(requester_id, recipient_id));
CREATE INDEX IF NOT EXISTS bw_dm_threads_recipient ON public.bw_dm_threads(recipient_id);
CREATE INDEX IF NOT EXISTS bw_dm_threads_requester ON public.bw_dm_threads(requester_id);

CREATE TABLE IF NOT EXISTS public.bw_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.bw_dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_dm_messages_thread ON public.bw_dm_messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS public.bw_dm_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.bw_dm_reports (
  thread_id uuid NOT NULL REFERENCES public.bw_dm_threads(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (thread_id, reporter_id)
);

ALTER TABLE public.bw_dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_dm_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_dm_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_dm_threads, public.bw_dm_messages, public.bw_dm_blocks, public.bw_dm_reports FROM anon, authenticated;

-- Une ligne dans la cloche, sans le contenu du message, et jamais poussée sur le téléphone.
CREATE OR REPLACE FUNCTION private.bw_dm_notify(p_user uuid, p_key text, p_title text, p_departure uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT coalesce((SELECT n.community FROM public.bw_notification_preferences n WHERE n.user_id = p_user), true) THEN RETURN; END IF;
  INSERT INTO public.bw_notifications(user_id, event_key, title, body, url, pushed_at)
  VALUES (p_user, p_key, p_title, 'Ouvrez vos messages privés dans le salon de la traversée.',
          '/?select=departure&id=' || p_departure || '&room=1&dm=1', now())
  ON CONFLICT (user_id, event_key) DO UPDATE SET read_at = NULL, created_at = now();
END $$;
REVOKE ALL ON FUNCTION private.bw_dm_notify(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Demander à écrire à quelqu'un du même bateau.
CREATE OR REPLACE FUNCTION public.bw_dm_request(p_departure uuid, p_handle text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        target uuid; refusal text; new_id uuid; my_name text;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
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
END $$;

-- Accepter ou refuser. Seule la personne invitée répond.
CREATE OR REPLACE FUNCTION public.bw_dm_answer(p_thread uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); t public.bw_dm_threads; my_name text;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  UPDATE public.bw_dm_threads x
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'refused' END, answered_at = now()
   WHERE x.id = p_thread AND x.recipient_id = me AND x.status = 'pending'
  RETURNING * INTO t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF p_accept THEN
    SELECT p.pseudo INTO my_name FROM public.bw_traveller_profiles p WHERE p.user_id = me;
    PERFORM private.bw_dm_notify(t.requester_id, 'dm-accept:' || t.id, coalesce(my_name, 'Un voyageur') || ' a accepté votre message', t.departure_id);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Écrire : 3 messages chacun, tant que la conversation existe.
CREATE OR REPLACE FUNCTION public.bw_dm_send(p_thread uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); clean_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        t public.bw_dm_threads; refusal text; other uuid; my_name text;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF char_length(clean_body) < 1 OR char_length(clean_body) > 200 THEN RETURN jsonb_build_object('ok', false, 'refused', 'length'); END IF;
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
END $$;

-- Mes conversations, avec ce qu'il reste à écrire de chaque côté.
CREATE OR REPLACE FUNCTION public.bw_dm_inbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.last_at DESC), '[]'::jsonb) FROM (
    SELECT coalesce((SELECT max(m.created_at) FROM public.bw_dm_messages m WHERE m.thread_id = t.id), t.created_at) AS last_at,
      jsonb_build_object(
        'id', t.id, 'departure_id', t.departure_id, 'status', t.status, 'intro', t.intro,
        'created_at', t.created_at, 'mine', t.requester_id = me,
        'line', (SELECT a.name || ' → ' || b.name FROM public.departures d
                   JOIN public.routes r ON r.id = d.route_id
                   JOIN public.ports a ON a.id = r.departure_port_id
                   JOIN public.ports b ON b.id = r.arrival_port_id WHERE d.id = t.departure_id),
        'other', private.bw_traveller_card(private.bw_ensure_traveller(
                   CASE WHEN t.requester_id = me THEN t.recipient_id ELSE t.requester_id END)),
        'my_left', 3 - (SELECT count(*) FROM public.bw_dm_messages m WHERE m.thread_id = t.id AND m.sender_id = me),
        'other_left', 3 - (SELECT count(*) FROM public.bw_dm_messages m WHERE m.thread_id = t.id AND m.sender_id <> me),
        'unread', (SELECT count(*) FROM public.bw_dm_messages m WHERE m.thread_id = t.id AND m.sender_id <> me AND m.read_at IS NULL)
                  + CASE WHEN t.status = 'pending' AND t.recipient_id = me THEN 1 ELSE 0 END,
        'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'me', m.sender_id = me, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
                       FROM public.bw_dm_messages m WHERE m.thread_id = t.id)
      ) AS item
    FROM public.bw_dm_threads t
    WHERE me IN (t.requester_id, t.recipient_id)
      -- Refusée : elle disparaît pour celle qui a refusé, et reste « sans réponse » pour l'autre.
      AND NOT (t.status = 'refused' AND t.recipient_id = me)
  ) x);
END $$;

CREATE OR REPLACE FUNCTION public.bw_dm_read(p_thread uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  UPDATE public.bw_dm_messages m SET read_at = now()
   WHERE m.thread_id = p_thread AND m.read_at IS NULL AND m.sender_id <> auth.uid()
     AND EXISTS (SELECT 1 FROM public.bw_dm_threads t WHERE t.id = p_thread AND auth.uid() IN (t.requester_id, t.recipient_id));
$$;

-- Bloquer : plus aucune demande dans un sens ni dans l'autre, et la conversation se ferme.
CREATE OR REPLACE FUNCTION public.bw_dm_block(p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); t public.bw_dm_threads; other uuid;
BEGIN
  SELECT * INTO t FROM public.bw_dm_threads x WHERE x.id = p_thread AND me IN (x.requester_id, x.recipient_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  other := CASE WHEN t.requester_id = me THEN t.recipient_id ELSE t.requester_id END;
  INSERT INTO public.bw_dm_blocks(blocker_id, blocked_id) VALUES (me, other) ON CONFLICT DO NOTHING;
  UPDATE public.bw_dm_threads x SET status = 'closed', answered_at = now()
   WHERE least(x.requester_id, x.recipient_id) = least(me, other)
     AND greatest(x.requester_id, x.recipient_id) = greatest(me, other)
     AND x.status IN ('pending', 'accepted');
  RETURN jsonb_build_object('ok', true);
END $$;

-- Signaler : bloque aussi, et ouvre la conversation à l'équipe.
CREATE OR REPLACE FUNCTION public.bw_dm_report(p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bw_dm_threads x WHERE x.id = p_thread AND me IN (x.requester_id, x.recipient_id)) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  INSERT INTO public.bw_dm_reports(thread_id, reporter_id) VALUES (p_thread, me) ON CONFLICT DO NOTHING;
  RETURN public.bw_dm_block(p_thread);
END $$;

-- Équipe : seules les conversations signalées, avec qui a signalé.
CREATE OR REPLACE FUNCTION public.bw_dm_reported()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin','editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT rep.created_at, jsonb_build_object(
      'id', t.id, 'intro', t.intro, 'reported_at', rep.created_at,
      'reporter', private.bw_traveller_card(private.bw_ensure_traveller(rep.reporter_id))->>'pseudo',
      'reported', private.bw_traveller_card(private.bw_ensure_traveller(
                    CASE WHEN t.requester_id = rep.reporter_id THEN t.recipient_id ELSE t.requester_id END))->>'pseudo',
      'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'body', m.body,
                      'from', private.bw_traveller_card(private.bw_ensure_traveller(m.sender_id))->>'pseudo') ORDER BY m.created_at), '[]'::jsonb)
                     FROM public.bw_dm_messages m WHERE m.thread_id = t.id)
    ) AS item
    FROM public.bw_dm_reports rep JOIN public.bw_dm_threads t ON t.id = rep.thread_id
    WHERE rep.resolved_at IS NULL) x);
END $$;

-- Classer le signalement ; avec sanction, la personne signalée ne peut plus écrire pendant 24 h.
CREATE OR REPLACE FUNCTION public.bw_dm_report_resolve(p_thread uuid, p_sanction boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE rep public.bw_dm_reports; t public.bw_dm_threads; culprit uuid;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin','editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO t FROM public.bw_dm_threads x WHERE x.id = p_thread;
  FOR rep IN SELECT * FROM public.bw_dm_reports r WHERE r.thread_id = p_thread AND r.resolved_at IS NULL LOOP
    IF p_sanction THEN
      culprit := CASE WHEN t.requester_id = rep.reporter_id THEN t.recipient_id ELSE t.requester_id END;
      INSERT INTO public.bw_chat_strikes(user_id, reason) SELECT culprit, 'dm_report' FROM generate_series(1, 5);
    END IF;
  END LOOP;
  UPDATE public.bw_dm_reports r SET resolved_at = now() WHERE r.thread_id = p_thread AND r.resolved_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.bw_dm_request(uuid, text, text), public.bw_dm_answer(uuid, boolean), public.bw_dm_send(uuid, text),
  public.bw_dm_inbox(), public.bw_dm_read(uuid), public.bw_dm_block(uuid), public.bw_dm_report(uuid),
  public.bw_dm_reported(), public.bw_dm_report_resolve(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_dm_request(uuid, text, text), public.bw_dm_answer(uuid, boolean), public.bw_dm_send(uuid, text),
  public.bw_dm_inbox(), public.bw_dm_read(uuid), public.bw_dm_block(uuid), public.bw_dm_report(uuid),
  public.bw_dm_reported(), public.bw_dm_report_resolve(uuid, boolean) TO authenticated;

-- Réveiller les écrans des deux personnes. Le signal ne contient ni texte ni compte.
CREATE OR REPLACE FUNCTION private.bw_dm_notify_screens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE t public.bw_dm_threads;
BEGIN
  IF TG_TABLE_NAME = 'bw_dm_threads' THEN t := NEW;
  ELSE SELECT * INTO t FROM public.bw_dm_threads x WHERE x.id = NEW.thread_id; END IF;
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'changed', 'dm:' || t.requester_id, false);
    PERFORM realtime.send('{}'::jsonb, 'changed', 'dm:' || t.recipient_id, false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_dm_notify_screens() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_dm_threads_screens ON public.bw_dm_threads;
CREATE TRIGGER bw_dm_threads_screens AFTER INSERT OR UPDATE ON public.bw_dm_threads
  FOR EACH ROW EXECUTE FUNCTION private.bw_dm_notify_screens();
DROP TRIGGER IF EXISTS bw_dm_messages_screens ON public.bw_dm_messages;
CREATE TRIGGER bw_dm_messages_screens AFTER INSERT ON public.bw_dm_messages
  FOR EACH ROW EXECUTE FUNCTION private.bw_dm_notify_screens();

-- Effacement : 7 jours après l'arrivée. Une conversation signalée reste 30 jours pour l'équipe.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bledway-mp-purge';
SELECT cron.schedule('bledway-mp-purge', '53 4 * * *', $job$
  DELETE FROM public.bw_dm_threads t USING public.departures d
   WHERE d.id = t.departure_id
     AND coalesce(d.arrival_at, d.departure_at + interval '48 hours') <
         now() - CASE WHEN EXISTS (SELECT 1 FROM public.bw_dm_reports r WHERE r.thread_id = t.id)
                      THEN interval '30 days' ELSE interval '7 days' END;
$job$);

NOTIFY pgrst, 'reload schema';
