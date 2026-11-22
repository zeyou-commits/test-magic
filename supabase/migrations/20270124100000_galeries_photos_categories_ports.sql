-- BledWay · Galeries photos : catégories, photos de ports, dépôt direct par l'équipe (22/11/2026).
--
-- - Chaque photo a une catégorie (extérieur, cabines, restauration… ; pour un port : gare
--   maritime, embarquement, parking…), affichée en filtres sur les fiches publiques.
-- - L'équipe BledWay (administrateur, éditeur, selon les rubriques Navires, Ports ou Compagnies)
--   publie directement des photos sur la fiche d'un navire, d'une compagnie ou d'un port.
--   Une photo d'équipe est marquée source = 'team' ; la compagnie la voit sans pouvoir la retirer.
-- - Les ports ont désormais leur galerie (port_id), réservée à l'équipe.
-- - Galerie d'une compagnie : 24 photos de la compagnie au plus (12 avant), les photos de
--   l'équipe ne comptent pas.
--
-- Aucune donnée n'est effacée ni modifiée : les photos existantes prennent la catégorie « autre »
-- et la source « company ». Le fichier peut être rejoué sans effet de bord.
BEGIN;

-- 1. Table ---------------------------------------------------------------------------------------

ALTER TABLE public.bw_company_photos ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.bw_company_photos
  ADD COLUMN IF NOT EXISTS port_id uuid REFERENCES public.ports(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'company';

ALTER TABLE public.bw_company_photos DROP CONSTRAINT IF EXISTS bw_company_photos_category_check;
ALTER TABLE public.bw_company_photos ADD CONSTRAINT bw_company_photos_category_check
  CHECK (category IN ('exterior', 'decks', 'cabins', 'food', 'vehicles', 'kids', 'access',
                      'view', 'terminal', 'boarding', 'parking', 'services', 'other'));
ALTER TABLE public.bw_company_photos DROP CONSTRAINT IF EXISTS bw_company_photos_source_check;
ALTER TABLE public.bw_company_photos ADD CONSTRAINT bw_company_photos_source_check
  CHECK (source IN ('company', 'team'));
-- Une photo de port ne concerne ni un navire ni une compagnie ; une photo de compagnie a toujours
-- sa compagnie ; une photo d'équipe désigne au moins un navire, une compagnie ou un port.
ALTER TABLE public.bw_company_photos DROP CONSTRAINT IF EXISTS bw_company_photos_target_check;
ALTER TABLE public.bw_company_photos ADD CONSTRAINT bw_company_photos_target_check
  CHECK ((port_id IS NULL OR (vessel_id IS NULL AND company_id IS NULL AND source = 'team'))
     AND (source = 'team' OR company_id IS NOT NULL)
     AND (company_id IS NOT NULL OR vessel_id IS NOT NULL OR port_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS bw_company_photos_port ON public.bw_company_photos (port_id)
  WHERE status = 'published' AND port_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bw_company_photos_vessel ON public.bw_company_photos (vessel_id)
  WHERE status = 'published' AND vessel_id IS NOT NULL;

-- Catégories admises selon la cible.
CREATE OR REPLACE FUNCTION private.bw_gallery_category_ok(_category text, _port boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN _port
    THEN _category IN ('view', 'terminal', 'boarding', 'parking', 'services', 'other')
    ELSE _category IN ('exterior', 'decks', 'cabins', 'food', 'vehicles', 'kids', 'access', 'other')
  END;
$$;
REVOKE ALL ON FUNCTION private.bw_gallery_category_ok(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bw_gallery_category_ok(text, boolean) TO service_role;

-- 2. Côté compagnie --------------------------------------------------------------------------------

-- Contrôle avant envoi : 24 photos de la compagnie par galerie (celles de l'équipe ne comptent pas).
CREATE OR REPLACE FUNCTION public.bw_company_photo_check(_user uuid, _company uuid, _vessel uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_access(_user, _company, 'operations') THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF _vessel IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vessels WHERE id = _vessel AND company_id = _company
  ) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF (SELECT count(*) FROM public.bw_company_photos WHERE company_id = _company AND source = 'company'
        AND vessel_id IS NOT DISTINCT FROM _vessel AND status IN ('pending', 'published')) >= 24
     OR (SELECT count(*) FROM public.bw_company_photos
         WHERE company_id = _company AND status = 'pending') >= 20 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
END $$;

-- Publication directe avec catégorie (l'ancienne version sans catégorie reste pour les pages
-- encore ouvertes sur l'ancien site ; elle range la photo en « autre »).
CREATE OR REPLACE FUNCTION public.bw_company_photo_publish(
  _user uuid, _company uuid, _vessel uuid, _id uuid, _path text, _caption text, _credit text,
  _rights boolean, _width integer, _height integer, _bytes integer, _category text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_photo:' || _company::text));
  PERFORM public.bw_company_photo_check(_user, _company, _vessel);
  IF _id IS NULL OR _rights IS NOT TRUE OR _path IS DISTINCT FROM (_company::text || '/' || _id::text || '.jpg')
     OR char_length(btrim(coalesce(_caption, ''))) NOT BETWEEN 3 AND 200
     OR char_length(coalesce(_credit, '')) > 120
     OR NOT private.bw_gallery_category_ok(coalesce(_category, ''), false) THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-galeries' AND o.name = _path) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  -- 30 photos publiées par compagnie sur 24 heures.
  IF (SELECT count(*) FROM public.bw_company_photos
      WHERE company_id = _company AND source = 'company' AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  INSERT INTO public.bw_company_photos (id, company_id, vessel_id, pending_path, public_path, caption, credit,
    rights_declared, width, height, bytes, created_by, status, published_at, category, source)
  VALUES (_id, _company, _vessel, _path, _path, btrim(_caption), nullif(btrim(coalesce(_credit, '')), ''),
    true, _width, _height, _bytes, _user, 'published', now(), _category, 'company');
  PERFORM private.bw_company_event(_company, 'photo', _id, _user, 'published',
    jsonb_build_object('vessel_id', _vessel, 'category', _category));
  RETURN jsonb_build_object('id', _id, 'status', 'published');
END $$;

-- Retirer une photo : seulement celles de la compagnie (une photo de l'équipe se retire par l'équipe).
CREATE OR REPLACE FUNCTION public.bw_company_photo_withdraw(_user uuid, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ph public.bw_company_photos;
BEGIN
  SELECT * INTO ph FROM public.bw_company_photos WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR ph.company_id IS NULL
     OR NOT private.bw_company_access(_user, ph.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF ph.source <> 'company' THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF ph.status NOT IN ('pending', 'published') THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  UPDATE public.bw_company_photos SET status = 'withdrawn', updated_at = now() WHERE id = _id;
  PERFORM private.bw_company_event(ph.company_id, 'photo', ph.id, _user, 'withdrawn',
    jsonb_build_object('was', ph.status));
  RETURN jsonb_build_object('pendingPath', ph.pending_path, 'publicPath', ph.public_path);
END $$;

-- Fiche de la compagnie : les photos portent leur catégorie et leur source.
CREATE OR REPLACE FUNCTION public.bw_company_profile(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (private.bw_company_access(_user, _company, 'read')
          OR private.bw_company_staff_ok(_user, ARRAY['admin', 'editor'])) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'fields', private.bw_company_profile_fields(_company),
    'proposals', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'changes', x.changes, 'message', x.message,
        'status', x.status, 'createdAt', x.created_at, 'decidedAt', x.decided_at,
        'decisionNote', x.decision_note) ORDER BY x.created_at DESC)
      FROM (SELECT * FROM public.bw_company_profile_proposals WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 20) x
    ), '[]'::jsonb),
    'photos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', ph.id, 'vesselId', ph.vessel_id, 'vesselName', v.name,
        'caption', ph.caption, 'credit', ph.credit, 'status', ph.status,
        'category', ph.category, 'source', ph.source,
        'pendingPath', CASE WHEN ph.status = 'pending' THEN ph.pending_path END,
        'publicPath', CASE WHEN ph.status = 'published' THEN ph.public_path END,
        'width', ph.width, 'height', ph.height, 'createdAt', ph.created_at,
        'decidedAt', ph.decided_at, 'decisionNote', ph.decision_note) ORDER BY ph.created_at DESC)
      FROM (SELECT * FROM public.bw_company_photos WHERE company_id = _company
              AND (status IN ('pending', 'published') OR created_at > now() - interval '60 days')
            ORDER BY created_at DESC LIMIT 200) ph
      LEFT JOIN public.vessels v ON v.id = ph.vessel_id
    ), '[]'::jsonb),
    'fleet', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name) ORDER BY v.name)
      FROM public.vessels v WHERE v.company_id = _company
    ), '[]'::jsonb)
  );
