-- BledWay · Espace compagnie, lot 2 : demandes de modification de traversée et annonces.
-- Prérequis : script du lot 1 (20270110100000_espace_compagnie_acces.sql).
--
-- Circuit (décisions B et C) :
-- - Une compagnie (niveau Opérations) prépare une demande : brouillon, puis envoi à BledWay.
--   L'équipe (administrateur ou éditeur) l'applique ou la refuse avec un motif. Une demande dont
--   la traversée a changé ou est passée depuis l'envoi devient « périmée » et n'est pas appliquée.
-- - Une annonce vise les voyageurs qui suivent une traversée de la compagnie. Un administrateur
--   la relit ; à l'approbation, un message est créé dans bw_admin_messages (circuit d'envoi
--   existant), une seule fois par annonce. La compagnie ne voit que des nombres.
-- - Journal bw_company_request_events : lisible par la compagnie, jamais modifiable par elle.
-- - Les fonctions déduisent la compagnie de la traversée : un company_id venu du navigateur
--   n'est jamais utilisé.
-- Script relançable ; aucun droit élargi sur l'existant ; aucune fonction existante modifiée.

BEGIN;

-- 1. Tables ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bw_company_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('delay', 'cancel', 'vessel', 'time')),
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  urgent boolean NOT NULL DEFAULT false,
  -- Traversée telle qu'elle était à l'envoi : sert à détecter une demande périmée.
  snapshot jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'applied', 'refused', 'stale', 'withdrawn')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_company_requests_company ON public.bw_company_requests (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_company_requests_open ON public.bw_company_requests (status) WHERE status = 'submitted';

CREATE TABLE IF NOT EXISTS public.bw_company_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('delay', 'vessel_change', 'boarding', 'other')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 280),
  urgent boolean NOT NULL DEFAULT false,
  -- Nombre de comptes joignables calculé par le serveur à l'envoi (jamais une liste).
  preview_count integer CHECK (preview_count IS NULL OR preview_count >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'refused', 'stale', 'withdrawn')),
  message_id uuid UNIQUE REFERENCES public.bw_admin_messages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_company_announcements_company ON public.bw_company_announcements (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bw_company_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('request', 'announcement')),
  item_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) <= 40),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_company_request_events_company ON public.bw_company_request_events (company_id, created_at DESC);

ALTER TABLE public.bw_company_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_company_requests, public.bw_company_announcements, public.bw_company_request_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bw_company_requests, public.bw_company_announcements TO service_role;
-- Journal : le serveur ajoute des lignes, personne ne les modifie ni ne les efface.
-- Supabase donne d'office tous les droits au rôle serveur sur une nouvelle table : on les retire.
REVOKE UPDATE, DELETE, TRUNCATE ON public.bw_company_request_events FROM service_role;
GRANT SELECT, INSERT ON public.bw_company_request_events TO service_role;

-- 2. Aides privées -----------------------------------------------------------------------------

