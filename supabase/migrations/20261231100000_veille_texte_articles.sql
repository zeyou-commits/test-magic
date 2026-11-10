-- Veille : le texte des articles (les horaires y sont, pas dans le titre) et la correction de l'heure
-- proposée par l'équipe avant validation.

ALTER TABLE public.bw_watch_items
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS article_url text;

COMMENT ON COLUMN public.bw_watch_items.body IS
  'Texte de l''article (paragraphes, 5000 caractères au plus), lu une fois par watch-api ; vide si illisible.';
COMMENT ON COLUMN public.bw_watch_items.article_url IS
  'Adresse réelle de l''article (un lien Google Actualités est décodé).';

-- L'équipe corrige la date ou l'heure proposée (ex. « heure à confirmer ») avant de valider.
CREATE OR REPLACE FUNCTION public.bw_watch_adjust(p_id uuid, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE p public.bw_watch_proposals%ROWTYPE; v_at timestamptz;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  SELECT * INTO p FROM public.bw_watch_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  IF p.status NOT IN ('pending', 'standby') THEN RAISE EXCEPTION 'Proposition déjà traitée'; END IF;
  IF p.kind NOT IN ('departure', 'schedule_fix') OR p.field NOT IN ('departure_at', 'arrival_at') THEN
    RAISE EXCEPTION 'Seule une date ou une heure se corrige ici';
  END IF;
  v_at := p_value::timestamptz;
  UPDATE public.bw_watch_proposals
     SET proposed_value = to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
   WHERE id = p_id;
  RETURN jsonb_build_object('proposed_value', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END $function$;

REVOKE ALL ON FUNCTION public.bw_watch_adjust(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bw_watch_adjust(uuid, text) TO authenticated;
