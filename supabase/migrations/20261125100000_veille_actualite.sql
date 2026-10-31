-- BledWay · Veille d'actualité : un collecteur gratuit repère les articles, Claude propose, l'équipe décide.
-- Claude ne peut que déposer des propositions : rien n'est modifié ni publié sans clic d'un admin.
CREATE TABLE IF NOT EXISTS public.bw_watch_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  url text NOT NULL UNIQUE CHECK (url ~ '^https://'),
  kind text NOT NULL CHECK (kind IN ('sitemap', 'rss')),
  tier text NOT NULL DEFAULT 'media' CHECK (tier IN ('official', 'media')),
  keywords text[] NOT NULL DEFAULT '{}',
  check_minutes integer NOT NULL DEFAULT 30 CHECK (check_minutes >= 30),
  active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bw_watch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.bw_watch_sources(id) ON DELETE CASCADE,
  url text NOT NULL UNIQUE CHECK (url ~ '^https://'),
  title text NOT NULL,
  excerpt text,
  published_at timestamptz,
  found_at timestamptz NOT NULL DEFAULT now(),
  analyzed_at timestamptz
);
CREATE INDEX IF NOT EXISTS bw_watch_items_pending ON public.bw_watch_items(found_at) WHERE analyzed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.bw_watch_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.bw_watch_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('flash', 'departure', 'vessel', 'note')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 160),
  summary text NOT NULL CHECK (char_length(summary) <= 400),
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  departure_id uuid REFERENCES public.departures(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  field text,
  current_value text,
  proposed_value text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'standby', 'approved', 'rejected')),
  applied boolean NOT NULL DEFAULT false,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bw_watch_proposals_once ON public.bw_watch_proposals(
  item_id, kind, coalesce(field, ''),
  coalesce(departure_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(vessel_id, '00000000-0000-0000-0000-000000000000')
);
CREATE INDEX IF NOT EXISTS bw_watch_proposals_status ON public.bw_watch_proposals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bw_watch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_found integer,
  errors integer
);

CREATE TABLE IF NOT EXISTS private.bw_watch_token (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bw_watch_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_watch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_watch_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_watch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bw_watch_sources_staff ON public.bw_watch_sources;
CREATE POLICY bw_watch_sources_staff ON public.bw_watch_sources FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_watch_items_staff ON public.bw_watch_items;
CREATE POLICY bw_watch_items_staff ON public.bw_watch_items FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_watch_proposals_staff ON public.bw_watch_proposals;
CREATE POLICY bw_watch_proposals_staff ON public.bw_watch_proposals FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));
DROP POLICY IF EXISTS bw_watch_runs_staff ON public.bw_watch_runs;
CREATE POLICY bw_watch_runs_staff ON public.bw_watch_runs FOR SELECT TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));

REVOKE ALL ON public.bw_watch_sources, public.bw_watch_items, public.bw_watch_proposals, public.bw_watch_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_watch_sources TO authenticated;
GRANT SELECT ON public.bw_watch_items, public.bw_watch_proposals, public.bw_watch_runs TO authenticated;

INSERT INTO public.bw_watch_sources(name, url, kind, keywords) VALUES
  ('Maghreb Maritime', 'https://www.maghrebmaritime.com/sitemap_index.xml', 'sitemap',
   ARRAY['algéri','ferry','ferries','traversée','corsica','gnv','baleària','balearia','trasmediterr','armas','nouris','méridionale','marseille','sète','alger','oran','béjaïa','skikda','annaba','mostaganem','ghazaouet','alicante','valence','almería','barcelone','navire']),
  ('Maghreb Émergent', 'https://maghrebemergent.news/fr/feed/', 'rss',
   ARRAY['ferry','ferries','traversée','paquebot','maritime','navire','port d','ports d','douane','algérie ferries'])
ON CONFLICT (url) DO NOTHING;
UPDATE public.bw_watch_sources SET check_minutes = 240 WHERE url = 'https://maghrebemergent.news/fr/feed/';