-- Membre de l'équipe BledWay au compte actif, avec l'un des rôles donnés.
CREATE OR REPLACE FUNCTION private.bw_company_staff_ok(_actor uuid, _roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = _actor AND r.role::text = ANY(_roles)
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
$$;

CREATE OR REPLACE FUNCTION private.bw_company_event(
  _company uuid, _kind text, _item uuid, _actor uuid, _action text, _details jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.bw_company_request_events (company_id, item_kind, item_id, actor_id, action, details)
  VALUES (_company, _kind, _item, _actor, left(_action, 40), coalesce(_details, '{}'::jsonb));
$$;

-- État d'une traversée tel qu'il compte pour une demande.
CREATE OR REPLACE FUNCTION private.bw_departure_snapshot(_departure uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('departure_at', d.departure_at, 'arrival_at', d.arrival_at,
                            'vessel_id', d.vessel_id, 'status', d.status::text)
  FROM public.departures d WHERE d.id = _departure;
$$;

REVOKE ALL ON FUNCTION private.bw_company_staff_ok(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_company_event(uuid, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_departure_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bw_company_staff_ok(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_event(uuid, text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_departure_snapshot(uuid) TO service_role;

-- 3. Côté compagnie ----------------------------------------------------------------------------

-- Traversée de la compagnie, à venir, pour une action du niveau demandé.
-- Renvoie l'identifiant de la compagnie ; refuse sinon.
CREATE OR REPLACE FUNCTION public.bw_company_departure_check(_user uuid, _departure uuid, _min text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE d record;
BEGIN
  SELECT dep.id, dep.company_id, dep.departure_at, dep.status::text AS status, c.name
    INTO d
    FROM public.departures dep JOIN public.companies c ON c.id = dep.company_id
   WHERE dep.id = _departure;
  IF NOT FOUND OR NOT private.bw_company_access(_user, d.company_id, _min) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF d.departure_at <= now() THEN RAISE EXCEPTION 'BW_DEPARTURE_PAST'; END IF;
  RETURN jsonb_build_object('companyId', d.company_id, 'companyName', d.name, 'status', d.status);
END $$;

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
  -- Une seule demande en attente par traversée et par sujet.
  IF _submit AND EXISTS (
    SELECT 1 FROM public.bw_company_requests
    WHERE departure_id = dep.id AND kind = _kind AND status = 'submitted'
      AND id IS DISTINCT FROM _request
  ) THEN
    RAISE EXCEPTION 'BW_DUPLICATE';
  END IF;

  IF _request IS NULL THEN
    INSERT INTO public.bw_company_requests (company_id, departure_id, kind, proposed, message, urgent, created_by)
    VALUES (dep.company_id, dep.id, _kind, clean, note, coalesce(_urgent, false), _user)
    RETURNING id INTO saved;
    PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'created',
      jsonb_build_object('kind', _kind));
  ELSE
    UPDATE public.bw_company_requests
       SET departure_id = dep.id, kind = _kind, proposed = clean, message = note,
           urgent = coalesce(_urgent, false), updated_at = now()
     WHERE id = _request;
    saved := _request;
    PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'edited',
      jsonb_build_object('kind', _kind));
  END IF;

  IF _submit THEN
    UPDATE public.bw_company_requests
       SET status = 'submitted', submitted_at = now(), updated_at = now(),
           snapshot = private.bw_departure_snapshot(dep.id)
     WHERE id = saved;
    PERFORM private.bw_company_event(dep.company_id, 'request', saved, _user, 'submitted',
      jsonb_build_object('kind', _kind, 'urgent', coalesce(_urgent, false)));
  END IF;
  RETURN jsonb_build_object('id', saved, 'status', CASE WHEN _submit THEN 'submitted' ELSE 'draft' END);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_request_withdraw(_user uuid, _request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.bw_company_requests;
BEGIN
  SELECT * INTO r FROM public.bw_company_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, r.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF r.status NOT IN ('draft', 'submitted') THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  UPDATE public.bw_company_requests SET status = 'withdrawn', updated_at = now() WHERE id = _request;
  PERFORM private.bw_company_event(r.company_id, 'request', r.id, _user, 'withdrawn', '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_announcement_save(
  _user uuid, _id uuid, _departure uuid, _reason text, _body text, _urgent boolean,
  _submit boolean, _preview_count integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  dep record;
  existing public.bw_company_announcements;
  saved uuid;
  text_body text := btrim(coalesce(_body, ''));
BEGIN
  SELECT d.id, d.company_id, d.departure_at, d.status::text AS status
    INTO dep FROM public.departures d WHERE d.id = _departure;
  IF NOT FOUND OR NOT private.bw_company_access(_user, dep.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF dep.departure_at <= now() THEN RAISE EXCEPTION 'BW_DEPARTURE_PAST'; END IF;
  IF _reason NOT IN ('delay', 'vessel_change', 'boarding', 'other')
     OR char_length(text_body) NOT BETWEEN 10 AND 280 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF _submit AND (_preview_count IS NULL OR _preview_count < 1) THEN RAISE EXCEPTION 'BW_NO_AUDIENCE'; END IF;
  IF _id IS NOT NULL THEN
    SELECT * INTO existing FROM public.bw_company_announcements WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR existing.company_id <> dep.company_id THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
    IF existing.status <> 'draft' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
    UPDATE public.bw_company_announcements
       SET departure_id = dep.id, reason = _reason, body = text_body,
           urgent = coalesce(_urgent, false), updated_at = now()
     WHERE id = _id;
    saved := _id;
    PERFORM private.bw_company_event(dep.company_id, 'announcement', saved, _user, 'edited', '{}'::jsonb);
  ELSE
    INSERT INTO public.bw_company_announcements (company_id, departure_id, reason, body, urgent, created_by)
    VALUES (dep.company_id, dep.id, _reason, text_body, coalesce(_urgent, false), _user)
    RETURNING id INTO saved;
    PERFORM private.bw_company_event(dep.company_id, 'announcement', saved, _user, 'created',
      jsonb_build_object('reason', _reason));
  END IF;
  IF _submit THEN
    UPDATE public.bw_company_announcements
       SET status = 'submitted', submitted_at = now(), preview_count = _preview_count, updated_at = now()
     WHERE id = saved;
    PERFORM private.bw_company_event(dep.company_id, 'announcement', saved, _user, 'submitted',
      jsonb_build_object('reachable', _preview_count, 'urgent', coalesce(_urgent, false)));
  END IF;
  RETURN jsonb_build_object('id', saved, 'status', CASE WHEN _submit THEN 'submitted' ELSE 'draft' END);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_announcement_withdraw(_user uuid, _id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.bw_company_announcements;
BEGIN
  SELECT * INTO a FROM public.bw_company_announcements WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, a.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF a.status NOT IN ('draft', 'submitted') THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  UPDATE public.bw_company_announcements SET status = 'withdrawn', updated_at = now() WHERE id = _id;
  PERFORM private.bw_company_event(a.company_id, 'announcement', a.id, _user, 'withdrawn', '{}'::jsonb);
END $$;

-- Activité d'une compagnie (lecture) : demandes, annonces avec leur nombre de destinataires,
-- journal. Les personnes de BledWay apparaissent sous le nom « BledWay ».
CREATE OR REPLACE FUNCTION public.bw_company_activity(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (private.bw_company_access(_user, _company, 'read')
          OR private.bw_company_staff_ok(_user, ARRAY['admin', 'editor'])) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'departureId', r.departure_id, 'kind', r.kind, 'proposed', r.proposed,
        'message', r.message, 'urgent', r.urgent, 'status', r.status, 'createdAt', r.created_at,
        'submittedAt', r.submitted_at, 'decidedAt', r.decided_at, 'decisionNote', r.decision_note,
        'departureAt', d.departure_at, 'routeId', d.route_id, 'vesselId', d.vessel_id
      ) ORDER BY r.created_at DESC)
      FROM (SELECT * FROM public.bw_company_requests WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 100) r
      LEFT JOIN public.departures d ON d.id = r.departure_id
    ), '[]'::jsonb),
    'announcements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'departureId', a.departure_id, 'reason', a.reason, 'body', a.body,
        'urgent', a.urgent, 'status', a.status, 'previewCount', a.preview_count,
        'createdAt', a.created_at, 'submittedAt', a.submitted_at, 'decidedAt', a.decided_at,
        'decisionNote', a.decision_note, 'departureAt', d.departure_at, 'routeId', d.route_id,
        'delivery', m.status, 'recipients', m.recipients
      ) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.bw_company_announcements WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 100) a
      LEFT JOIN public.departures d ON d.id = a.departure_id
      LEFT JOIN public.bw_admin_messages m ON m.id = a.message_id
    ), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'itemKind', e.item_kind, 'itemId', e.item_id, 'action', e.action, 'at', e.created_at,
        'by', CASE
          WHEN EXISTS (SELECT 1 FROM public.bw_company_members m
                       WHERE m.user_id = e.actor_id AND m.company_id = _company)
            THEN coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1))
          ELSE 'BledWay' END
      ) ORDER BY e.created_at DESC)
      FROM (SELECT * FROM public.bw_company_request_events WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 80) e
      LEFT JOIN auth.users u ON u.id = e.actor_id
      LEFT JOIN public.profiles p ON p.id = e.actor_id
    ), '[]'::jsonb)
  );
