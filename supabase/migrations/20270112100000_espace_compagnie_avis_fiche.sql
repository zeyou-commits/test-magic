-- BledWay · Espace compagnie, lot 3 : réponses aux avis et aux signalements, propositions de
-- fiche, galeries photos relues et responsable de compagnie.
-- Prérequis : lots 1 (accès) et 2 (demandes et annonces) installés.
-- Principe : tout passe par le serveur (rôle service_role) ; chaque fonction revérifie le compte,
-- la compagnie et le niveau à chaque appel. Rien n'est publié sans relecture de l'équipe BledWay.
-- Un avis ou un signalement n'est jamais masqué, noté ni effacé par une compagnie.
-- Le script peut être relancé : il ne crée que ce qui manque et remplace ses propres fonctions.

BEGIN;

-- 1. Tables ------------------------------------------------------------------------------------

-- Réponse publique d'une compagnie à un avis ou à un signalement, ou contestation d'un signalement
-- (adressée à BledWay, jamais publiée, ne supprime rien).
CREATE TABLE IF NOT EXISTS public.bw_company_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('entity_review', 'vessel_review', 'alert')),
  target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reply', 'contest')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'published', 'acknowledged', 'refused', 'withdrawn', 'replaced', 'removed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  published_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'reply' OR target_kind = 'alert'),
  CHECK (kind = 'reply' OR status NOT IN ('published', 'replaced', 'removed')),
  CHECK (kind = 'contest' OR status <> 'acknowledged')
);
CREATE INDEX IF NOT EXISTS bw_company_replies_company ON public.bw_company_replies (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_company_replies_target ON public.bw_company_replies (target_kind, target_id) WHERE status = 'published';
-- Une seule réponse en attente par avis ou signalement (la nouvelle remplace l'ancienne).
CREATE UNIQUE INDEX IF NOT EXISTS bw_company_replies_open
  ON public.bw_company_replies (company_id, target_kind, target_id, kind) WHERE status = 'submitted';

-- Proposition de correction de la fiche publique : appliquée seulement après relecture.
CREATE TABLE IF NOT EXISTS public.bw_company_profile_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'applied', 'refused', 'stale', 'withdrawn')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bw_company_profile_proposals_company ON public.bw_company_profile_proposals (company_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bw_company_profile_proposals_open
  ON public.bw_company_profile_proposals (company_id) WHERE status = 'submitted';

-- Photo informative (galerie de la compagnie, ou d'un de ses navires si vessel_id est rempli).
CREATE TABLE IF NOT EXISTS public.bw_company_photos (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  pending_path text NOT NULL CHECK (char_length(pending_path) <= 200),
  public_path text CHECK (public_path IS NULL OR char_length(public_path) <= 200),
  caption text NOT NULL CHECK (char_length(btrim(caption)) BETWEEN 3 AND 200),
  credit text CHECK (credit IS NULL OR char_length(credit) <= 120),
  -- La compagnie déclare détenir les droits de diffusion : sans cette case, pas de photo.
  rights_declared boolean NOT NULL CHECK (rights_declared),
  width integer NOT NULL CHECK (width BETWEEN 200 AND 4000),
  height integer NOT NULL CHECK (height BETWEEN 200 AND 4000),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 2097152),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'refused', 'withdrawn', 'removed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  published_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR public_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS bw_company_photos_company ON public.bw_company_photos (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bw_company_photos_public ON public.bw_company_photos (company_id, vessel_id) WHERE status = 'published';

ALTER TABLE public.bw_company_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_profile_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_company_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_company_replies, public.bw_company_profile_proposals, public.bw_company_photos
  FROM PUBLIC, anon, authenticated;
-- Supabase donne d'office tous les droits au rôle serveur sur une nouvelle table : on les fixe.
-- Rien n'est effacé : les lignes changent seulement d'état.
REVOKE ALL ON public.bw_company_replies, public.bw_company_profile_proposals, public.bw_company_photos
  FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.bw_company_replies, public.bw_company_profile_proposals,
  public.bw_company_photos TO service_role;

-- Le journal du lot 2 accueille les nouveaux types d'éléments.
ALTER TABLE public.bw_company_request_events DROP CONSTRAINT IF EXISTS bw_company_request_events_item_kind_check;
ALTER TABLE public.bw_company_request_events ADD CONSTRAINT bw_company_request_events_item_kind_check
  CHECK (item_kind IN ('request', 'announcement', 'reply', 'profile', 'photo'));

-- Responsable de compagnie : un collaborateur « Opérations » désigné par un administrateur BledWay.
ALTER TABLE public.bw_company_members ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

-- Repasser en Lecture ou retirer l'accès retire aussi le rôle de responsable.
CREATE OR REPLACE FUNCTION private.bw_company_member_manager_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_manager AND (NEW.level <> 'operations' OR NEW.status = 'revoked') THEN
    NEW.is_manager := false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_company_member_manager_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bw_company_member_manager_guard ON public.bw_company_members;
CREATE TRIGGER bw_company_member_manager_guard BEFORE INSERT OR UPDATE ON public.bw_company_members
  FOR EACH ROW EXECUTE FUNCTION private.bw_company_member_manager_guard();

-- 2. Espaces de stockage des photos ------------------------------------------------------------
-- « attente » est privé : seules les personnes qui relisent voient la photo, par lien temporaire.
-- « galeries » est public : une photo n'y est copiée qu'après relecture.
-- Aucune règle d'accès pour les visiteurs : seul le serveur y dépose et y efface.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-galeries-attente', 'bledway-galeries-attente', false, 2097152, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg'];
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bledway-galeries', 'bledway-galeries', true, 2097152, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg'];

-- 3. Aides privées -----------------------------------------------------------------------------

-- Compagnie à laquelle se rattache un avis ou un signalement (NULL si aucune).
CREATE OR REPLACE FUNCTION private.bw_company_target_company(_kind text, _target uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE _kind
    WHEN 'entity_review' THEN (
      SELECT coalesce(r.company_id, v.company_id)
      FROM public.bw_entity_reviews r LEFT JOIN public.vessels v ON v.id = r.vessel_id
      WHERE r.id = _target AND r.status = 'published' AND r.target_kind IN ('company', 'vessel'))
    WHEN 'vessel_review' THEN (
      SELECT v.company_id FROM public.bw_vessel_reviews r JOIN public.vessels v ON v.id = r.vessel_id
      WHERE r.id = _target AND r.status = 'published')
    WHEN 'alert' THEN (
      SELECT v.company_id FROM public.bw_travel_alerts a JOIN public.vessels v ON v.id = a.target_id
      WHERE a.id = _target AND a.target_kind = 'vessel' AND a.created_at > now() - interval '30 days')
  END;
$$;

-- Responsable actif de la compagnie (en plus de l'accès « Opérations » vérifié à chaque appel).
CREATE OR REPLACE FUNCTION private.bw_company_manager(_user uuid, _company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.bw_company_access(_user, _company, 'operations') AND EXISTS (
    SELECT 1 FROM public.bw_company_members m
    WHERE m.user_id = _user AND m.company_id = _company AND m.status = 'active' AND m.is_manager
  );
$$;

-- Champs de la fiche publique qu'une compagnie peut proposer de corriger.
CREATE OR REPLACE FUNCTION private.bw_company_profile_fields(_company uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('description', c.description, 'website_url', c.website_url,
    'booking_url', c.booking_url, 'contact_url', c.contact_url, 'claims_url', c.claims_url,
    'phone', c.phone, 'contact_email', c.contact_email)
  FROM public.companies c WHERE c.id = _company;
$$;

REVOKE ALL ON FUNCTION private.bw_company_target_company(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_company_manager(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bw_company_profile_fields(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bw_company_target_company(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_manager(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.bw_company_profile_fields(uuid) TO service_role;

-- 4. Côté compagnie : avis, signalements, réponses ---------------------------------------------

-- Tout ce que la compagnie voit dans « Avis », « Signalements » et « Fiche publique ».
-- Aucune identité de voyageur n'est transmise.
CREATE OR REPLACE FUNCTION public.bw_company_feedback(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (private.bw_company_access(_user, _company, 'read')
          OR private.bw_company_staff_ok(_user, ARRAY['admin', 'editor', 'moderator'])) THEN
    RAISE EXCEPTION 'BW_FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'reviews', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object('kind', 'entity_review', 'id', r.id, 'targetKind', r.target_kind,
          'vesselId', r.vessel_id, 'vesselName', v.name, 'scores', r.published_scores,
          'comment', NULL, 'date', coalesce(r.published_at, r.created_at)) x
        FROM public.bw_entity_reviews r LEFT JOIN public.vessels v ON v.id = r.vessel_id
        WHERE r.status = 'published' AND (r.company_id = _company OR v.company_id = _company)
        ORDER BY coalesce(r.published_at, r.created_at) DESC LIMIT 100
      ) e
    ), '[]'::jsonb) || coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object('kind', 'vessel_review', 'id', r.id, 'targetKind', 'vessel',
          'vesselId', r.vessel_id, 'vesselName', v.name, 'score', r.score,
          'comment', nullif(btrim(r.comment), ''), 'date', r.created_at) x
        FROM public.bw_vessel_reviews r JOIN public.vessels v ON v.id = r.vessel_id
        WHERE r.status = 'published' AND v.company_id = _company
        ORDER BY r.created_at DESC LIMIT 100
      ) e
    ), '[]'::jsonb),
    'alerts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'alert', 'id', a.id, 'vesselId', a.target_id,
        'vesselName', v.name, 'category', a.category, 'delayMinutes', a.delay_minutes,
        'detail', a.detail, 'onSite', a.on_site, 'date', a.created_at, 'expiresAt', a.expires_at,
        'resolved', a.resolved, 'validated', a.validated_at IS NOT NULL)
        ORDER BY a.created_at DESC)
      FROM (SELECT a.* FROM public.bw_travel_alerts a JOIN public.vessels v ON v.id = a.target_id
            WHERE a.target_kind = 'vessel' AND v.company_id = _company
              AND a.created_at > now() - interval '30 days'
            ORDER BY a.created_at DESC LIMIT 150) a
      JOIN public.vessels v ON v.id = a.target_id
    ), '[]'::jsonb),
    'replies', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'targetKind', r.target_kind, 'targetId', r.target_id,
        'kind', r.kind, 'body', r.body, 'status', r.status, 'createdAt', r.created_at,
        'decidedAt', r.decided_at, 'decisionNote', r.decision_note,
        'author', coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)))
        ORDER BY r.created_at DESC)
      FROM (SELECT * FROM public.bw_company_replies WHERE company_id = _company
            ORDER BY created_at DESC LIMIT 300) r
      LEFT JOIN auth.users u ON u.id = r.created_by
      LEFT JOIN public.profiles p ON p.id = r.created_by
    ), '[]'::jsonb)
  );