-- La valeur actuelle est toujours lue en base, jamais fournie par la proposition.
CREATE OR REPLACE FUNCTION private.bw_watch_current(p_kind text, p_departure uuid, p_vessel uuid, p_field text)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'departure' THEN (
      SELECT CASE p_field
        WHEN 'status' THEN d.status::text
        WHEN 'departure_at' THEN to_char(d.departure_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'arrival_at' THEN to_char(d.arrival_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHEN 'vessel_id' THEN d.vessel_id::text
      END FROM public.departures d WHERE d.id = p_departure)
    WHEN p_kind = 'vessel' AND p_field = 'status' THEN (SELECT v.status::text FROM public.vessels v WHERE v.id = p_vessel)
  END;
$$;

-- Le jeton de Claude ne sert qu'à déposer des propositions. Seule son empreinte est conservée.
CREATE OR REPLACE FUNCTION public.bw_watch_rotate_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE plain text;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin']) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  plain := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO private.bw_watch_token(id, token_hash, created_at)
  VALUES (1, encode(extensions.digest(plain, 'sha256'), 'hex'), now())
  ON CONFLICT (id) DO UPDATE SET token_hash = excluded.token_hash, created_at = now();
  RETURN plain;
END $$;

CREATE OR REPLACE FUNCTION public.bw_watch_token_ok(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(p_token <> '' AND EXISTS (
    SELECT 1 FROM private.bw_watch_token t
    WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ), false);
$$;

-- Dépôt par Claude : le lien et la source viennent de l'article collecté, jamais de son analyse.
CREATE OR REPLACE FUNCTION public.bw_watch_propose(p_proposals jsonb, p_analyzed uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  entry jsonb; v_kind text; v_field text; v_value text; v_dep uuid; v_vessel uuid; v_item uuid;
  inserted integer := 0; skipped integer := 0; added integer;
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
      IF NOT EXISTS (SELECT 1 FROM public.bw_watch_items i WHERE i.id = v_item) THEN RAISE EXCEPTION 'article'; END IF;
      IF v_kind = 'departure' THEN
        IF v_dep IS NULL OR v_field NOT IN ('status', 'departure_at', 'arrival_at', 'vessel_id') THEN RAISE EXCEPTION 'champ'; END IF;
        IF v_field = 'status' AND v_value NOT IN ('scheduled', 'modified', 'cancelled') THEN RAISE EXCEPTION 'statut'; END IF;
        IF v_field IN ('departure_at', 'arrival_at') THEN PERFORM v_value::timestamptz; END IF;
        IF v_field = 'vessel_id' AND NOT EXISTS (SELECT 1 FROM public.vessels x WHERE x.id = v_value::uuid) THEN RAISE EXCEPTION 'navire'; END IF;
      ELSIF v_kind = 'vessel' THEN
        IF v_vessel IS NULL OR v_field <> 'status' OR v_value NOT IN ('active', 'inactive') THEN RAISE EXCEPTION 'champ'; END IF;
      ELSIF v_kind = 'flash' THEN
        v_field := NULL;
        IF v_value NOT IN ('info', 'perturbation', 'alerte') THEN v_value := 'info'; END IF;
      ELSIF v_kind = 'note' THEN
        v_field := NULL; v_value := NULL;
      ELSE
        RAISE EXCEPTION 'type';
      END IF;
      INSERT INTO public.bw_watch_proposals(item_id, kind, title, summary, confidence, departure_id, vessel_id, company_id, field, current_value, proposed_value)
      VALUES (v_item, v_kind, left(entry->>'title', 160), left(coalesce(entry->>'summary', ''), 400),
              coalesce(entry->>'confidence', 'medium'), v_dep, v_vessel, (entry->>'company_id')::uuid, v_field,
              private.bw_watch_current(v_kind, v_dep, v_vessel, v_field), v_value)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added = ROW_COUNT;
      inserted := inserted + added;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
    END;
  END LOOP;
  UPDATE public.bw_watch_items SET analyzed_at = now() WHERE id = ANY(coalesce(p_analyzed, '{}')) AND analyzed_at IS NULL;
  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped);
END $$;

-- Décision de l'équipe. Approuver applique la modification, si la donnée n'a pas changé entre-temps.
CREATE OR REPLACE FUNCTION public.bw_watch_decide(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.bw_watch_proposals%ROWTYPE; i public.bw_watch_items%ROWTYPE; s public.bw_watch_sources%ROWTYPE; did boolean := false;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'standby') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p_decision = 'approved' THEN
    IF p.kind IN ('departure', 'vessel')
       AND private.bw_watch_current(p.kind, p.departure_id, p.vessel_id, p.field) IS DISTINCT FROM p.current_value THEN
      RAISE EXCEPTION 'La donnée a changé depuis cette proposition : vérifiez-la, puis refusez la proposition.';
    END IF;
    IF p.kind = 'departure' THEN
      IF p.field = 'status' THEN
        UPDATE public.departures SET status = p.proposed_value::public.departure_status WHERE id = p.departure_id;
      ELSIF p.field = 'departure_at' THEN
        UPDATE public.departures SET departure_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'arrival_at' THEN
        UPDATE public.departures SET arrival_at = p.proposed_value::timestamptz, status = 'modified' WHERE id = p.departure_id;
      ELSIF p.field = 'vessel_id' THEN
        UPDATE public.departures SET vessel_id = p.proposed_value::uuid WHERE id = p.departure_id;
      END IF;
      did := true;
    ELSIF p.kind = 'vessel' THEN
      UPDATE public.vessels SET status = p.proposed_value::public.entity_status WHERE id = p.vessel_id;
      did := true;
    ELSIF p.kind = 'flash' THEN
      SELECT * INTO i FROM public.bw_watch_items WHERE id = p.item_id;
      SELECT * INTO s FROM public.bw_watch_sources WHERE id = i.source_id;
      INSERT INTO public.bw_news(kind, origin, title, summary, source_name, source_url, vessel_id, company_ids, departure_ids, published, created_by)
      VALUES (coalesce(p.proposed_value, 'info'), CASE WHEN s.tier = 'official' THEN 'official' ELSE 'media' END, p.title, p.summary,
              left(s.name, 80), i.url, p.vessel_id,
              CASE WHEN p.company_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.company_id] END,
              CASE WHEN p.departure_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.departure_id] END,
              true, auth.uid());
      did := true;
    END IF;
  END IF;
  UPDATE public.bw_watch_proposals
     SET status = p_decision, applied = did, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300)
   WHERE id = p_id;
  RETURN jsonb_build_object('status', p_decision, 'applied', did);