END $$;

-- 4. Côté équipe BledWay -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bw_company_queue(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'companyId', r.company_id, 'companyName', c.name, 'departureId', r.departure_id,
        'kind', r.kind, 'proposed', r.proposed, 'message', r.message, 'urgent', r.urgent,
        'status', r.status, 'snapshot', r.snapshot, 'current', private.bw_departure_snapshot(r.departure_id),
        'routeId', d.route_id, 'submittedAt', r.submitted_at, 'decidedAt', r.decided_at,
        'decisionNote', r.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), u.email),
        'stale', r.status = 'submitted' AND (d.id IS NULL OR d.departure_at <= now()
                 OR private.bw_departure_snapshot(r.departure_id) IS DISTINCT FROM r.snapshot)
      ) ORDER BY (r.status <> 'submitted'), r.urgent DESC, coalesce(r.decided_at, r.submitted_at) DESC)
      FROM (SELECT * FROM public.bw_company_requests
            WHERE status = 'submitted' OR (status IN ('applied', 'refused', 'stale') AND decided_at > now() - interval '30 days')
            ORDER BY coalesce(decided_at, submitted_at) DESC LIMIT 200) r
      JOIN public.companies c ON c.id = r.company_id
      LEFT JOIN public.departures d ON d.id = r.departure_id
      LEFT JOIN auth.users u ON u.id = r.created_by
      LEFT JOIN public.profiles p ON p.id = r.created_by
    ), '[]'::jsonb),
    'announcements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'companyId', a.company_id, 'companyName', c.name, 'departureId', a.departure_id,
        'reason', a.reason, 'body', a.body, 'urgent', a.urgent, 'status', a.status,
        'previewCount', a.preview_count, 'routeId', d.route_id, 'departureAt', d.departure_at,
        'submittedAt', a.submitted_at, 'decidedAt', a.decided_at, 'decisionNote', a.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), u.email),
        'messageId', a.message_id, 'delivery', m.status, 'recipients', m.recipients, 'lastError', m.last_error,
        'stale', a.status = 'submitted' AND (d.id IS NULL OR d.departure_at <= now())
      ) ORDER BY (a.status <> 'submitted'), a.urgent DESC, coalesce(a.decided_at, a.submitted_at) DESC)
      FROM (SELECT * FROM public.bw_company_announcements
            WHERE status = 'submitted' OR (status IN ('approved', 'refused', 'stale') AND decided_at > now() - interval '30 days')
            ORDER BY coalesce(decided_at, submitted_at) DESC LIMIT 200) a
      JOIN public.companies c ON c.id = a.company_id
      LEFT JOIN public.departures d ON d.id = a.departure_id
      LEFT JOIN public.bw_admin_messages m ON m.id = a.message_id
      LEFT JOIN auth.users u ON u.id = a.created_by
      LEFT JOIN public.profiles p ON p.id = a.created_by
    ), '[]'::jsonb),
    'pending', jsonb_build_object(
      'requests', (SELECT count(*) FROM public.bw_company_requests WHERE status = 'submitted'),
      'announcements', (SELECT count(*) FROM public.bw_company_announcements WHERE status = 'submitted'),
      'urgent', (SELECT count(*) FROM public.bw_company_requests WHERE status = 'submitted' AND urgent)
              + (SELECT count(*) FROM public.bw_company_announcements WHERE status = 'submitted' AND urgent)
    )
  );