END $$;

-- Proposer une réponse (publique après relecture) ou une contestation (pour BledWay seulement).
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
  -- Une nouvelle version remplace celle qui attendait encore d'être relue.
  UPDATE public.bw_company_replies SET status = 'withdrawn', updated_at = now()
   WHERE company_id = _company AND target_kind = _target_kind AND target_id = _target
     AND kind = _kind AND status = 'submitted';
  INSERT INTO public.bw_company_replies (company_id, target_kind, target_id, kind, body, created_by)
  VALUES (_company, _target_kind, _target, _kind, clean, _user)
  RETURNING * INTO created;
  PERFORM private.bw_company_event(_company, 'reply', created.id, _user,
    CASE WHEN _kind = 'contest' THEN 'contest_submitted' ELSE 'submitted' END,
    jsonb_build_object('target_kind', _target_kind, 'target_id', _target));
  RETURN jsonb_build_object('id', created.id, 'status', created.status);
END $$;

-- Retirer sa réponse (en attente ou publiée) ou sa contestation en attente.
CREATE OR REPLACE FUNCTION public.bw_company_reply_withdraw(_user uuid, _id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.bw_company_replies;
BEGIN
  SELECT * INTO r FROM public.bw_company_replies WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, r.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF r.status NOT IN ('submitted', 'published') THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  UPDATE public.bw_company_replies SET status = 'withdrawn', updated_at = now() WHERE id = _id;
  PERFORM private.bw_company_event(r.company_id, 'reply', r.id, _user, 'withdrawn',
    jsonb_build_object('was', r.status));
END $$;

-- 5. Côté compagnie : fiche publique -----------------------------------------------------------

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
        'pendingPath', CASE WHEN ph.status = 'pending' THEN ph.pending_path END,
        'publicPath', CASE WHEN ph.status = 'published' THEN ph.public_path END,
        'width', ph.width, 'height', ph.height, 'createdAt', ph.created_at,
        'decidedAt', ph.decided_at, 'decisionNote', ph.decision_note) ORDER BY ph.created_at DESC)
      FROM (SELECT * FROM public.bw_company_photos WHERE company_id = _company
              AND (status IN ('pending', 'published') OR created_at > now() - interval '60 days')
            ORDER BY created_at DESC LIMIT 120) ph
      LEFT JOIN public.vessels v ON v.id = ph.vessel_id
    ), '[]'::jsonb),
    'fleet', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name) ORDER BY v.name)
      FROM public.vessels v WHERE v.company_id = _company
    ), '[]'::jsonb)
  );
