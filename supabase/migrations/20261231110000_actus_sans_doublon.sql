-- Actualités sans doublon (11/11/2026)
-- 1. Une actu garde ses autres sources (« Aussi relayé par ») au lieu d'en créer une deuxième.
-- 2. Chaque proposition d'actu de la veille est comparée aux actus publiées : doublon probable signalé.
-- 3. L'équipe peut rattacher une proposition à l'actu existante, ou fusionner deux actus publiées.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.bw_news ADD COLUMN IF NOT EXISTS extra_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.bw_watch_proposals
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.bw_news(id) ON DELETE SET NULL;

-- L'actu publiée récemment qui raconte sans doute la même chose (ou NULL).
CREATE OR REPLACE FUNCTION private.bw_news_twin(p_title text, p_deps uuid[], p_vessel uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT n.id FROM public.bw_news n
  WHERE n.published AND n.created_at > now() - interval '7 days'
    AND (
      (cardinality(coalesce(p_deps, '{}')) > 0 AND n.departure_ids && p_deps AND n.created_at > now() - interval '72 hours')
      OR (p_vessel IS NOT NULL AND n.vessel_id = p_vessel AND n.created_at > now() - interval '72 hours')
      OR extensions.similarity(lower(n.title), lower(coalesce(p_title, ''))) > 0.45
    )
  ORDER BY extensions.similarity(lower(n.title), lower(coalesce(p_title, ''))) DESC, n.created_at DESC
  LIMIT 1
$$;

-- Ajoute une source à une actu (sans doublon de lien) et y joint ses traversées.
CREATE OR REPLACE FUNCTION private.bw_news_add_source(p_news uuid, p_name text, p_url text, p_title text, p_published timestamptz, p_deps uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE public.bw_news n SET
    extra_sources = CASE
      WHEN p_url IS NULL OR p_url = n.source_url OR n.extra_sources @> jsonb_build_array(jsonb_build_object('url', p_url))
        THEN n.extra_sources
      ELSE n.extra_sources || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'name', left(p_name, 80), 'url', p_url, 'title', left(p_title, 200), 'published_at', p_published)))
    END,
    departure_ids = ARRAY(SELECT DISTINCT x FROM unnest(coalesce(n.departure_ids, '{}') || coalesce(p_deps, '{}')) x LIMIT 12),
    updated_at = now()
  WHERE n.id = p_news;
END $$;