END $$;

-- 3. Côté équipe BledWay -------------------------------------------------------------------------

-- Publier une photo sur la fiche d'un navire, d'une compagnie ou d'un port. Le serveur a déjà
-- passé le filtre de contenu explicite et déposé le fichier dans l'espace public.
CREATE OR REPLACE FUNCTION public.bw_team_photo_publish(
  _actor uuid, _company uuid, _vessel uuid, _port uuid, _id uuid, _path text, _category text,
  _caption text, _credit text, _rights boolean, _width integer, _height integer, _bytes integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner uuid := _company;
  tabs text[];
BEGIN
  -- Exactement une cible : un port, ou un navire, ou une compagnie.
  IF num_nonnulls(_company, _vessel, _port) <> 1 THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
  tabs := CASE WHEN _port IS NOT NULL THEN ARRAY['ports']
               WHEN _vessel IS NOT NULL THEN ARRAY['vessels']
               ELSE ARRAY['companies'] END;
  IF NOT private.bw_staff_can_for(_actor, ARRAY['admin', 'editor'], tabs) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF _port IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ports WHERE id = _port)
     OR _company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF _vessel IS NOT NULL THEN
    SELECT company_id INTO owner FROM public.vessels WHERE id = _vessel;
    IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  END IF;
  IF _id IS NULL OR _rights IS NOT TRUE OR _path IS DISTINCT FROM ('team/' || _id::text || '.jpg')
     OR char_length(btrim(coalesce(_caption, ''))) NOT BETWEEN 3 AND 200
     OR char_length(coalesce(_credit, '')) > 120
     OR NOT private.bw_gallery_category_ok(coalesce(_category, ''), _port IS NOT NULL) THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-galeries' AND o.name = _path) THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_team_photo:' || coalesce(_port, _vessel, _company)::text));
  -- 60 photos par fiche, et 60 envois par membre de l'équipe sur 24 heures.
  IF (SELECT count(*) FROM public.bw_company_photos WHERE status = 'published'
        AND CASE WHEN _port IS NOT NULL THEN port_id = _port
                 WHEN _vessel IS NOT NULL THEN vessel_id = _vessel
                 ELSE company_id = _company AND vessel_id IS NULL AND port_id IS NULL END) >= 60
     OR (SELECT count(*) FROM public.bw_company_photos
         WHERE source = 'team' AND created_by = _actor AND created_at > now() - interval '1 day') >= 60 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  INSERT INTO public.bw_company_photos (id, company_id, vessel_id, port_id, pending_path, public_path,
    caption, credit, rights_declared, width, height, bytes, created_by, status, published_at,
    category, source)
  VALUES (_id, CASE WHEN _port IS NULL THEN owner END, _vessel, _port, _path, _path,
    btrim(_caption), nullif(btrim(coalesce(_credit, '')), ''), true, _width, _height, _bytes,
    _actor, 'published', now(), _category, 'team');
  RETURN jsonb_build_object('id', _id, 'status', 'published');