END $$;

-- Proposer des corrections. Une chaîne vide demande d'effacer le champ.
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
  INSERT INTO public.bw_company_profile_proposals (company_id, changes, snapshot, message, created_by)
  VALUES (_company, clean, current, left(nullif(btrim(coalesce(_message, '')), ''), 500), _user)
  RETURNING * INTO created;
  PERFORM private.bw_company_event(_company, 'profile', created.id, _user, 'submitted',
    jsonb_build_object('fields', (SELECT jsonb_agg(x) FROM jsonb_object_keys(clean) x)));
  RETURN jsonb_build_object('id', created.id, 'changes', clean);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_profile_withdraw(_user uuid, _id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE x public.bw_company_profile_proposals;
BEGIN
  SELECT * INTO x FROM public.bw_company_profile_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, x.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF x.status <> 'submitted' THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  UPDATE public.bw_company_profile_proposals SET status = 'withdrawn', updated_at = now() WHERE id = _id;
  PERFORM private.bw_company_event(x.company_id, 'profile', x.id, _user, 'withdrawn', '{}'::jsonb);
END $$;

-- 6. Côté compagnie : photos -------------------------------------------------------------------

-- Contrôle avant envoi : droits, navire de la compagnie, places restantes.
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
  -- 12 photos par galerie (publiées ou en attente) et 20 en attente par compagnie.
  IF (SELECT count(*) FROM public.bw_company_photos WHERE company_id = _company
        AND vessel_id IS NOT DISTINCT FROM _vessel AND status IN ('pending', 'published')) >= 12
     OR (SELECT count(*) FROM public.bw_company_photos
         WHERE company_id = _company AND status = 'pending') >= 20 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
END $$;

-- Enregistrer une photo déjà déposée par le serveur dans l'espace « attente ».
CREATE OR REPLACE FUNCTION public.bw_company_photo_add(
  _user uuid, _company uuid, _vessel uuid, _id uuid, _path text, _caption text, _credit text,
  _rights boolean, _width integer, _height integer, _bytes integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_photo:' || _company::text));
  PERFORM public.bw_company_photo_check(_user, _company, _vessel);
  IF _id IS NULL OR _rights IS NOT TRUE OR _path IS DISTINCT FROM (_company::text || '/' || _id::text || '.webp')
     AND _path IS DISTINCT FROM (_company::text || '/' || _id::text || '.jpg')
     OR char_length(btrim(coalesce(_caption, ''))) NOT BETWEEN 3 AND 200
     OR char_length(coalesce(_credit, '')) > 120 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  INSERT INTO public.bw_company_photos (id, company_id, vessel_id, pending_path, caption, credit,
    rights_declared, width, height, bytes, created_by)
  VALUES (_id, _company, _vessel, _path, btrim(_caption), nullif(btrim(coalesce(_credit, '')), ''),
    true, _width, _height, _bytes, _user);
  PERFORM private.bw_company_event(_company, 'photo', _id, _user, 'submitted',
    jsonb_build_object('vessel_id', _vessel));
  RETURN jsonb_build_object('id', _id);
END $$;

-- Retirer une photo. Renvoie les fichiers que le serveur doit effacer.
CREATE OR REPLACE FUNCTION public.bw_company_photo_withdraw(_user uuid, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ph public.bw_company_photos;
BEGIN
  SELECT * INTO ph FROM public.bw_company_photos WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_access(_user, ph.company_id, 'operations') THEN
    RAISE EXCEPTION 'BW_NOT_FOUND';
  END IF;
  IF ph.status NOT IN ('pending', 'published') THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  UPDATE public.bw_company_photos SET status = 'withdrawn', updated_at = now() WHERE id = _id;
  PERFORM private.bw_company_event(ph.company_id, 'photo', ph.id, _user, 'withdrawn',
    jsonb_build_object('was', ph.status));
  RETURN jsonb_build_object('pendingPath', ph.pending_path, 'publicPath', ph.public_path);
END $$;

-- 7. Côté compagnie : responsable --------------------------------------------------------------

-- Compagnies dont ce compte est responsable (pour afficher les outils d'équipe).
CREATE OR REPLACE FUNCTION public.bw_company_my_manager(_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(m.company_id), '[]'::jsonb)
  FROM public.bw_company_members m
  WHERE m.user_id = _user AND m.is_manager AND private.bw_company_manager(_user, m.company_id);
$$;

CREATE OR REPLACE FUNCTION public.bw_company_manager_overview(_user uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_manager(_user, _company) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)),
        'email', u.email, 'level', m.level, 'status', m.status, 'reason', m.status_reason,
        'manager', m.is_manager, 'since', m.granted_at, 'you', m.user_id = _user
      ) ORDER BY m.is_manager DESC, m.granted_at)
      FROM public.bw_company_members m
      JOIN auth.users u ON u.id = m.user_id
      LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.status <> 'revoked'
    ), '[]'::jsonb),
    'invites', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'level', i.level,
        'expiresAt', i.expires_at, 'createdAt', i.created_at) ORDER BY i.created_at DESC)
      FROM public.bw_company_invites i
      WHERE i.company_id = _company AND i.status = 'pending' AND i.expires_at > now()
    ), '[]'::jsonb)
  );
