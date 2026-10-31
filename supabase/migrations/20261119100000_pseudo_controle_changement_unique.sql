-- Pseudo : choisi à l'inscription ou proposé par défaut, modifiable une seule fois, contrôlé côté serveur.
ALTER TABLE public.bw_traveller_profiles ADD COLUMN IF NOT EXISTS pseudo_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS private.bw_pseudo_banned (word text PRIMARY KEY);

-- Minuscules, sans accents, chiffres de contournement remplacés, lettres répétées réduites.
CREATE OR REPLACE FUNCTION private.bw_pseudo_token(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(
    regexp_replace(
      translate(
        translate(lower(p), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa'),
        CASE WHEN lower(p) ~ '[a-zàâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ]' THEN '0134578' || '9$' ELSE '' END,
        CASE WHEN lower(p) ~ '[a-zàâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ]' THEN 'oieastb' || 'qs' ELSE '' END),
      '[^a-z0-9]', '', 'g'),
    '(.)\1+', '\1', 'g')
$$;

INSERT INTO private.bw_pseudo_banned (word)
SELECT DISTINCT private.bw_pseudo_token(w) FROM unnest(ARRAY[
  -- Français
  'con','conne','connard','connasse','salope','salop','salaud','pute','putain','enculé','encule','enculer',
  'merde','merdeux','batard','bâtard','nique','niquer','ntm','nique ta mere','fdp','fils de pute','tg','pd','pede',
  'pédé','tapette','gouine','bite','couille','couillon','chatte','teub','zizi','branleur','bouffon','abruti','débile',
  'pétasse','pouffiasse','sexe','porno','viol','violeur','pedophile','pédophile',
  -- Haine
  'negre','nègre','negro','bougnoule','bicot','raton','youpin','nazi','hitler','terroriste','daech','isis','jihad',
  -- Anglais
  'fuck','fucker','shit','bitch','dick','cock','pussy','cunt','asshole','nigger','nigga','whore','slut','porn','sex',
  -- Darija et kabyle, écrits en lettres latines
  'nik','nikmok','nikomok','nik mok','nikmouk','zeb','zebi','zebbi','zob','zebek','kahba','qahba','9ahba','gahba',
  'kahlouch','hmar','hmara','kelb','kalb','tahan','tahane','zamel','zemel','bezoul','terma','sharmouta',
  'charmouta','khara','khra','wald lkahba','weld el kahba','mok','yemak','yemmak',
  -- Réservés : personne ne doit passer pour l'équipe
  'admin','administrateur','moderateur','modérateur','bledway','batogo','support','staff','officiel','algerieferries'
]) AS w
ON CONFLICT DO NOTHING;

-- Renvoie le problème en clair, ou rien. Mot entier par défaut ; n'importe où pour 6 lettres et plus ou les insultes sans ambiguïté, pour épargner Dominique ou Connor.
CREATE OR REPLACE FUNCTION private.bw_pseudo_problem(p text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  clean text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  tokens text[];
  compact text;
BEGIN
  IF char_length(clean) < 3 THEN RETURN '3 caractères minimum.'; END IF;
  IF char_length(clean) > 24 THEN RETURN '24 caractères maximum.'; END IF;
  IF clean !~ '^[A-Za-z0-9À-ÿ ._''-]+$' THEN
    RETURN 'Lettres latines, chiffres, espaces, . _ '' - uniquement.';
  END IF;
  SELECT array_agg(private.bw_pseudo_token(t)) INTO tokens FROM regexp_split_to_table(clean, '[ ._''-]+') AS t WHERE t <> '';
  compact := private.bw_pseudo_token(regexp_replace(clean, '[ ._''-]+', '', 'g'));
  IF EXISTS (
    SELECT 1 FROM private.bw_pseudo_banned b
    WHERE b.word = ANY(tokens) OR b.word = compact
       OR ((char_length(b.word) >= 6 OR b.word = ANY(ARRAY['merde','kahba','qahba','gahba','salop','chate','fuck','niga','admin'])) AND compact LIKE '%' || b.word || '%')
  ) THEN
    RETURN 'Ce pseudo n''est pas autorisé. Choisissez-en un autre.';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.bw_pseudo_check(p_pseudo text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.bw_pseudo_problem(p_pseudo)
$$;
GRANT EXECUTE ON FUNCTION public.bw_pseudo_check(text) TO anon, authenticated;

-- Les pseudos déjà interdits repassent au pseudo par défaut, sans consommer le changement.
UPDATE public.bw_traveller_profiles t
SET pseudo = (ARRAY['Jeddi','Jedda','Papa','Maman','Lina','Ilyes','Ammi','Amastan','Tata Houria','Ammi Tayeb','Mâalem','Lalla'])[(1 + abs(hashtextextended(t.user_id::text, 7)) % 12)::int]
  || ' ' || (1000 + (abs(hashtextextended(t.user_id::text, 7)) / 12) % 9000)::text
WHERE private.bw_pseudo_problem(t.pseudo) IS NOT NULL;

-- Dernier rempart : aucune écriture ne passe sans contrôle.
CREATE OR REPLACE FUNCTION private.bw_guard_pseudo()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE problem text := private.bw_pseudo_problem(NEW.pseudo);
BEGIN
  IF problem IS NOT NULL THEN RAISE EXCEPTION '%', problem; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_traveller_pseudo_guard ON public.bw_traveller_profiles;
CREATE TRIGGER bw_traveller_pseudo_guard
  BEFORE INSERT OR UPDATE OF pseudo ON public.bw_traveller_profiles
  FOR EACH ROW EXECUTE FUNCTION private.bw_guard_pseudo();

-- Le pseudo saisi à l'inscription sert au premier profil, s'il est valable.
CREATE OR REPLACE FUNCTION private.bw_ensure_traveller(p_user uuid)
RETURNS public.bw_traveller_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row public.bw_traveller_profiles;
  avatars text[] := ARRAY['jeddi','jedda','papa','maman','lina','ilyes','ammi','amastan','tata_houria','ammi_tayeb','maalem','lalla'];
  names text[] := ARRAY['Jeddi','Jedda','Papa','Maman','Lina','Ilyes','Ammi','Amastan','Tata Houria','Ammi Tayeb','Mâalem','Lalla'];
  colors text[] := ARRAY['menthe','ciel','peche','lilas','citron','rose'];
  h bigint := abs(hashtextextended(p_user::text, 7));
  wanted text;
BEGIN
  SELECT * INTO row FROM public.bw_traveller_profiles WHERE user_id = p_user;
  IF FOUND THEN RETURN row; END IF;
  SELECT btrim(regexp_replace(u.raw_user_meta_data->>'pseudo', '\s+', ' ', 'g')) INTO wanted FROM auth.users u WHERE u.id = p_user;
  IF wanted IS NULL OR private.bw_pseudo_problem(wanted) IS NOT NULL THEN
    wanted := names[(1 + h % 12)::int] || ' ' || (1000 + (h / 12) % 9000)::text;
  END IF;
  INSERT INTO public.bw_traveller_profiles(user_id, pseudo, avatar, color)
  VALUES (p_user, wanted, avatars[(1 + h % 12)::int], colors[(1 + (h / 7) % 6)::int])
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO row FROM public.bw_traveller_profiles WHERE user_id = p_user;
  RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.bw_my_traveller()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.bw_traveller_profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  p := private.bw_ensure_traveller(auth.uid());
  RETURN private.bw_traveller_card(p) || jsonb_build_object('show_on_trip', p.show_on_trip,
    'mood_until', CASE WHEN p.mood_until > now() THEN p.mood_until END,
    'pseudo_locked', p.pseudo_changed_at IS NOT NULL);
END $$;

-- Un seul changement de pseudo. Cabas, couleur et visibilité restent libres.
CREATE OR REPLACE FUNCTION public.bw_save_traveller(p_pseudo text, p_avatar text, p_color text, p_show_on_trip boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current public.bw_traveller_profiles;
  wanted text := btrim(regexp_replace(p_pseudo, '\s+', ' ', 'g'));
  renamed boolean;
  problem text;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  current := private.bw_ensure_traveller(auth.uid());
  renamed := wanted IS DISTINCT FROM current.pseudo;
  IF renamed THEN
    IF current.pseudo_changed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Vous avez déjà utilisé votre unique changement de pseudo.';
    END IF;
    problem := private.bw_pseudo_problem(wanted);
    IF problem IS NOT NULL THEN RAISE EXCEPTION '%', problem; END IF;
  END IF;
  UPDATE public.bw_traveller_profiles
     SET pseudo = wanted, avatar = p_avatar, color = p_color,
         show_on_trip = coalesce(p_show_on_trip, true), updated_at = now(),
         pseudo_changed_at = CASE WHEN renamed THEN now() ELSE pseudo_changed_at END
   WHERE user_id = auth.uid();
  RETURN public.bw_my_traveller();
END $$;