END $$;

-- Retirer une photo publiée (de l'équipe, ou d'une compagnie avec un motif qu'elle verra).
-- Renvoie le fichier que le serveur doit effacer.
CREATE OR REPLACE FUNCTION public.bw_team_photo_remove(_actor uuid, _id uuid, _note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ph public.bw_company_photos;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
BEGIN
  SELECT * INTO ph FROM public.bw_company_photos WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF NOT private.bw_staff_can_for(_actor, ARRAY['admin', 'editor'],
       CASE WHEN ph.port_id IS NOT NULL THEN ARRAY['ports']
            WHEN ph.vessel_id IS NOT NULL THEN ARRAY['vessels']
            ELSE ARRAY['companies'] END) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  IF ph.status <> 'published' THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  IF ph.source = 'company' AND note IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
  UPDATE public.bw_company_photos
     SET status = 'removed', decided_by = _actor, decided_at = now(), decision_note = note,
         updated_at = now()
   WHERE id = _id;
  IF ph.source = 'company' THEN
    PERFORM private.bw_company_event(ph.company_id, 'photo', ph.id, _actor, 'removed',
      jsonb_build_object('note', note));
  END IF;
  RETURN jsonb_build_object('status', 'removed', 'publicPath', ph.public_path);
END $$;

-- 4. Lecture publique --------------------------------------------------------------------------

-- Galerie publiée d'une compagnie (navire NULL) ou d'un navire, photos de l'équipe comprises.
CREATE OR REPLACE FUNCTION public.bw_company_gallery(_company uuid, _vessel uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.public_path,
    'caption', ph.caption, 'credit', ph.credit, 'width', ph.width, 'height', ph.height,
    'category', ph.category, 'source', ph.source,
    'companyName', c.name) ORDER BY ph.published_at DESC), '[]'::jsonb)
  FROM public.bw_company_photos ph LEFT JOIN public.companies c ON c.id = ph.company_id
  WHERE ph.status = 'published'
    AND ((_vessel IS NULL AND _company IS NOT NULL AND ph.company_id = _company
          AND ph.vessel_id IS NULL AND ph.port_id IS NULL)
         OR (_vessel IS NOT NULL AND ph.vessel_id = _vessel));
