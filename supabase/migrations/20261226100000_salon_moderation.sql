-- Salons : modération renforcée (06/11/2026).
-- 1. Filtre à l'envoi : le texte est normalisé (accents, majuscules, lettres répétées, chiffres
--    utilisés comme lettres, ponctuation, lettres séparées) avant la comparaison, et la liste accepte
--    des expressions. « Va te faire mettre » passait : la liste ne contenait que des mots isolés.
-- 2. Signalement (choix de l'utilisateur : pas trop permissif) : masqué pour tous à partir de
--    2 signalements (au lieu de 3) ; dès le premier, le message repasse dans la file de la modération
--    automatique. Côté écran : confirmation avant l'envoi, puis le message disparaît pour l'auteur du signalement.

-- Minuscules, accents et chiffres-lettres (0→o, 1→i, 4→a, 5→s, @→a, $→s), ponctuation → espace,
-- puis lettres répétées réduites à une seule (« connnnard » → « conard », appliqué aussi à la liste).
CREATE OR REPLACE FUNCTION private.bw_chat_normalize(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- Écriture arabe gardée : voyelles courtes et tatouil retirés, alif / alif maqsura / ta marbuta unifiés.
  SELECT regexp_replace(btrim(regexp_replace(regexp_replace(
           translate(regexp_replace(lower(coalesce(p_text, '')), '[ً-ْـ]', '', 'g'),
                     'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ@$0145أإآىة',
                     'aaaaaaceeeeiiiinooooouuuuyyasoiasااايه'),
           '[^a-z0-9ء-ي]+', ' ', 'g'), '\s+', ' ', 'g')), '([a-z0-9ء-ي])\1+', '\1', 'g');
$function$;

-- Lettres isolées recollées (« c o n n a r d », « f.d.p » → « conard », « fdp ») : texte de contrôle seulement.
CREATE OR REPLACE FUNCTION private.bw_chat_join_letters(p_norm text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE t text; o text := ''; buf text := '';
BEGIN
  FOREACH t IN ARRAY string_to_array(coalesce(p_norm, ''), ' ') LOOP
    IF char_length(t) = 1 THEN buf := buf || t;
    ELSE
      IF buf <> '' THEN o := o || ' ' || buf; buf := ''; END IF;
      o := o || ' ' || t;
    END IF;
  END LOOP;
  IF buf <> '' THEN o := o || ' ' || buf; END IF;
  RETURN regexp_replace(btrim(o), '([a-z0-9])\1+', '\1', 'g');
END $function$;

CREATE OR REPLACE FUNCTION private.bw_chat_refusal(p_body text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE clean text := lower(p_body); norm text; joined text;
BEGIN
  IF clean ~ '(https?://|www\.|\m[a-z0-9-]+\.(com|fr|net|org|dz|es|info|me|ly|io)\M)' THEN RETURN 'link'; END IF;
  IF clean ~ '[a-z0-9._-]+@[a-z0-9-]+\.[a-z]' THEN RETURN 'email'; END IF;
  IF regexp_replace(clean, '[^0-9]', '', 'g') ~ '[0-9]{8,}' AND clean ~ '[0-9][0-9 .()+-]{7,}[0-9]' THEN RETURN 'phone'; END IF;
  norm := private.bw_chat_normalize(p_body);
  joined := ' ' || private.bw_chat_join_letters(norm) || ' ';
  norm := ' ' || norm || ' ';
  IF EXISTS (
    SELECT 1 FROM public.bw_chat_words w, LATERAL (SELECT private.bw_chat_normalize(w.word) AS n) x
    WHERE x.n <> '' AND (position(' ' || x.n || ' ' IN norm) > 0 OR position(' ' || x.n || ' ' IN joined) > 0)
  ) THEN RETURN 'word'; END IF;
  RETURN NULL;
END $function$;

-- Expressions et variantes (français, darija en lettres latines, espagnol). Complétable dans l'admin.
INSERT INTO public.bw_chat_words(word)
SELECT w FROM unnest(ARRAY[
  'te faire mettre', 'te faire foutre', 'te faire enculer', 'te faire niquer', 'te faire voir',
  'ta gueule', 'ferme ta gueule', 'nique ta mere', 'ta mere la pute', 'fils de pute', 'fille de pute',
  'enculer', 'enculee', 'fils de chien', 'va crever', 'je vais te tuer', 'je vais te frapper',
  'sale arabe', 'sale noir', 'sale juif', 'sale kabyle', 'sale race', 'bougnoule', 'negre', 'youpin',
  'nik mok', 'nik yemak', 'nik yemek', 'zamel', 'manyak', '9a7ba', '9ahba', 'ya kelb', 'weld lkahba', 'wld l9a7ba',
  'hijo de puta', 'hija de puta', 'gilipollas', 'cabron', 'vete a la mierda', 'maricon', 'me cago en tu'
]) AS w
WHERE NOT EXISTS (SELECT 1 FROM public.bw_chat_words x WHERE lower(x.word) = w);

CREATE OR REPLACE FUNCTION public.bw_chat_report(p_message uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE me uuid := auth.uid(); author uuid; total integer;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RETURN jsonb_build_object('ok', false, 'refused', 'account'); END IF;
  SELECT m.user_id INTO author FROM public.bw_chat_messages m WHERE m.id = p_message AND m.hidden_at IS NULL;
  IF author IS NULL OR author = me THEN RETURN jsonb_build_object('ok', false, 'refused', 'room'); END IF;
  INSERT INTO public.bw_chat_reports(message_id, user_id) VALUES (p_message, me) ON CONFLICT DO NOTHING;
  -- Relu par la modération automatique au prochain passage.
  UPDATE public.bw_chat_messages SET reviewed_at = NULL WHERE id = p_message AND hidden_at IS NULL;
  SELECT count(*) INTO total FROM public.bw_chat_reports r WHERE r.message_id = p_message;
  IF total >= 2 THEN
    UPDATE public.bw_chat_messages SET hidden_at = now(), hidden_reason = 'Signalements' WHERE id = p_message AND hidden_at IS NULL;
    INSERT INTO public.bw_chat_strikes(user_id, reason) VALUES (author, 'reports');
  END IF;
  RETURN jsonb_build_object('ok', true, 'hidden', total >= 2);
END $function$;

-- Origine de chaque terme : équipe (saisie), import (fichier), agent (appris par la modération automatique).
ALTER TABLE public.bw_chat_words ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'equipe';
ALTER TABLE public.bw_chat_words ADD COLUMN IF NOT EXISTS added_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bw_chat_words DROP CONSTRAINT IF EXISTS bw_chat_words_source_check;
ALTER TABLE public.bw_chat_words ADD CONSTRAINT bw_chat_words_source_check CHECK (source IN ('equipe', 'import', 'agent'));

-- Import en masse depuis l'admin (CSV ou liste collée) : doublons ignorés, termes de 2 à 80 caractères.
CREATE OR REPLACE FUNCTION public.bw_chat_words_import(p_words text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE added integer;
BEGIN
  IF NOT private.bw_staff_permission(ARRAY['admin', 'editor']) THEN RAISE EXCEPTION 'Réservé à l''équipe'; END IF;
  IF cardinality(p_words) > 5000 THEN RAISE EXCEPTION 'Fichier trop long (5000 termes au plus)'; END IF;
  WITH clean AS (
    SELECT DISTINCT lower(btrim(regexp_replace(w, '\s+', ' ', 'g'))) AS word FROM unnest(p_words) w
  )
  INSERT INTO public.bw_chat_words(word, source)
  SELECT word, 'import' FROM clean
  WHERE char_length(word) BETWEEN 2 AND 80 AND private.bw_chat_normalize(word) <> ''
  ON CONFLICT (word) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN jsonb_build_object('added', added, 'received', cardinality(p_words));
END $function$;
REVOKE ALL ON FUNCTION public.bw_chat_words_import(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_chat_words_import(text[]) TO authenticated;

-- Apprentissage par l'agent modérateur (clé service, via chat-review) : un terme n'est retenu que s'il
-- figure dans un message que l'agent vient de masquer, 3 caractères au moins, 10 termes par passage.
CREATE OR REPLACE FUNCTION public.bw_chat_words_learn(p_terms text[], p_hidden uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE added integer;
BEGIN
  WITH clean AS (
    SELECT DISTINCT lower(btrim(regexp_replace(t, '\s+', ' ', 'g'))) AS word FROM unnest(p_terms[1:10]) t
  )
  INSERT INTO public.bw_chat_words(word, source)
  SELECT c.word, 'agent' FROM clean c
  WHERE char_length(c.word) BETWEEN 3 AND 80
    AND private.bw_chat_normalize(c.word) <> ''
    AND EXISTS (
      SELECT 1 FROM public.bw_chat_messages m
      WHERE m.id = ANY(p_hidden) AND m.hidden_at IS NOT NULL
        AND (position(' ' || private.bw_chat_normalize(c.word) || ' ' IN ' ' || private.bw_chat_normalize(m.body) || ' ') > 0
          OR position(' ' || private.bw_chat_normalize(c.word) || ' ' IN ' ' || private.bw_chat_join_letters(private.bw_chat_normalize(m.body)) || ' ') > 0))
  ON CONFLICT (word) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END $function$;
REVOKE ALL ON FUNCTION public.bw_chat_words_learn(text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_chat_words_learn(text[], uuid[]) TO service_role;
