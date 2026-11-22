-- BledWay · Espace compagnie : publication directe, sans validation préalable par BledWay (22/11/2026).
-- Prérequis : lots 1, 2 et 3 de l'espace compagnie.
--
-- Décision de l'utilisateur : la compagnie publie sous son nom, tout de suite. BledWay garde la
-- main APRÈS coup (retrait d'une réponse ou d'une photo, correction d'une traversée ou d'une fiche
-- depuis l'admin) et continue d'arbitrer les contestations de signalements.
--
-- Ce qui change :
-- - Changement de traversée (retard, horaire, navire, annulation) : appliqué à l'envoi.
-- - Annonce : nouvelle fonction bw_company_announcement_send, appelée par le serveur après le
--   calcul des destinataires ; le message part tout de suite.
-- - Réponse à un avis ou à un signalement : publiée à l'envoi (la contestation reste examinée).
-- - Fiche : corrections appliquées à l'envoi, l'état d'avant est gardé dans l'historique.
-- - Photo : nouvelle fonction bw_company_photo_publish, appelée par le serveur après le filtre
--   de contenu explicite et la copie dans l'espace public.
-- - Limites tenues par la base, que le navigateur ne peut pas contourner.
-- Les fonctions de relecture de l'équipe restent en place : elles traitent ce qui attendait déjà
-- et servent à retirer après coup. Script relançable ; aucune table créée, aucun droit élargi.

BEGIN;

-- 1. Changement de traversée : appliqué tout de suite ------------------------------------------

CREATE OR REPLACE FUNCTION public.bw_company_request_save(
  _user uuid, _request uuid, _departure uuid, _kind text, _proposed jsonb,
  _message text, _urgent boolean, _submit boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  dep record;
  existing public.bw_company_requests;
  clean jsonb;
  minutes int;
  new_vessel uuid;
  new_dep timestamptz;
  new_arr timestamptz;
  saved uuid;
  before jsonb;
  company_name text;
  note text := left(nullif(btrim(coalesce(_message, '')), ''), 500);
BEGIN
  SELECT d.id, d.company_id, d.departure_at, d.arrival_at, d.vessel_id, d.status::text AS status
    INTO dep FROM public.departures d WHERE d.id = _departure FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, dep.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF dep.departure_at <= now() THEN RAISE EXCEPTION 'BW_DEPARTURE_PAST'; END IF;
  IF dep.status = 'cancelled' THEN RAISE EXCEPTION 'BW_DEPARTURE_CANCELLED'; END IF;

  -- Contenu de la demande, vérifié champ par champ.
  IF _kind = 'delay' THEN
    minutes := CASE WHEN coalesce(_proposed->>'minutes', '') ~ '^\d{1,4}$' THEN (_proposed->>'minutes')::int END;
    IF minutes IS NULL OR minutes < 5 OR minutes > 1440 THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    clean := jsonb_build_object('minutes', minutes);
  ELSIF _kind = 'cancel' THEN
    clean := '{}'::jsonb;
  ELSIF _kind = 'vessel' THEN
    new_vessel := CASE WHEN coalesce(_proposed->>'vessel_id', '') ~ '^[0-9a-f-]{36}$' THEN (_proposed->>'vessel_id')::uuid END;
    IF new_vessel IS NULL OR new_vessel IS NOT DISTINCT FROM dep.vessel_id
       OR NOT EXISTS (SELECT 1 FROM public.vessels v WHERE v.id = new_vessel AND v.company_id = dep.company_id) THEN
      RAISE EXCEPTION 'BW_INVALID';
    END IF;
    clean := jsonb_build_object('vessel_id', new_vessel);
  ELSIF _kind = 'time' THEN
    BEGIN
      new_dep := (_proposed->>'departure_at')::timestamptz;
      new_arr := nullif(_proposed->>'arrival_at', '')::timestamptz;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'BW_INVALID';
    END;
    IF new_dep IS NULL OR new_dep <= now() OR new_dep = dep.departure_at
       OR (new_arr IS NOT NULL AND new_arr <= new_dep)
       OR abs(extract(epoch FROM new_dep - dep.departure_at)) > 7 * 86400 THEN
      RAISE EXCEPTION 'BW_INVALID';
    END IF;
    clean := jsonb_build_object('departure_at', new_dep, 'arrival_at', new_arr);
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;

  IF _request IS NOT NULL THEN
    SELECT * INTO existing FROM public.bw_company_requests WHERE id = _request FOR UPDATE;
    IF NOT FOUND OR existing.company_id <> dep.company_id THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
    IF existing.status <> 'draft' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  END IF;

  -- Limites : 6 changements par traversée et 40 par compagnie sur 24 heures.
  IF _submit THEN
    PERFORM pg_advisory_xact_lock(hashtext('bw_company_request:' || dep.company_id::text));
    IF (SELECT count(*) FROM public.bw_company_requests
        WHERE departure_id = dep.id AND status = 'applied' AND decided_at > now() - interval '1 day') >= 6
       OR (SELECT count(*) FROM public.bw_company_requests
           WHERE company_id = dep.company_id AND status = 'applied' AND decided_at > now() - interval '1 day') >= 40 THEN
      RAISE EXCEPTION 'BW_LIMIT';
    END IF;
  END IF;

  IF _request IS NULL THEN
    INSERT INTO public.bw_company_requests (company_id, departure_id, kind, proposed, message, urgent, created_by)
    VALUES (dep.company_id, dep.id, _kind, clean, note, false, _user)
    RETURNING id INTO saved;
    PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'created',
      jsonb_build_object('kind', _kind));
  ELSE
    UPDATE public.bw_company_requests
       SET departure_id = dep.id, kind = _kind, proposed = clean, message = note,
           urgent = false, updated_at = now()
     WHERE id = _request;
    saved := _request;
    PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'edited',
      jsonb_build_object('kind', _kind));
  END IF;

  IF NOT _submit THEN
    RETURN jsonb_build_object('id', saved, 'status', 'draft');
  END IF;

  -- Application immédiate. La source reste lisible : l'import la reconnaît et ne l'écrase pas.
  before := private.bw_departure_snapshot(dep.id);
  SELECT name INTO company_name FROM public.companies WHERE id = dep.company_id;
  UPDATE public.departures SET
    status = CASE WHEN _kind = 'cancel' THEN 'cancelled'::public.departure_status
                  ELSE 'modified'::public.departure_status END,
    departure_at = CASE
      WHEN _kind = 'delay' THEN dep.departure_at + make_interval(mins => minutes)
      WHEN _kind = 'time' THEN new_dep
      ELSE dep.departure_at END,
    arrival_at = CASE
      WHEN _kind = 'delay' THEN dep.arrival_at + make_interval(mins => minutes)
      WHEN _kind = 'time' THEN coalesce(new_arr, dep.arrival_at + (new_dep - dep.departure_at))
      ELSE dep.arrival_at END,
    vessel_id = CASE WHEN _kind = 'vessel' THEN new_vessel ELSE dep.vessel_id END,
    reliability = 'verified',
    source_name = left('Compagnie — ' || coalesce(company_name, '') || ' (espace compagnie)', 200),
    last_verified_at = now(),
    verified_by = _user
  WHERE id = dep.id;

  UPDATE public.bw_company_requests
     SET status = 'applied', submitted_at = now(), snapshot = before,
         decided_by = _user, decided_at = now(), updated_at = now()
   WHERE id = saved;
  PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'applied',
    jsonb_build_object('kind', _kind, 'before', before, 'after', private.bw_departure_snapshot(dep.id)));
  RETURN jsonb_build_object('id', saved, 'status', 'applied');