$$;

-- Galerie publiée d'un port (photos de l'équipe).
CREATE OR REPLACE FUNCTION public.bw_port_gallery(_port uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.public_path,
    'caption', ph.caption, 'credit', ph.credit, 'width', ph.width, 'height', ph.height,
    'category', ph.category, 'source', ph.source) ORDER BY ph.published_at DESC), '[]'::jsonb)
  FROM public.bw_company_photos ph
  WHERE ph.status = 'published' AND _port IS NOT NULL AND ph.port_id = _port;
$$;

-- 5. File de l'équipe : seulement les photos des compagnies (copie de la version en place).
CREATE OR REPLACE FUNCTION public.bw_company_desk_queue(_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  replies_ok boolean := private.bw_company_staff_ok(_actor, ARRAY['admin', 'moderator']);
  editorial_ok boolean := private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']);
BEGIN
  IF NOT (replies_ok OR editorial_ok) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'replies', CASE WHEN replies_ok THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'companyId', r.company_id, 'companyName', c.name, 'targetKind', r.target_kind,
        'targetId', r.target_id, 'kind', r.kind, 'body', r.body, 'status', r.status,
        'createdAt', r.created_at, 'decidedAt', r.decided_at, 'decisionNote', r.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), u.email),
        'targetStillThere', private.bw_company_target_company(r.target_kind, r.target_id) = r.company_id,
        'target', CASE r.target_kind
          WHEN 'entity_review' THEN (SELECT jsonb_build_object('scores', er.published_scores,
              'vesselName', v.name, 'date', er.published_at)
            FROM public.bw_entity_reviews er LEFT JOIN public.vessels v ON v.id = er.vessel_id WHERE er.id = r.target_id)
          WHEN 'vessel_review' THEN (SELECT jsonb_build_object('score', vr.score, 'comment', vr.comment,
              'vesselName', v.name, 'date', vr.created_at)
            FROM public.bw_vessel_reviews vr JOIN public.vessels v ON v.id = vr.vessel_id WHERE vr.id = r.target_id)
          ELSE (SELECT jsonb_build_object('category', a.category, 'delayMinutes', a.delay_minutes,
              'detail', a.detail, 'vesselName', v.name, 'date', a.created_at, 'resolved', a.resolved)
            FROM public.bw_travel_alerts a JOIN public.vessels v ON v.id = a.target_id WHERE a.id = r.target_id)
        END
      ) ORDER BY (r.status <> 'submitted'), coalesce(r.decided_at, r.created_at) DESC)
      FROM (SELECT * FROM public.bw_company_replies
            WHERE status IN ('submitted', 'published')
               OR (status IN ('refused', 'acknowledged', 'removed') AND decided_at > now() - interval '30 days')
            ORDER BY coalesce(decided_at, created_at) DESC LIMIT 200) r
      JOIN public.companies c ON c.id = r.company_id
      LEFT JOIN auth.users u ON u.id = r.created_by
      LEFT JOIN public.profiles p ON p.id = r.created_by
    ), '[]'::jsonb) END,
    'profiles', CASE WHEN editorial_ok THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'companyId', x.company_id, 'companyName', c.name, 'changes', x.changes,
        'snapshot', x.snapshot, 'current', private.bw_company_profile_fields(x.company_id),
        'message', x.message, 'status', x.status, 'createdAt', x.created_at,
        'decidedAt', x.decided_at, 'decisionNote', x.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), u.email)
      ) ORDER BY (x.status <> 'submitted'), coalesce(x.decided_at, x.created_at) DESC)
      FROM (SELECT * FROM public.bw_company_profile_proposals
            WHERE status = 'submitted' OR (status IN ('applied', 'refused', 'stale') AND decided_at > now() - interval '30 days')
            ORDER BY coalesce(decided_at, created_at) DESC LIMIT 100) x
      JOIN public.companies c ON c.id = x.company_id
      LEFT JOIN auth.users u ON u.id = x.created_by
      LEFT JOIN public.profiles p ON p.id = x.created_by
    ), '[]'::jsonb) END,
    'photos', CASE WHEN editorial_ok THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ph.id, 'companyId', ph.company_id, 'companyName', c.name, 'vesselId', ph.vessel_id,
        'vesselName', v.name, 'caption', ph.caption, 'credit', ph.credit, 'status', ph.status,
        'pendingPath', CASE WHEN ph.status = 'pending' THEN ph.pending_path END,
        'publicPath', CASE WHEN ph.status = 'published' THEN ph.public_path END,
        'width', ph.width, 'height', ph.height, 'bytes', ph.bytes, 'createdAt', ph.created_at,
        'decidedAt', ph.decided_at, 'decisionNote', ph.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), u.email)
      ) ORDER BY (ph.status <> 'pending'), coalesce(ph.decided_at, ph.created_at) DESC)
      FROM (SELECT * FROM public.bw_company_photos
            WHERE source = 'company' AND (status IN ('pending', 'published')
               OR (status IN ('refused', 'removed') AND decided_at > now() - interval '30 days'))
            ORDER BY coalesce(decided_at, created_at) DESC LIMIT 200) ph
      JOIN public.companies c ON c.id = ph.company_id
      LEFT JOIN public.vessels v ON v.id = ph.vessel_id
      LEFT JOIN auth.users u ON u.id = ph.created_by
      LEFT JOIN public.profiles p ON p.id = ph.created_by
    ), '[]'::jsonb) END,
    'pending', jsonb_build_object(
      'replies', CASE WHEN replies_ok THEN (SELECT count(*) FROM public.bw_company_replies WHERE status = 'submitted') ELSE 0 END,
      'profiles', CASE WHEN editorial_ok THEN (SELECT count(*) FROM public.bw_company_profile_proposals WHERE status = 'submitted') ELSE 0 END,
      'photos', CASE WHEN editorial_ok THEN (SELECT count(*) FROM public.bw_company_photos WHERE status = 'pending') ELSE 0 END
    )
  );