CREATE OR REPLACE FUNCTION public.bw_watch_propose(p_proposals jsonb, p_analyzed uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  entry jsonb; v_deps uuid[]; v_kind text; v_field text; v_value text; v_dep uuid; v_vessel uuid; v_item uuid; v_published timestamptz; v_known timestamptz;
  v_dup uuid; inserted integer := 0; skipped integer := 0; added integer;
BEGIN
  IF jsonb_array_length(coalesce(p_proposals, '[]'::jsonb)) > 20 THEN RAISE EXCEPTION 'Trop de propositions'; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(coalesce(p_proposals, '[]'::jsonb)) LOOP
    BEGIN
      v_kind := entry->>'kind';
      v_field := entry->>'field';
      v_value := entry->>'proposed_value';
      v_item := (entry->>'item_id')::uuid;
      v_dep := (entry->>'departure_id')::uuid;
      v_vessel := (entry->>'vessel_id')::uuid;
      v_dup := NULL;
      IF NOT EXISTS (SELECT 1 FROM public.bw_watch_items i WHERE i.id = v_item) THEN RAISE EXCEPTION 'article'; END IF;
      IF v_kind = 'departure' THEN
        IF v_dep IS NULL OR v_field NOT IN ('status', 'departure_at', 'arrival_at', 'vessel_id') THEN RAISE EXCEPTION 'champ'; END IF;
        IF v_field = 'status' AND v_value NOT IN ('scheduled', 'modified', 'cancelled') THEN RAISE EXCEPTION 'statut'; END IF;
        IF v_field IN ('departure_at', 'arrival_at') THEN PERFORM v_value::timestamptz; END IF;
        IF v_field = 'vessel_id' AND NOT EXISTS (SELECT 1 FROM public.vessels x WHERE x.id = v_value::uuid) THEN RAISE EXCEPTION 'navire'; END IF;
      ELSIF v_kind = 'crossing' THEN
        IF v_field NOT IN ('web_departed_at', 'web_arrived_at', 'web_eta_at') THEN RAISE EXCEPTION 'champ'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.departures d WHERE d.id = v_dep AND d.vessel_id = v_vessel) THEN RAISE EXCEPTION 'traversée'; END IF;
        v_value := to_char(v_value::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      ELSIF v_kind = 'vessel' THEN
        IF v_vessel IS NULL OR v_field <> 'status' OR v_value NOT IN ('active', 'inactive') THEN RAISE EXCEPTION 'champ'; END IF;
      ELSIF v_kind = 'incident' THEN
        SELECT n.verified_at INTO v_known FROM public.bw_vessel_incidents n
          WHERE n.vessel_id = v_vessel AND n.status IN ('verifying', 'confirmed') ORDER BY n.created_at DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'incident'; END IF;
        IF v_field = 'verified_at' THEN
          -- La date est celle de l'article : seul un article plus récent peut rafraîchir l'incident.
          SELECT i.published_at INTO v_published FROM public.bw_watch_items i WHERE i.id = v_item;
          IF v_published IS NULL OR v_published > now() + interval '1 hour' OR v_published <= coalesce(v_known, '-infinity') THEN RAISE EXCEPTION 'date'; END IF;
          v_value := to_char(v_published AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
        ELSIF v_field <> 'status' OR v_value <> 'resolved' THEN
          RAISE EXCEPTION 'champ';
        END IF;
      ELSIF v_kind = 'flash' THEN
        v_field := NULL;
        IF v_value NOT IN ('info', 'perturbation', 'alerte') THEN v_value := 'info'; END IF;
      ELSIF v_kind = 'note' THEN
        v_field := NULL; v_value := NULL;
      ELSE
        RAISE EXCEPTION 'type';
      END IF;
      -- Traversées concernées : seulement des identifiants qui existent (12 au plus).
      v_deps := ARRAY(
        SELECT d.id FROM public.departures d
        WHERE d.id::text IN (
          SELECT x FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(entry->'departure_ids') = 'array' THEN entry->'departure_ids' ELSE '[]'::jsonb END) x
          WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        LIMIT 12);
      -- Actu déjà publiée sur le même sujet : désignée par la veille, sinon retrouvée ici.
      IF v_kind IN ('flash', 'note') THEN
        IF coalesce(entry->>'duplicate_of', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT n.id INTO v_dup FROM public.bw_news n WHERE n.id = (entry->>'duplicate_of')::uuid;
        END IF;
        IF v_dup IS NULL AND v_kind = 'flash' THEN
          v_dup := private.bw_news_twin(entry->>'title', v_deps, v_vessel);
        END IF;
      END IF;
      INSERT INTO public.bw_watch_proposals(item_id, kind, title, summary, public_summary, departure_ids, confidence, departure_id, vessel_id, company_id, field, current_value, proposed_value, duplicate_of)
      VALUES (v_item, v_kind, left(entry->>'title', 160), left(coalesce(entry->>'summary', ''), 400),
              nullif(left(trim(coalesce(entry->>'public_summary', '')), 400), ''), v_deps,
              coalesce(entry->>'confidence', 'medium'), v_dep, v_vessel, (entry->>'company_id')::uuid, v_field,
              private.bw_watch_current(v_kind, v_dep, v_vessel, v_field), v_value, v_dup)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      inserted := inserted + added;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;
  UPDATE public.bw_watch_items SET analyzed_at = now() WHERE id = ANY(coalesce(p_analyzed, '{}')) AND analyzed_at IS NULL;
  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped);
END $function$;

-- La proposition complète l'actu existante : sa source s'y ajoute, rien de nouveau n'est publié.
CREATE OR REPLACE FUNCTION public.bw_watch_attach(p_id uuid, p_news uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p.kind NOT IN ('flash', 'note') THEN RAISE EXCEPTION 'Seule une actualité peut compléter une autre actualité'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bw_news WHERE id = p_news) THEN RAISE EXCEPTION 'Actualité introuvable'; END IF;
  SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
  SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
  PERFORM private.bw_news_add_source(p_news, coalesce(substring(i.title from ' - ([^-]+)$'), s.name),
    CASE WHEN i.url LIKE 'https://%' THEN coalesce(i.article_url, i.url) END, i.title, i.published_at, p.departure_ids);
  UPDATE public.bw_watch_proposals
     SET status = 'approved', applied = true, duplicate_of = p_news, decided_by = auth.uid(), decided_at = now(),
         decision_note = 'Ajoutée comme source à une actualité déjà publiée'
   WHERE id = p_id;
  RETURN jsonb_build_object('status', 'approved', 'applied', true);
END $$;

-- Deux actus publiées racontent la même chose : on garde la première, la seconde lui donne sa source.
CREATE OR REPLACE FUNCTION public.bw_news_merge(p_keep uuid, p_drop uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE d public.bw_news%ROWTYPE; extra jsonb;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_keep = p_drop THEN RAISE EXCEPTION 'Choisissez deux actualités différentes'; END IF;
  SELECT * INTO d FROM public.bw_news WHERE id = p_drop FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.bw_news WHERE id = p_keep) THEN RAISE EXCEPTION 'Actualité introuvable'; END IF;
  PERFORM private.bw_news_add_source(p_keep, d.source_name, d.source_url, coalesce(d.source_title, d.title), d.source_published_at, d.departure_ids);
  FOR extra IN SELECT * FROM jsonb_array_elements(d.extra_sources) LOOP
    PERFORM private.bw_news_add_source(p_keep, extra->>'name', extra->>'url', extra->>'title', (extra->>'published_at')::timestamptz, '{}');
  END LOOP;
  UPDATE public.bw_news k SET
    company_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.company_ids || d.company_ids) x),
    route_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.route_ids || d.route_ids) x),
    port_ids = ARRAY(SELECT DISTINCT x FROM unnest(k.port_ids || d.port_ids) x),
    vessel_id = coalesce(k.vessel_id, d.vessel_id)
  WHERE k.id = p_keep;
  UPDATE public.bw_news SET published = false, updated_at = now() WHERE id = p_drop;
  UPDATE public.bw_watch_proposals SET duplicate_of = p_keep WHERE duplicate_of = p_drop;
END $$;

REVOKE ALL ON FUNCTION private.bw_news_twin(text, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.bw_news_add_source(uuid, text, text, text, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bw_watch_attach(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_news_merge(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_watch_attach(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_news_merge(uuid, uuid) TO authenticated;