END $$;

-- 2. Annonce : envoyée tout de suite ------------------------------------------------------------

-- Appelée par le serveur, après bw_company_announcement_save (brouillon) et le calcul des
-- destinataires par le serveur. Le titre « Information de [Compagnie] » est composé ici.
CREATE OR REPLACE FUNCTION public.bw_company_announcement_send(
  _user uuid, _id uuid, _audience jsonb, _label text, _url text, _valid_until timestamptz,
  _reachable integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a public.bw_company_announcements;
  dep record;
  created uuid;
  signed text;
BEGIN
  SELECT * INTO a FROM public.bw_company_announcements WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, a.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF a.status = 'approved' AND a.message_id IS NOT NULL THEN
    RETURN jsonb_build_object('messageId', a.message_id, 'already', true);
  END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  IF _audience->>'kind' <> 'departure' OR _audience->>'departureId' IS DISTINCT FROM a.departure_id::text THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF _reachable IS NULL OR _reachable < 1 THEN RAISE EXCEPTION 'BW_NO_AUDIENCE'; END IF;
  SELECT d.departure_at INTO dep FROM public.departures d WHERE d.id = a.departure_id;
  IF NOT FOUND OR dep.departure_at <= now() THEN RAISE EXCEPTION 'BW_DEPARTURE_PAST'; END IF;

  -- Limites : 3 annonces par traversée et 15 par compagnie sur 24 heures.
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_announce:' || a.company_id::text));
  IF (SELECT count(*) FROM public.bw_company_announcements
      WHERE departure_id = a.departure_id AND status = 'approved' AND decided_at > now() - interval '1 day') >= 3
     OR (SELECT count(*) FROM public.bw_company_announcements
         WHERE company_id = a.company_id AND status = 'approved' AND decided_at > now() - interval '1 day') >= 15 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;

  SELECT left('Information de ' || c.name, 80) INTO signed FROM public.companies c WHERE c.id = a.company_id;
  INSERT INTO public.bw_admin_messages
    (audience, audience_label, category, template, title, body, url, scheduled_at, status, created_by, valid_until)
  VALUES (_audience, left(coalesce(_label, ''), 200), 'reminders', 'free', signed, a.body,
          coalesce(nullif(_url, ''), '/'), now(), 'scheduled', _user, _valid_until)
  RETURNING id INTO created;
  UPDATE public.bw_company_announcements
     SET status = 'approved', message_id = created, preview_count = _reachable, urgent = false,
         submitted_at = now(), decided_by = _user, decided_at = now(), updated_at = now()
   WHERE id = a.id;
  PERFORM private.bw_company_event(a.company_id, 'announcement', a.id, _user, 'sent',
    jsonb_build_object('reachable', _reachable));
  RETURN jsonb_build_object('messageId', created, 'already', false);
END $$;

-- 3. Réponse à un avis ou à un signalement : publiée tout de suite ------------------------------

CREATE OR REPLACE FUNCTION public.bw_company_reply_save(
  _user uuid, _company uuid, _target_kind text, _target uuid, _kind text, _body text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  clean text := btrim(coalesce(_body, ''));
  created public.bw_company_replies;
BEGIN
  IF NOT private.bw_company_access(_user, _company, 'operations') THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _target_kind NOT IN ('entity_review', 'vessel_review', 'alert') OR _kind NOT IN ('reply', 'contest')
     OR (_kind = 'contest' AND _target_kind <> 'alert') OR char_length(clean) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  -- L'avis ou le signalement doit concerner cette compagnie ou l'un de ses navires.
  IF private.bw_company_target_company(_target_kind, _target) IS DISTINCT FROM _company THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_reply:' || _company::text));
  IF (SELECT count(*) FROM public.bw_company_replies
      WHERE company_id = _company AND created_at > now() - interval '1 day') >= 50 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  -- Une nouvelle version remplace la précédente (en attente ou déjà publiée).
  UPDATE public.bw_company_replies SET status = 'withdrawn', updated_at = now()
   WHERE company_id = _company AND target_kind = _target_kind AND target_id = _target
     AND kind = _kind AND status = 'submitted';
  IF _kind = 'reply' THEN
    UPDATE public.bw_company_replies SET status = 'replaced', updated_at = now()
     WHERE company_id = _company AND target_kind = _target_kind AND target_id = _target
       AND kind = 'reply' AND status = 'published';
    INSERT INTO public.bw_company_replies (company_id, target_kind, target_id, kind, body, created_by,
      status, published_at)
    VALUES (_company, _target_kind, _target, 'reply', clean, _user, 'published', now())
    RETURNING * INTO created;
  ELSE
    -- Contestation : toujours examinée par BledWay, jamais publiée.
    INSERT INTO public.bw_company_replies (company_id, target_kind, target_id, kind, body, created_by)
    VALUES (_company, _target_kind, _target, 'contest', clean, _user)
    RETURNING * INTO created;
  END IF;
  PERFORM private.bw_company_event(_company, 'reply', created.id, _user,
    CASE WHEN _kind = 'contest' THEN 'contest_submitted' ELSE 'published' END,
    jsonb_build_object('target_kind', _target_kind, 'target_id', _target));
  RETURN jsonb_build_object('id', created.id, 'status', created.status);
END $$;

-- 4. Fiche : corrections appliquées tout de suite ----------------------------------------------

CREATE OR REPLACE FUNCTION public.bw_company_profile_propose(
  _user uuid, _company uuid, _changes jsonb, _message text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current jsonb;
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
  created public.bw_company_profile_proposals;
BEGIN
  IF NOT private.bw_company_access(_user, _company, 'operations') THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _changes IS NULL OR jsonb_typeof(_changes) <> 'object' OR _changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  PERFORM 1 FROM public.companies WHERE id = _company FOR UPDATE;
  current := private.bw_company_profile_fields(_company);
  FOR k IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT current ? k OR jsonb_typeof(_changes -> k) <> 'string' THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    v := btrim(_changes ->> k);
    IF v <> '' AND (
         (k = 'description' AND char_length(v) > 1000)
      OR (k IN ('website_url', 'booking_url', 'contact_url', 'claims_url')
          AND (char_length(v) > 300 OR v !~ '^https://[^\s/]+\.[^\s]+$'))
      OR (k = 'phone' AND v !~ '^\+?[0-9 ().-]{6,40}$')
      OR (k = 'contact_email' AND (char_length(v) > 255 OR v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'))
    ) THEN
      RAISE EXCEPTION 'BW_INVALID';
    END IF;
    IF coalesce(current ->> k, '') <> v THEN
      clean := clean || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  IF clean = '{}'::jsonb THEN RAISE EXCEPTION 'BW_NO_CHANGE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_profile:' || _company::text));
  IF (SELECT count(*) FROM public.bw_company_profile_proposals
      WHERE company_id = _company AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  UPDATE public.bw_company_profile_proposals SET status = 'withdrawn', updated_at = now()
   WHERE company_id = _company AND status = 'submitted';
  UPDATE public.companies SET
    description   = CASE WHEN clean ? 'description'   THEN nullif(clean ->> 'description', '')   ELSE description END,
    website_url   = CASE WHEN clean ? 'website_url'   THEN nullif(clean ->> 'website_url', '')   ELSE website_url END,
    booking_url   = CASE WHEN clean ? 'booking_url'   THEN nullif(clean ->> 'booking_url', '')   ELSE booking_url END,
    contact_url   = CASE WHEN clean ? 'contact_url'   THEN nullif(clean ->> 'contact_url', '')   ELSE contact_url END,
    claims_url    = CASE WHEN clean ? 'claims_url'    THEN nullif(clean ->> 'claims_url', '')    ELSE claims_url END,
    phone         = CASE WHEN clean ? 'phone'         THEN nullif(clean ->> 'phone', '')         ELSE phone END,
    contact_email = CASE WHEN clean ? 'contact_email' THEN nullif(clean ->> 'contact_email', '') ELSE contact_email END,
    updated_at = now()
  WHERE id = _company;
  -- L'historique garde l'état d'avant (snapshot) : BledWay peut revenir en arrière depuis l'admin.
  INSERT INTO public.bw_company_profile_proposals (company_id, changes, snapshot, message, created_by,
    status, decided_by, decided_at)
  VALUES (_company, clean, current, left(nullif(btrim(coalesce(_message, '')), ''), 500), _user,
    'applied', _user, now())
  RETURNING * INTO created;
  PERFORM private.bw_company_event(_company, 'profile', created.id, _user, 'applied',
    jsonb_build_object('fields', (SELECT jsonb_agg(x) FROM jsonb_object_keys(clean) x)));
  RETURN jsonb_build_object('id', created.id, 'changes', clean, 'status', 'applied');
END $$;

-- 5. Photo : publiée tout de suite --------------------------------------------------------------

-- Appelée par le serveur, après le filtre de contenu explicite et la copie du fichier dans
-- l'espace public (bledway-galeries). Le chemin doit désigner un fichier réellement présent.
CREATE OR REPLACE FUNCTION public.bw_company_photo_publish(
  _user uuid, _company uuid, _vessel uuid, _id uuid, _path text, _caption text, _credit text,
  _rights boolean, _width integer, _height integer, _bytes integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_photo:' || _company::text));
  PERFORM public.bw_company_photo_check(_user, _company, _vessel);
  IF _id IS NULL OR _rights IS NOT TRUE OR _path IS DISTINCT FROM (_company::text || '/' || _id::text || '.jpg')
     OR char_length(btrim(coalesce(_caption, ''))) NOT BETWEEN 3 AND 200
     OR char_length(coalesce(_credit, '')) > 120 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-galeries' AND o.name = _path) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  -- 30 photos publiées par compagnie sur 24 heures.
  IF (SELECT count(*) FROM public.bw_company_photos
      WHERE company_id = _company AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  INSERT INTO public.bw_company_photos (id, company_id, vessel_id, pending_path, public_path, caption, credit,
    rights_declared, width, height, bytes, created_by, status, published_at)
  VALUES (_id, _company, _vessel, _path, _path, btrim(_caption), nullif(btrim(coalesce(_credit, '')), ''),
    true, _width, _height, _bytes, _user, 'published', now());
  PERFORM private.bw_company_event(_company, 'photo', _id, _user, 'published',
    jsonb_build_object('vessel_id', _vessel));
  RETURN jsonb_build_object('id', _id, 'status', 'published');
END $$;

-- 6. Droits : serveur uniquement ----------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.bw_company_request_save(uuid, uuid, uuid, text, jsonb, text, boolean, boolean),
  public.bw_company_announcement_send(uuid, uuid, jsonb, text, text, timestamptz, integer),
  public.bw_company_reply_save(uuid, uuid, text, uuid, text, text),
  public.bw_company_profile_propose(uuid, uuid, jsonb, text),
  public.bw_company_photo_publish(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_request_save(uuid, uuid, uuid, text, jsonb, text, boolean, boolean),
  public.bw_company_announcement_send(uuid, uuid, jsonb, text, text, timestamptz, integer),
  public.bw_company_reply_save(uuid, uuid, text, uuid, text, text),
  public.bw_company_profile_propose(uuid, uuid, jsonb, text),
  public.bw_company_photo_publish(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