END $function$;

-- Décision sur une photo de compagnie (copie de la version en place + garde sur la source).
CREATE OR REPLACE FUNCTION public.bw_company_photo_decide(_actor uuid, _id uuid, _decision text, _note text, _public_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  ph public.bw_company_photos;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
  next_status text;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO ph FROM public.bw_company_photos WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  -- Les photos de l'équipe se retirent par bw_team_photo_remove.
  IF ph.source <> 'company' THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
  IF _decision = 'publish' AND ph.status = 'pending' THEN
    IF _public_path IS DISTINCT FROM ph.pending_path THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    next_status := 'published';
  ELSIF _decision = 'refuse' AND ph.status = 'pending' AND note IS NOT NULL THEN
    next_status := 'refused';
  ELSIF _decision = 'remove' AND ph.status = 'published' AND note IS NOT NULL THEN
    next_status := 'removed';
  ELSIF ph.status NOT IN ('pending', 'published') THEN
    RAISE EXCEPTION 'BW_CLOSED';
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  UPDATE public.bw_company_photos
     SET status = next_status, decided_by = _actor, decided_at = now(), decision_note = note,
         public_path = CASE WHEN next_status = 'published' THEN _public_path ELSE public_path END,
         published_at = CASE WHEN next_status = 'published' THEN now() ELSE published_at END,
         updated_at = now()
   WHERE id = _id;
  PERFORM private.bw_company_event(ph.company_id, 'photo', ph.id, _actor, next_status,
    jsonb_build_object('note', note));
  RETURN jsonb_build_object('status', next_status, 'pendingPath', ph.pending_path,
                            'publicPath', CASE WHEN next_status = 'removed' THEN ph.public_path END);
END $function$;

-- 6. Droits : serveur uniquement, sauf les lectures publiques ----------------------------------

REVOKE ALL ON FUNCTION
  public.bw_company_photo_check(uuid, uuid, uuid),
  public.bw_company_photo_publish(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, text),
  public.bw_company_photo_withdraw(uuid, uuid),
  public.bw_company_profile(uuid, uuid),
  public.bw_team_photo_publish(uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean, integer, integer, integer),
  public.bw_team_photo_remove(uuid, uuid, text),
  public.bw_company_desk_queue(uuid),
  public.bw_company_photo_decide(uuid, uuid, text, text, text),
  public.bw_company_gallery(uuid, uuid),
  public.bw_port_gallery(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_photo_check(uuid, uuid, uuid),
  public.bw_company_photo_publish(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, text),
  public.bw_company_photo_withdraw(uuid, uuid),
  public.bw_company_profile(uuid, uuid),
  public.bw_team_photo_publish(uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean, integer, integer, integer),
  public.bw_team_photo_remove(uuid, uuid, text),
  public.bw_company_desk_queue(uuid),
  public.bw_company_photo_decide(uuid, uuid, text, text, text),
  public.bw_company_gallery(uuid, uuid),
  public.bw_port_gallery(uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.bw_company_gallery(uuid, uuid), public.bw_port_gallery(uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
