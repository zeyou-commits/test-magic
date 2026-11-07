-- Actualités : la source affichée doit être lisible (07/11/2026).
-- Les flux Google News donnent comme extrait un lien HTML brut et, comme titre, « Titre - Journal ».
-- À chaque enregistrement d'une actualité :
--   - l'extrait est débarrassé des balises et entités HTML ; vide, réduit à une adresse ou identique
--     au titre, il est supprimé ;
--   - « Titre - Journal » donne le vrai journal comme source (au lieu du nom du flux de veille).

CREATE OR REPLACE FUNCTION private.bw_news_clean_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_text text; v_paper text;
BEGIN
  IF NEW.source_excerpt IS NOT NULL THEN
    v_text := regexp_replace(NEW.source_excerpt, '<[^>]*>', ' ', 'g');
    v_text := replace(replace(replace(replace(replace(replace(v_text,
                '&nbsp;', ' '), '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>');
    v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
    IF v_text = '' OR v_text ~* '^(https?://|<)' OR v_text ~ '^[«"]?\s*<'
       OR lower(v_text) = lower(coalesce(NEW.source_title, ''))
       OR position(lower(v_text) IN lower(coalesce(NEW.source_title, ''))) > 0 THEN
      v_text := NULL;
    END IF;
    NEW.source_excerpt := v_text;
  END IF;

  IF NEW.source_title ~ '\s[-–]\s[^-–]{2,60}$'
     AND (NEW.source_url LIKE '%news.google.%' OR NEW.source_name ILIKE 'Actualités%') THEN
    v_paper := btrim(substring(NEW.source_title FROM '\s[-–]\s([^-–]{2,60})$'));
    NEW.source_title := btrim(regexp_replace(NEW.source_title, '\s[-–]\s[^-–]{2,60}$', ''));
    NEW.source_name := left(v_paper, 80);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS bw_news_clean_source ON public.bw_news;
CREATE TRIGGER bw_news_clean_source
  BEFORE INSERT OR UPDATE OF source_excerpt, source_title, source_name ON public.bw_news
  FOR EACH ROW EXECUTE FUNCTION private.bw_news_clean_source();

-- Actualités déjà publiées.
UPDATE public.bw_news SET source_excerpt = source_excerpt
 WHERE source_excerpt IS NOT NULL OR source_title IS NOT NULL;
