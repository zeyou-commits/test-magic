-- BledWay · Salon : réactions aux messages, message privé depuis le profil.
-- Admin : auteur des avis et des signalements, retour au voyageur après une décision.
-- Le script peut être relancé. Rien n'est supprimé.

BEGIN;

-- 1. Réactions aux messages du salon ----------------------------------------------------------
-- Une réaction par personne et par message (on la change ou on la retire en retouchant).
CREATE TABLE IF NOT EXISTS public.bw_chat_emoji (
  message_id uuid NOT NULL REFERENCES public.bw_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('like', 'love', 'haha', 'wow', 'sad', 'pray')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.bw_chat_emoji ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_chat_emoji FROM anon, authenticated;

-- Réagir : tout compte actif, non exclu des salons. Le même choix une 2e fois retire la réaction.
CREATE OR REPLACE FUNCTION public.bw_chat_emoji_set(p_message uuid, p_emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); msg public.bw_chat_messages; port_id uuid;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  IF p_emoji IS NULL OR p_emoji NOT IN ('like', 'love', 'haha', 'wow', 'sad', 'pray') THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'room');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_bans b WHERE b.user_id = me AND b.until > now()) THEN
    RETURN jsonb_build_object('ok', false, 'refused', 'banned');
  END IF;
  SELECT * INTO msg FROM public.bw_chat_messages m WHERE m.id = p_message AND m.hidden_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  IF EXISTS (SELECT 1 FROM public.bw_chat_emoji e WHERE e.message_id = p_message AND e.user_id = me AND e.emoji = p_emoji) THEN
    DELETE FROM public.bw_chat_emoji e WHERE e.message_id = p_message AND e.user_id = me;
  ELSE
    INSERT INTO public.bw_chat_emoji(message_id, user_id, emoji) VALUES (p_message, me, p_emoji)
    ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
  END IF;
  -- Le salon se réveille aussitôt ; un signal perdu n'empêche jamais de réagir.
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'changed', 'chat:' || msg.room_kind || ':' || msg.room_id, false);
    IF msg.room_kind = 'crossing' THEN
      FOR port_id IN
        SELECT unnest(ARRAY[r.departure_port_id, r.arrival_port_id])
          FROM public.departures d JOIN public.routes r ON r.id = d.route_id
         WHERE d.id = msg.room_id
      LOOP
        PERFORM realtime.send('{}'::jsonb, 'changed', 'chat:port:' || port_id, false);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.bw_chat_emoji_set(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_chat_emoji_set(uuid, text) TO authenticated;

-- Les compteurs d'une liste de messages : { message: { "counts": { "love": 2 }, "mine": "love" } }.
CREATE OR REPLACE FUNCTION public.bw_chat_emoji_counts(p_messages uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(jsonb_object_agg(x.message_id, jsonb_build_object('counts', x.counts, 'mine', x.mine)), '{}'::jsonb)
  FROM (
    SELECT c.message_id, jsonb_object_agg(c.emoji, c.n) AS counts,
           (SELECT e.emoji FROM public.bw_chat_emoji e
             WHERE e.message_id = c.message_id AND e.user_id = auth.uid()) AS mine
    FROM (
      SELECT e.message_id, e.emoji, count(*) AS n
        FROM public.bw_chat_emoji e
        JOIN public.bw_chat_messages m ON m.id = e.message_id AND m.hidden_at IS NULL
       WHERE e.message_id = ANY (p_messages[1:200])
       GROUP BY e.message_id, e.emoji
    ) c
    GROUP BY c.message_id
  ) x;
$$;
REVOKE ALL ON FUNCTION public.bw_chat_emoji_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_emoji_counts(uuid[]) TO anon, authenticated;

-- Qui a réagi à un message : la carte publique de chacun (pseudo, avatar), rien d'autre.
CREATE OR REPLACE FUNCTION public.bw_chat_emoji_who(p_message uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('emoji', x.emoji, 'me', x.user_id = auth.uid(),
                                               'card', private.bw_traveller_card(p)) ORDER BY x.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT e.user_id, e.emoji, e.created_at
      FROM public.bw_chat_emoji e
      JOIN public.bw_chat_messages m ON m.id = e.message_id AND m.hidden_at IS NULL
     WHERE e.message_id = p_message
     ORDER BY e.created_at DESC LIMIT 60
  ) x
  JOIN public.bw_traveller_profiles p ON p.user_id = x.user_id;
$$;
REVOKE ALL ON FUNCTION public.bw_chat_emoji_who(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_emoji_who(uuid) TO anon, authenticated;

-- 2. Message privé depuis la fiche profil -----------------------------------------------------
-- Les règles ne changent pas (même traversée, demande à accepter, 3 messages chacun). La fiche
-- demande seulement : ai-je déjà une conversation avec cette personne, ou une traversée commune ?
CREATE OR REPLACE FUNCTION public.bw_dm_way(p_handle text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE me uuid := auth.uid(); target uuid; thread uuid; shared uuid;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('thread', NULL, 'departure', NULL); END IF;
  SELECT p.user_id INTO target FROM public.bw_traveller_profiles p WHERE p.handle = p_handle;
  IF target IS NULL OR target = me THEN RETURN jsonb_build_object('thread', NULL, 'departure', NULL); END IF;
  -- Une conversation en cours (un refus reste discret : il ressemble à une attente).
  SELECT t.id INTO thread FROM public.bw_dm_threads t
   WHERE least(t.requester_id, t.recipient_id) = least(me, target)
     AND greatest(t.requester_id, t.recipient_id) = greatest(me, target)
     AND (t.status IN ('pending', 'accepted') OR (t.status = 'refused' AND t.requester_id = me))
   ORDER BY t.created_at DESC LIMIT 1;
  -- Sinon, une traversée où nous sommes tous les deux passagers, sans conversation déjà ouverte.
  SELECT f.target_id INTO shared
    FROM public.bw_follows f JOIN public.departures d ON d.id = f.target_id
   WHERE f.user_id = me AND f.target_kind = 'departure' AND f.active AND f.traveller
     AND d.departure_at > now() - interval '5 days'
     AND private.bw_chat_crossing_place(f.target_id, me) IS NOT NULL
     AND private.bw_chat_crossing_place(f.target_id, target) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.bw_dm_threads t WHERE t.departure_id = f.target_id
                      AND least(t.requester_id, t.recipient_id) = least(me, target)
                      AND greatest(t.requester_id, t.recipient_id) = greatest(me, target))
     AND NOT EXISTS (SELECT 1 FROM public.bw_dm_blocks b
                      WHERE (b.blocker_id = target AND b.blocked_id = me) OR (b.blocker_id = me AND b.blocked_id = target))
   ORDER BY d.departure_at LIMIT 1;
  RETURN jsonb_build_object('thread', thread, 'departure', shared);
END $$;
REVOKE ALL ON FUNCTION public.bw_dm_way(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_dm_way(text) TO authenticated;

-- 3. Admin : qui a écrit cet avis, qui a fait ce signalement -----------------------------------
-- Réservé à l'équipe. Ajoute les signalements (« alert ») et ne dépend plus d'un profil déjà créé.
CREATE OR REPLACE FUNCTION public.bw_review_authors_staff(p_kind text, p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb := '{}'::jsonb; row record; prof public.bw_traveller_profiles; joined timestamptz;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','moderator']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF p_kind NOT IN ('port_review','vessel_review','entity_review','alert') OR coalesce(array_length(p_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Demande invalide';
  END IF;
  FOR row IN
    SELECT id, user_id FROM public.port_reviews WHERE p_kind = 'port_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_vessel_reviews WHERE p_kind = 'vessel_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_entity_reviews WHERE p_kind = 'entity_review' AND id = ANY(p_ids)
    UNION ALL SELECT id, user_id FROM public.bw_travel_alerts WHERE p_kind = 'alert' AND id = ANY(p_ids)
  LOOP
    CONTINUE WHEN row.user_id IS NULL;
    -- Un auteur illisible ne doit pas cacher les autres.
    BEGIN
      prof := private.bw_ensure_traveller(row.user_id);
      SELECT u.created_at INTO joined FROM auth.users u WHERE u.id = row.user_id;
      result := result || jsonb_build_object(row.id::text, jsonb_build_object(
        'card', private.bw_traveller_card(prof),
        'joined_at', joined,
        'reviews', (SELECT count(*) FROM (
            SELECT 1 FROM public.port_reviews r WHERE r.user_id = row.user_id
            UNION ALL SELECT 1 FROM public.bw_vessel_reviews r WHERE r.user_id = row.user_id
            UNION ALL SELECT 1 FROM public.bw_entity_reviews r WHERE r.user_id = row.user_id) g),
        'hidden', (SELECT count(*) FROM (
            SELECT 1 FROM public.port_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden'
            UNION ALL SELECT 1 FROM public.bw_vessel_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden'
            UNION ALL SELECT 1 FROM public.bw_entity_reviews r WHERE r.user_id = row.user_id AND r.status = 'hidden') g),
        'alerts', (SELECT count(*) FROM public.bw_travel_alerts a WHERE a.user_id = row.user_id)));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_review_authors_staff(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_review_authors_staff(text, uuid[]) TO authenticated;

-- 4. Retour au voyageur après une décision de l'équipe -----------------------------------------
-- Une ligne dans sa cloche (puis sur son téléphone au passage suivant de l'envoi), sauf s'il a
-- coupé les notifications « communauté ». Une erreur ici ne bloque jamais la modération.
CREATE OR REPLACE FUNCTION private.bw_moderation_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE o jsonb := to_jsonb(OLD); n jsonb := to_jsonb(NEW); kind text := TG_ARGV[0];
        author uuid; decision text; target_kind text; target uuid; subject text; t text; b text;
BEGIN
  BEGIN
    author := nullif(n->>'user_id', '')::uuid;
    -- Sa propre modification n'est pas une décision de l'équipe.
    IF author IS NULL OR author = auth.uid() THEN RETURN NULL; END IF;
    IF kind IN ('entity', 'vessel', 'port') THEN
      IF (n->>'status') IS NOT DISTINCT FROM (o->>'status') OR (n->>'status') NOT IN ('published', 'hidden') THEN RETURN NULL; END IF;
      decision := n->>'status';
      target_kind := CASE WHEN kind = 'entity' THEN n->>'target_kind' ELSE kind END;
      target := nullif(coalesce(n->>'target_id', n->>'vessel_id', n->>'port_id'), '')::uuid;
      IF target_kind = 'port' THEN SELECT p.name INTO subject FROM public.ports p WHERE p.id = target;
      ELSIF target_kind = 'vessel' THEN SELECT v.name INTO subject FROM public.vessels v WHERE v.id = target;
      ELSIF target_kind = 'company' THEN SELECT c.name INTO subject FROM public.companies c WHERE c.id = target;
      END IF;
      subject := coalesce(subject || ' : ', '');
      IF decision = 'published' THEN
        t := 'Votre avis est publié';
        b := subject || 'merci, votre avis est maintenant visible par tous les voyageurs.';
      ELSE
        t := 'Votre avis n''a pas été publié';
        b := subject || 'l''équipe ne l''a pas retenu. Vous pouvez le modifier et le renvoyer.';
      END IF;
    ELSIF kind = 'anomaly' THEN
      IF (o->>'status') IS DISTINCT FROM 'pending' OR (n->>'status') = 'pending' THEN RETURN NULL; END IF;
      decision := coalesce(n->>'decision', n->>'status');
      IF decision = 'published' THEN
        t := 'Votre signalement est publié';
        b := 'Merci ! L''équipe l''a vérifié : il est visible par les voyageurs.';
      ELSIF decision = 'dismissed' THEN
        t := 'Votre signalement n''a pas été retenu';
        b := 'L''équipe n''a pas pu le confirmer. Merci de continuer à nous prévenir.';
      ELSE
        t := 'Votre signalement a été pris en compte';
        b := 'Merci ! L''équipe l''a vérifié.';
      END IF;
    ELSIF kind = 'alert' THEN
      IF (o->>'validated_at') IS NOT NULL OR (n->>'validated_at') IS NULL THEN RETURN NULL; END IF;
      decision := 'validated';
      t := 'Votre signalement est validé par l''équipe';
      b := 'Merci ! Il est marqué comme vérifié pour tous les voyageurs.';
    ELSE
      RETURN NULL;
    END IF;
    IF NOT coalesce((SELECT p.community FROM public.bw_notification_preferences p WHERE p.user_id = author), true) THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.bw_notifications(user_id, event_key, title, body, url)
    VALUES (author, 'moderation:' || kind || ':' || (n->>'id') || ':' || decision, t, b, '/compte#contributions')
    ON CONFLICT (user_id, event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_moderation_feedback() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('bw_entity_reviews', 'entity'), ('bw_vessel_reviews', 'vessel'), ('port_reviews', 'port'),
      ('bw_report_anomalies', 'anomaly'), ('bw_travel_alerts', 'alert')) AS v(tbl, kind)
  LOOP
    IF to_regclass('public.' || item.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS bw_moderation_feedback ON public.%I', item.tbl);
      EXECUTE format('CREATE TRIGGER bw_moderation_feedback AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.bw_moderation_feedback(%L)', item.tbl, item.kind);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