END $$;

-- Inviter un collaborateur (jamais un autre responsable). Même règle que l'invitation BledWay.
CREATE OR REPLACE FUNCTION public.bw_company_manager_invite(
  _user uuid, _company uuid, _email text, _level text, _token_hash text, _verification text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  clean text := lower(btrim(coalesce(_email, '')));
  existing uuid;
  created public.bw_company_invites;
BEGIN
  IF NOT private.bw_company_manager(_user, _company) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF clean !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(clean) > 255
     OR _level NOT IN ('read', 'operations') OR _token_hash !~ '^[0-9a-f]{64}$'
     OR char_length(btrim(coalesce(_verification, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw_company_access:' || _company::text));
  IF (SELECT count(*) FROM public.bw_company_invites
      WHERE company_id = _company AND created_by = _user AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'BW_LIMIT';
  END IF;
  SELECT u.id INTO existing FROM auth.users u WHERE lower(u.email) = clean AND u.deleted_at IS NULL LIMIT 1;
  IF existing IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bw_company_members
    WHERE company_id = _company AND user_id = existing AND status <> 'revoked'
  ) THEN
    RAISE EXCEPTION 'BW_ALREADY_MEMBER';
  END IF;
  UPDATE public.bw_company_invites
     SET status = 'revoked', revoked_by = _user, revoked_at = now(),
         revoke_reason = 'Remplacée par une nouvelle invitation'
   WHERE company_id = _company AND email = clean AND status = 'pending';
  INSERT INTO public.bw_company_invites
    (company_id, email, level, token_hash, verification, expires_at, created_by)
  VALUES (_company, clean, _level, _token_hash, btrim(_verification), now() + interval '7 days', _user)
  RETURNING * INTO created;
  PERFORM private.bw_company_log(_user, existing, 'company_invite_created', _company,
    jsonb_build_object('email', clean, 'level', _level, 'invite_id', created.id,
                       'verification', btrim(_verification), 'by_manager', true));
  RETURN jsonb_build_object('id', created.id, 'expiresAt', created.expires_at,
                            'existingAccount', existing IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.bw_company_manager_invite_revoke(_user uuid, _invite uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.bw_company_invites;
BEGIN
  SELECT * INTO inv FROM public.bw_company_invites WHERE id = _invite FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_manager(_user, inv.company_id) THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'BW_INVITE_CLOSED'; END IF;
  UPDATE public.bw_company_invites
     SET status = 'revoked', revoked_by = _user, revoked_at = now(), revoke_reason = 'Annulée par le responsable'
   WHERE id = _invite;
  PERFORM private.bw_company_log(_user, NULL, 'company_invite_revoked', inv.company_id,
    jsonb_build_object('email', inv.email, 'invite_id', inv.id, 'by_manager', true));
END $$;

-- Changer le niveau, suspendre, rétablir ou retirer un collaborateur de sa compagnie.
-- Jamais soi-même ni un autre responsable : cela reste à l'équipe BledWay.
CREATE OR REPLACE FUNCTION public.bw_company_manager_member(
  _user uuid, _member uuid, _change text, _level text, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.bw_company_members;
  why text := left(nullif(btrim(coalesce(_reason, '')), ''), 500);
BEGIN
  SELECT * INTO m FROM public.bw_company_members WHERE id = _member FOR UPDATE;
  IF NOT FOUND OR NOT private.bw_company_manager(_user, m.company_id) THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF m.user_id = _user OR m.is_manager THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  IF m.status = 'revoked' THEN RAISE EXCEPTION 'BW_MEMBER_REVOKED'; END IF;
  IF _change = 'level' THEN
    IF _level NOT IN ('read', 'operations') OR _level = m.level THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members SET level = _level, updated_at = now() WHERE id = _member;
  ELSIF _change IN ('suspend', 'revoke') THEN
    IF why IS NULL OR (_change = 'suspend' AND m.status <> 'active') THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members
       SET status = CASE WHEN _change = 'suspend' THEN 'suspended' ELSE 'revoked' END,
           status_reason = why, status_changed_by = _user, status_changed_at = now(), updated_at = now()
     WHERE id = _member;
  ELSIF _change = 'resume' THEN
    IF m.status <> 'suspended' THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    UPDATE public.bw_company_members
       SET status = 'active', status_reason = why, status_changed_by = _user,
           status_changed_at = now(), updated_at = now()
     WHERE id = _member;
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  PERFORM private.bw_company_log(_user, m.user_id, 'company_member_' || _change, m.company_id,
    jsonb_build_object('member_id', m.id, 'level', CASE WHEN _change = 'level' THEN _level ELSE m.level END,
                       'previous_level', m.level, 'reason', why, 'by_manager', true));
END $$;

-- 8. Côté équipe BledWay -----------------------------------------------------------------------

-- Désigner ou retirer un responsable (administrateurs seulement).
CREATE OR REPLACE FUNCTION public.bw_company_member_manager(
  _actor uuid, _member uuid, _on boolean, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.bw_company_members;
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO m FROM public.bw_company_members WHERE id = _member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF _on IS NULL OR _on = m.is_manager OR (_on AND (m.status <> 'active' OR m.level <> 'operations')) THEN
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  UPDATE public.bw_company_members SET is_manager = _on, updated_at = now() WHERE id = _member;
  PERFORM private.bw_company_log(_actor, m.user_id,
    CASE WHEN _on THEN 'company_manager_on' ELSE 'company_manager_off' END, m.company_id,
    jsonb_build_object('member_id', m.id, 'reason', left(nullif(btrim(coalesce(_reason, '')), ''), 500)));
END $$;

-- Responsables d'une compagnie, pour l'écran d'administration des accès.
CREATE OR REPLACE FUNCTION public.bw_company_managers(_actor uuid, _company uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_company_admin_ok(_actor) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  RETURN coalesce((SELECT jsonb_agg(m.id) FROM public.bw_company_members m
                   WHERE m.company_id = _company AND m.is_manager AND m.status <> 'revoked'), '[]'::jsonb);
END $$;

-- À relire : réponses et contestations (administrateurs, modérateurs), fiches et photos
-- (administrateurs, éditeurs). Chacun ne reçoit que ce que son rôle lui permet de décider.
CREATE OR REPLACE FUNCTION public.bw_company_desk_queue(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
            WHERE status IN ('pending', 'published')
               OR (status IN ('refused', 'removed') AND decided_at > now() - interval '30 days')
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
END $$;

-- Publier, refuser ou retirer une réponse ; prendre en compte ou refuser une contestation.
CREATE OR REPLACE FUNCTION public.bw_company_reply_decide(
  _actor uuid, _id uuid, _decision text, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.bw_company_replies;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
  next_status text;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'moderator']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.bw_company_replies WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF (_decision IN ('publish', 'acknowledge', 'refuse') AND r.status <> 'submitted')
     OR (_decision = 'remove' AND r.status <> 'published') THEN
    RAISE EXCEPTION 'BW_CLOSED';
  END IF;
  IF _decision = 'publish' AND r.kind = 'reply' AND r.status = 'submitted' THEN
    -- L'avis ou le signalement a pu être masqué ou expirer entre-temps.
    IF private.bw_company_target_company(r.target_kind, r.target_id) IS DISTINCT FROM r.company_id THEN
      RAISE EXCEPTION 'BW_STALE';
    END IF;
    UPDATE public.bw_company_replies SET status = 'replaced', updated_at = now()
     WHERE company_id = r.company_id AND target_kind = r.target_kind AND target_id = r.target_id
       AND kind = 'reply' AND status = 'published';
    next_status := 'published';
  ELSIF _decision = 'acknowledge' AND r.kind = 'contest' AND r.status = 'submitted' THEN
    next_status := 'acknowledged';
  ELSIF _decision = 'refuse' AND r.status = 'submitted' THEN
    IF note IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    next_status := 'refused';
  ELSIF _decision = 'remove' AND r.status = 'published' THEN
    IF note IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    next_status := 'removed';
  ELSIF r.status NOT IN ('submitted', 'published') THEN
    RAISE EXCEPTION 'BW_CLOSED';
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  UPDATE public.bw_company_replies
     SET status = next_status, decided_by = _actor, decided_at = now(), decision_note = note,
         published_at = CASE WHEN next_status = 'published' THEN now() ELSE published_at END,
         updated_at = now()
   WHERE id = _id;
  PERFORM private.bw_company_event(r.company_id, 'reply', r.id, _actor, next_status,
    jsonb_build_object('note', note));
  RETURN jsonb_build_object('status', next_status);
END $$;

-- Appliquer ou refuser une proposition. Si la fiche a changé depuis, elle est marquée « périmée ».
CREATE OR REPLACE FUNCTION public.bw_company_profile_decide(
  _actor uuid, _id uuid, _decision text, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  x public.bw_company_profile_proposals;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
  current jsonb;
  k text;
  next_status text;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO x FROM public.bw_company_profile_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
  IF x.status <> 'submitted' THEN RAISE EXCEPTION 'BW_CLOSED'; END IF;
  IF _decision = 'refuse' THEN
    IF note IS NULL THEN RAISE EXCEPTION 'BW_INVALID'; END IF;
    next_status := 'refused';
  ELSIF _decision = 'apply' THEN
    PERFORM 1 FROM public.companies WHERE id = x.company_id FOR UPDATE;
    current := private.bw_company_profile_fields(x.company_id);
    next_status := 'applied';
    FOR k IN SELECT jsonb_object_keys(x.changes) LOOP
      IF (current -> k) IS DISTINCT FROM (x.snapshot -> k) THEN next_status := 'stale'; END IF;
    END LOOP;
    IF next_status = 'applied' THEN
      UPDATE public.companies SET
        description   = CASE WHEN x.changes ? 'description'   THEN nullif(x.changes ->> 'description', '')   ELSE description END,
        website_url   = CASE WHEN x.changes ? 'website_url'   THEN nullif(x.changes ->> 'website_url', '')   ELSE website_url END,
        booking_url   = CASE WHEN x.changes ? 'booking_url'   THEN nullif(x.changes ->> 'booking_url', '')   ELSE booking_url END,
        contact_url   = CASE WHEN x.changes ? 'contact_url'   THEN nullif(x.changes ->> 'contact_url', '')   ELSE contact_url END,
        claims_url    = CASE WHEN x.changes ? 'claims_url'    THEN nullif(x.changes ->> 'claims_url', '')    ELSE claims_url END,
        phone         = CASE WHEN x.changes ? 'phone'         THEN nullif(x.changes ->> 'phone', '')         ELSE phone END,
        contact_email = CASE WHEN x.changes ? 'contact_email' THEN nullif(x.changes ->> 'contact_email', '') ELSE contact_email END,
        updated_at = now()
      WHERE id = x.company_id;
    ELSE
      note := coalesce(note, 'La fiche a changé depuis la proposition.');
    END IF;
  ELSE
    RAISE EXCEPTION 'BW_INVALID';
  END IF;
  UPDATE public.bw_company_profile_proposals
     SET status = next_status, decided_by = _actor, decided_at = now(), decision_note = note, updated_at = now()
   WHERE id = _id;
  PERFORM private.bw_company_event(x.company_id, 'profile', x.id, _actor, next_status,
    jsonb_build_object('note', note));
  RETURN jsonb_build_object('status', next_status);
END $$;

-- Publier (après copie par le serveur vers l'espace public), refuser ou retirer une photo.
-- Renvoie les fichiers que le serveur doit effacer.
CREATE OR REPLACE FUNCTION public.bw_company_photo_decide(
  _actor uuid, _id uuid, _decision text, _note text, _public_path text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ph public.bw_company_photos;
  note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
  next_status text;
BEGIN
  IF NOT private.bw_company_staff_ok(_actor, ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'BW_FORBIDDEN'; END IF;
  SELECT * INTO ph FROM public.bw_company_photos WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_NOT_FOUND'; END IF;
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
END $$;

-- 9. Lecture publique (visiteurs) --------------------------------------------------------------

-- Réponses publiées des compagnies sous des avis ou des signalements encore visibles.
CREATE OR REPLACE FUNCTION public.bw_company_public_replies(_kind text, _ids uuid[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('targetId', r.target_id, 'body', r.body,
    'companyName', c.name, 'date', r.published_at) ORDER BY r.published_at), '[]'::jsonb)
  FROM public.bw_company_replies r JOIN public.companies c ON c.id = r.company_id
  WHERE _kind IN ('entity_review', 'vessel_review', 'alert')
    AND r.target_kind = _kind AND r.kind = 'reply' AND r.status = 'published'
    AND r.target_id = ANY(_ids[1:100])
    AND private.bw_company_target_company(r.target_kind, r.target_id) = r.company_id;
$$;

-- Galerie publiée d'une compagnie (navire NULL) ou d'un navire.
CREATE OR REPLACE FUNCTION public.bw_company_gallery(_company uuid, _vessel uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.public_path,
    'caption', ph.caption, 'credit', ph.credit, 'width', ph.width, 'height', ph.height,
    'companyName', c.name) ORDER BY ph.published_at DESC), '[]'::jsonb)
  FROM public.bw_company_photos ph JOIN public.companies c ON c.id = ph.company_id
  WHERE ph.status = 'published'
    AND ((_vessel IS NULL AND ph.company_id = _company AND ph.vessel_id IS NULL)
         OR (_vessel IS NOT NULL AND ph.vessel_id = _vessel));
$$;

-- 10. Droits : serveur uniquement, sauf les deux lectures publiques ------------------------------

REVOKE ALL ON FUNCTION
  public.bw_company_feedback(uuid, uuid),
  public.bw_company_reply_save(uuid, uuid, text, uuid, text, text),
  public.bw_company_reply_withdraw(uuid, uuid),
  public.bw_company_profile(uuid, uuid),
  public.bw_company_profile_propose(uuid, uuid, jsonb, text),
  public.bw_company_profile_withdraw(uuid, uuid),
  public.bw_company_photo_check(uuid, uuid, uuid),
  public.bw_company_photo_add(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer),
  public.bw_company_photo_withdraw(uuid, uuid),
  public.bw_company_my_manager(uuid),
  public.bw_company_manager_overview(uuid, uuid),
  public.bw_company_manager_invite(uuid, uuid, text, text, text, text),
  public.bw_company_manager_invite_revoke(uuid, uuid),
  public.bw_company_manager_member(uuid, uuid, text, text, text),
  public.bw_company_member_manager(uuid, uuid, boolean, text),
  public.bw_company_managers(uuid, uuid),
  public.bw_company_desk_queue(uuid),
  public.bw_company_reply_decide(uuid, uuid, text, text),
  public.bw_company_profile_decide(uuid, uuid, text, text),
  public.bw_company_photo_decide(uuid, uuid, text, text, text),
  public.bw_company_public_replies(text, uuid[]),
  public.bw_company_gallery(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bw_company_feedback(uuid, uuid),
  public.bw_company_reply_save(uuid, uuid, text, uuid, text, text),
  public.bw_company_reply_withdraw(uuid, uuid),
  public.bw_company_profile(uuid, uuid),
  public.bw_company_profile_propose(uuid, uuid, jsonb, text),
  public.bw_company_profile_withdraw(uuid, uuid),
  public.bw_company_photo_check(uuid, uuid, uuid),
  public.bw_company_photo_add(uuid, uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer),
  public.bw_company_photo_withdraw(uuid, uuid),
  public.bw_company_my_manager(uuid),
  public.bw_company_manager_overview(uuid, uuid),
  public.bw_company_manager_invite(uuid, uuid, text, text, text, text),
  public.bw_company_manager_invite_revoke(uuid, uuid),
  public.bw_company_manager_member(uuid, uuid, text, text, text),
  public.bw_company_member_manager(uuid, uuid, boolean, text),
  public.bw_company_managers(uuid, uuid),
  public.bw_company_desk_queue(uuid),
  public.bw_company_reply_decide(uuid, uuid, text, text),
  public.bw_company_profile_decide(uuid, uuid, text, text),
  public.bw_company_photo_decide(uuid, uuid, text, text, text),
  public.bw_company_public_replies(text, uuid[]),
  public.bw_company_gallery(uuid, uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION
  public.bw_company_public_replies(text, uuid[]),
  public.bw_company_gallery(uuid, uuid)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