END $$;

-- Appliquer ou refuser une demande. Une demande périmée n'est jamais appliquée.
CREATE OR REPLACE FUNCTION public.bw_company_request_decide(
  _actor uuid, _request uuid, _decision text, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.bw_company_requests;
  dep public.departures;
  company_name text;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
  shift interval;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.bw_company_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  IF _decision = 'refuse' THEN
    IF note IS NULL OR char_length(note) < 3 THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_requests
       SET status = 'refused', decided_by = _actor, decided_at = now(), decision_note = note, updated_at = now()
     WHERE id = r.id;
    PERFORM private.bw_company_event(r.company_id, 'request', r.id, _actor, 'refused', jsonb_build_object('note', note));
    RETURN jsonb_build_object('result', 'refused');
  END IF;
  IF _decision <> 'apply' THEN RAISE EXCEPTION 'BW_INVALID'; END IF;

  SELECT * INTO dep FROM public.departures WHERE id = r.departure_id FOR UPDATE;
  IF NOT FOUND OR dep.departure_at <= now() OR dep.company_id <> r.company_id
     OR private.bw_departure_snapshot(dep.id) IS DISTINCT FROM r.snapshot THEN
    UPDATE public.bw_company_requests
       SET status = 'stale', decided_by = _actor, decided_at = now(),
           decision_note = coalesce(note, 'La traversée a changé ou est passée depuis l''envoi.'), updated_at = now()
     WHERE id = r.id;
    PERFORM private.bw_company_event(r.company_id, 'request', r.id, _actor, 'stale', '{}'::jsonb);
    RETURN jsonb_build_object('result', 'stale');
  END IF;

  SELECT name INTO company_name FROM public.companies WHERE id = r.company_id;
  -- Source lisible : l'import la reconnaît et ne l'écrase pas sans le dire.
  UPDATE public.departures SET
    status = CASE WHEN r.kind = 'cancel' THEN 'cancelled'::public.departure_status
                  ELSE 'modified'::public.departure_status END,
    departure_at = CASE
      WHEN r.kind = 'delay' THEN dep.departure_at + make_interval(mins => (r.proposed->>'minutes')::int)
      WHEN r.kind = 'time' THEN (r.proposed->>'departure_at')::timestamptz
      ELSE dep.departure_at END,
    arrival_at = CASE
      WHEN r.kind = 'delay' THEN dep.arrival_at + make_interval(mins => (r.proposed->>'minutes')::int)
      WHEN r.kind = 'time' THEN coalesce(nullif(r.proposed->>'arrival_at', '')::timestamptz,
                                         dep.arrival_at + ((r.proposed->>'departure_at')::timestamptz - dep.departure_at))
      ELSE dep.arrival_at END,
    vessel_id = CASE WHEN r.kind = 'vessel' THEN (r.proposed->>'vessel_id')::uuid ELSE dep.vessel_id END,
    reliability = 'verified',
    source_name = left('Compagnie — ' || coalesce(company_name, '') || ' (validé par BledWay)', 200),
    last_verified_at = now(),
    verified_by = _actor
  WHERE id = dep.id;

  UPDATE public.bw_company_requests
     SET status = 'applied', decided_by = _actor, decided_at = now(), decision_note = note, updated_at = now()
   WHERE id = r.id;
  PERFORM private.bw_company_event(r.company_id, 'request', r.id, _actor, 'applied',
    jsonb_build_object('before', r.snapshot, 'after', private.bw_departure_snapshot(dep.id)));
  RETURN jsonb_build_object('result', 'applied');
END $$;

-- Approuver une annonce : crée le message une seule fois (rejouable sans doublon).
-- Le serveur fournit l'audience calculée par lui ; le titre « Information de [Compagnie] » est
-- composé ici et ne peut pas être changé. L'envoi suit le circuit existant.
CREATE OR REPLACE FUNCTION public.bw_company_announcement_approve(
  _actor uuid, _id uuid, _audience jsonb, _label text, _url text, _valid_until timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a public.bw_company_announcements;
  dep record;
  created uuid;
  signed text;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO a FROM public.bw_company_announcements WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF a.status = 'approved' AND a.message_id IS NOT NULL THEN
    RETURN jsonb_build_object('messageId', a.message_id, 'already', true);
  END IF;
  IF a.status <> 'submitted' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  IF _audience->>'kind' <> 'departure' OR _audience->>'departureId' <> a.departure_id::text THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  SELECT d.departure_at INTO dep FROM public.departures d WHERE d.id = a.departure_id;
  IF NOT FOUND OR dep.departure_at <= now() THEN
    UPDATE public.bw_company_announcements
       SET status = 'stale', decided_by = _actor, decided_at = now(),
           decision_note = 'La traversée est passée avant la relecture.', updated_at = now()
     WHERE id = a.id;
    PERFORM private.bw_company_event(a.company_id, 'announcement', a.id, _actor, 'stale', '{}'::jsonb);
    RETURN jsonb_build_object('stale', true);
  END IF;
  SELECT left('Information de ' || c.name, 80) INTO signed FROM public.companies c WHERE c.id = a.company_id;
  INSERT INTO public.bw_admin_messages
    (audience, audience_label, category, template, title, body, url, scheduled_at, status, created_by, valid_until)
  VALUES (_audience, left(coalesce(_label, ''), 200), 'reminders', 'free', signed, a.body,
          coalesce(nullif(_url, ''), '/'), now(), 'scheduled', _actor, _valid_until)
  RETURNING id INTO created;
  UPDATE public.bw_company_announcements
     SET status = 'approved', message_id = created, decided_by = _actor, decided_at = now(), updated_at = now()
   WHERE id = a.id;
  PERFORM private.bw_company_event(a.company_id, 'announcement', a.id, _actor, 'approved', '{}'::jsonb);
  RETURN jsonb_build_object('messageId', created, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_announcement_refuse(_actor uuid, _id uuid, _note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a public.bw_company_announcements;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF note IS NULL OR char_length(note) < 3 THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
  SELECT * INTO a FROM public.bw_company_announcements WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF a.status <> 'submitted' THEN RAISE EXCEPTION 'BW_LOCKED'; END IF;
  UPDATE public.bw_company_announcements
     SET status = 'refused', decided_by = _actor, decided_at = now(), decision_note = note, updated_at = now()
   WHERE id = a.id;
  PERFORM private.bw_company_event(a.company_id, 'announcement', a.id, _actor, 'refused', jsonb_build_object('note', note));
END $$;

-- 5. Droits : serveur uniquement --------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.bw_company_departure_check(uuid, uuid, text),
  public.bw_company_request_save(uuid, uuid, uuid, text, jsonb, text, boolean, boolean),
  public.bw_company_request_withdraw(uuid, uuid),
  public.bw_company_announcement_save(uuid, uuid, uuid, text, text, boolean, boolean, integer),
  public.bw_company_announcement_withdraw(uuid, uuid),
  public.bw_company_activity(uuid, uuid),
  public.bw_company_queue(uuid),
  public.bw_company_request_decide(uuid, uuid, text, text),
  public.bw_company_announcement_approve(uuid, uuid, jsonb, text, text, timestamptz),
  public.bw_company_announcement_refuse(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_departure_check(uuid, uuid, text),
  public.bw_company_request_save(uuid, uuid, uuid, text, jsonb, text, boolean, boolean),
  public.bw_company_request_withdraw(uuid, uuid),
  public.bw_company_announcement_save(uuid, uuid, uuid, text, text, boolean, boolean, integer),
  public.bw_company_announcement_withdraw(uuid, uuid),
  public.bw_company_activity(uuid, uuid),
  public.bw_company_queue(uuid),
  public.bw_company_request_decide(uuid, uuid, text, text),
  public.bw_company_announcement_approve(uuid, uuid, jsonb, text, text, timestamptz),
  public.bw_company_announcement_refuse(uuid, uuid, text)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