END $$;

-- Relance par l'équipe : le collecteur part tout de suite, trois minutes au moins entre deux relances.
CREATE OR REPLACE FUNCTION public.bw_watch_relaunch()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_id uuid;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF EXISTS (SELECT 1 FROM public.bw_watch_runs r WHERE r.requested_by IS NOT NULL AND r.requested_at > now() - interval '3 minutes') THEN
    RAISE EXCEPTION 'Une veille vient d''être relancée : réessayez dans quelques minutes.';
  END IF;
  INSERT INTO public.bw_watch_runs(requested_by) VALUES (auth.uid()) RETURNING id INTO run_id;
  PERFORM net.http_get(
    url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/watch-collect?force=1&run=' || run_id::text,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
    timeout_milliseconds := 120000
  );
  RETURN run_id;
END $$;

REVOKE ALL ON FUNCTION private.bw_watch_current(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_watch_rotate_token() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_watch_token_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_watch_propose(jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bw_watch_decide(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bw_watch_relaunch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_watch_rotate_token(), public.bw_watch_relaunch(), public.bw_watch_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_watch_token_ok(text), public.bw_watch_propose(jsonb, uuid[]) TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bledway-veille-30m';
SELECT cron.schedule('bledway-veille-30m', '11,41 * * * *', $job$
  SELECT net.http_get(
    url := 'https://lwyjhgyuqyflaanrbgkq.supabase.co/functions/v1/watch-collect',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bledway_cron_secret')),
    timeout_milliseconds := 120000
  );
$job$);

NOTIFY pgrst, 'reload schema';
