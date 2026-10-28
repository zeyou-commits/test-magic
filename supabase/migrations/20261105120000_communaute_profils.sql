-- BledWay · Communauté : avatar cabas, humeur du moment, voyageurs d'une traversée, profil public,
-- auteurs des contributions et réactions.
-- Règle maintenue : l'identifiant d'un compte n'est jamais public. Chaque voyageur a un identifiant
-- public opaque (« handle ») ; aucun nom réel, aucune adresse e-mail, aucune date de voyage n'est exposé.
-- Script additif : aucune donnée existante n'est modifiée ni supprimée, il peut être relancé.
-- Prérequis : scripts du 01/11 (statuts « Ma traversée ») et du 02/11 (suivi « je voyage »).
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- 1. Catalogue des humeurs (géré dans l'admin). Les moments servent à suggérer la bonne humeur au bon moment.
CREATE TABLE IF NOT EXISTS public.bw_moods (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,30}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 40),
  emoji text NOT NULL DEFAULT '' CHECK (char_length(emoji) <= 8),
  image text NOT NULL CHECK (image ~ '^/cabas/[a-z0-9_/-]+\.webp$'),
  moments text[] NOT NULL DEFAULT '{}'
    CHECK (moments <@ ARRAY['avant','en_route','port','onboard','arrived','toujours']::text[]),
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.bw_moods(code, label, emoji, image, moments, sort) VALUES
  ('viva_algerie', '1, 2, 3 viva l’Algérie !', '🇩🇿', '/cabas/humeurs/24_ambiance.webp', '{toujours}', 10),
  ('yallah', 'Yallah, on y va !', '', '/cabas/humeurs/05_yallah.webp', '{avant,en_route}', 20),
  ('zen', 'En mode zen', '', '/cabas/humeurs/19_dodo_pont.webp', '{toujours}', 30),
  ('reste_calme', 'Reste calme…', '', '/cabas/humeurs/11_file_attente.webp', '{port}', 40),
  ('valise_pleine', 'Valise pleine à craquer', '', '/cabas/humeurs/01_valise_pleine.webp', '{avant}', 50),
  ('surpoids', 'Surpoids… on négocie', '', '/cabas/humeurs/03_surpoids.webp', '{avant}', 60),
  ('reveil', 'Debout à 4 h', '', '/cabas/humeurs/04_reveil_4h.webp', '{avant,en_route}', 70),
  ('route_longue', 'La route est longue', '', '/cabas/humeurs/10_route_longue.webp', '{en_route}', 80),
  ('bouchon', 'Coincé dans les bouchons', '', '/cabas/humeurs/08_bouchon.webp', '{en_route}', 90),
  ('file', 'Dans la file', '', '/cabas/humeurs/11_file_attente.webp', '{port}', 100),
  ('controle', 'Contrôle en cours', '', '/cabas/humeurs/14_controle.webp', '{port}', 110),
  ('embarquement', 'On embarque !', '', '/cabas/humeurs/17_embarquement.webp', '{port,onboard}', 120),
  ('mal_de_mer', 'Mal de mer', '', '/cabas/humeurs/18_mal_de_mer.webp', '{onboard}', 130),
  ('dodo', 'Dodo sur le pont', '', '/cabas/humeurs/19_dodo_pont.webp', '{onboard}', 140),
  ('selfie', 'Selfie à bord', '', '/cabas/humeurs/21_selfie.webp', '{onboard}', 150),
  ('msemen', 'Msemen à bord', '', '/cabas/humeurs/22_msemen.webp', '{onboard}', 160),
  ('pas_de_reseau', 'Pas de réseau', '', '/cabas/humeurs/23_pas_de_reseau.webp', '{onboard}', 170),
  ('ambiance', 'Ambiance à bord', '', '/cabas/humeurs/24_ambiance.webp', '{onboard}', 180),
  ('la_cote', 'La côte en vue !', '', '/cabas/humeurs/26_la_cote.webp', '{onboard,arrived}', 190),
  ('douane_ok', 'Douane OK !', '', '/cabas/humeurs/29_douane_ok.webp', '{arrived}', 200),
  ('chaleur', 'Il fait chaud !', '', '/cabas/humeurs/30_chaleur.webp', '{port,arrived}', 210),
  ('bien_arrive', 'Bien arrivé·e', '', '/cabas/humeurs/33_bien_arrive.webp', '{arrived}', 220),
  ('adieux', 'Les adieux…', '', '/cabas/humeurs/35_adieux.webp', '{avant,arrived}', 230),
  ('nostalgique', 'Déjà nostalgique', '', '/cabas/humeurs/37_deja_nostalgique.webp', '{toujours}', 240)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.bw_moods ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_moods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_moods TO authenticated;
GRANT ALL ON public.bw_moods TO service_role;
DROP POLICY IF EXISTS bw_moods_read ON public.bw_moods;
CREATE POLICY bw_moods_read ON public.bw_moods FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS bw_moods_staff ON public.bw_moods;
CREATE POLICY bw_moods_staff ON public.bw_moods FOR ALL TO authenticated
  USING ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])))
  WITH CHECK ((SELECT private.bw_staff_permission(ARRAY['admin','editor'])));

-- 2. Profil voyageur : pseudo, cabas, couleur, humeur (24 h), visibilité sur la traversée.
CREATE TABLE IF NOT EXISTS public.bw_traveller_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
  pseudo text NOT NULL CHECK (char_length(pseudo) BETWEEN 3 AND 24 AND pseudo ~ '^[[:alnum:]À-ÿ ._''-]+$'),
  avatar text NOT NULL CHECK (avatar IN ('jeddi','jedda','papa','maman','lina','ilyes','ammi','amastan','tata_houria','ammi_tayeb','maalem','lalla')),
  color text NOT NULL CHECK (color IN ('menthe','ciel','peche','lilas','citron','rose')),
  mood_code text REFERENCES public.bw_moods(code) ON DELETE SET NULL,
  mood_until timestamptz,
  show_on_trip boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Lecture et écriture uniquement par les fonctions ci-dessous.
ALTER TABLE public.bw_traveller_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_traveller_profiles FROM anon, authenticated;
GRANT ALL ON public.bw_traveller_profiles TO service_role;

-- Profil par défaut, toujours le même pour un compte : un cabas, une couleur, « Lina 4821 ».
CREATE OR REPLACE FUNCTION private.bw_ensure_traveller(p_user uuid)
RETURNS public.bw_traveller_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row public.bw_traveller_profiles;
  avatars text[] := ARRAY['jeddi','jedda','papa','maman','lina','ilyes','ammi','amastan','tata_houria','ammi_tayeb','maalem','lalla'];
  names text[] := ARRAY['Jeddi','Jedda','Papa','Maman','Lina','Ilyes','Ammi','Amastan','Tata Houria','Ammi Tayeb','Mâalem','Lalla'];
  colors text[] := ARRAY['menthe','ciel','peche','lilas','citron','rose'];
  h bigint := abs(hashtextextended(p_user::text, 7));
BEGIN
  SELECT * INTO row FROM public.bw_traveller_profiles WHERE user_id = p_user;
  IF FOUND THEN RETURN row; END IF;
  INSERT INTO public.bw_traveller_profiles(user_id, pseudo, avatar, color)
  VALUES (p_user, names[(1 + h % 12)::int] || ' ' || (1000 + (h / 12) % 9000)::text,
          avatars[(1 + h % 12)::int], colors[(1 + (h / 7) % 6)::int])
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO row FROM public.bw_traveller_profiles WHERE user_id = p_user;
  RETURN row;
END $$;
REVOKE ALL ON FUNCTION private.bw_ensure_traveller(uuid) FROM PUBLIC;

-- Carte publique d'un voyageur : rien qui permette de l'identifier.
CREATE OR REPLACE FUNCTION private.bw_traveller_card(p public.bw_traveller_profiles)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'handle', p.handle, 'pseudo', p.pseudo, 'avatar', p.avatar, 'color', p.color,
    'mood', CASE WHEN p.mood_until > now() THEN (
      SELECT jsonb_build_object('code', m.code, 'label', m.label, 'emoji', m.emoji, 'image', m.image)
      FROM public.bw_moods m WHERE m.code = p.mood_code AND m.active) END)
$$;
REVOKE ALL ON FUNCTION private.bw_traveller_card(public.bw_traveller_profiles) FROM PUBLIC;

-- 3. Mon profil (créé à la première lecture).
CREATE OR REPLACE FUNCTION public.bw_my_traveller()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.bw_traveller_profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  p := private.bw_ensure_traveller(auth.uid());
  RETURN private.bw_traveller_card(p) || jsonb_build_object('show_on_trip', p.show_on_trip,
    'mood_until', CASE WHEN p.mood_until > now() THEN p.mood_until END);
END $$;

CREATE OR REPLACE FUNCTION public.bw_save_traveller(p_pseudo text, p_avatar text, p_color text, p_show_on_trip boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM private.bw_ensure_traveller(auth.uid());
  UPDATE public.bw_traveller_profiles
     SET pseudo = btrim(regexp_replace(p_pseudo, '\s+', ' ', 'g')), avatar = p_avatar, color = p_color,
         show_on_trip = coalesce(p_show_on_trip, true), updated_at = now()
   WHERE user_id = auth.uid();
  RETURN public.bw_my_traveller();
END $$;

-- Humeur du moment : 24 h, choisie dans le catalogue (NULL pour la retirer).
CREATE OR REPLACE FUNCTION public.bw_set_mood(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM private.bw_ensure_traveller(auth.uid());
  IF p_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bw_moods WHERE code = p_code AND active) THEN
    RAISE EXCEPTION 'Humeur inconnue';
  END IF;
  UPDATE public.bw_traveller_profiles
     SET mood_code = p_code, mood_until = CASE WHEN p_code IS NULL THEN NULL ELSE now() + interval '24 hours' END,
         updated_at = now()
   WHERE user_id = auth.uid();
  RETURN public.bw_my_traveller();
END $$;

-- 4. Les voyageurs d'une traversée (« je voyage » + visible sur la traversée), avec leur étape.
CREATE OR REPLACE FUNCTION public.bw_trip_travellers(p_departure uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; total integer;
BEGIN
  SELECT count(*) INTO total FROM public.bw_follows f
   WHERE f.target_kind = 'departure' AND f.target_id = p_departure AND f.active AND f.traveller;
  SELECT coalesce(jsonb_agg(card ORDER BY mine DESC, has_mood DESC, updated DESC), '[]'::jsonb) INTO result FROM (
    SELECT private.bw_traveller_card(p) || jsonb_build_object('step', s.status, 'me', f.user_id = auth.uid()) AS card,
           f.user_id = auth.uid() AS mine, p.mood_until > now() AS has_mood, p.updated_at AS updated
      FROM public.bw_follows f
      CROSS JOIN LATERAL private.bw_ensure_traveller(f.user_id) p
      LEFT JOIN public.bw_trip_status s ON s.user_id = f.user_id AND s.departure_id = p_departure
     WHERE f.target_kind = 'departure' AND f.target_id = p_departure AND f.active AND f.traveller
       AND (p.show_on_trip OR f.user_id = auth.uid())
     ORDER BY f.user_id = auth.uid() DESC, p.updated_at DESC
     LIMIT 40
  ) x;
  RETURN jsonb_build_object('total', total, 'travellers', result);
END $$;

-- 5. Profil public : indicateurs cumulés et badges, jamais de dates de voyage.
CREATE OR REPLACE FUNCTION public.bw_public_profile(p_handle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.bw_traveller_profiles; uid uuid;
  alerts integer; confirmed integer; confirmations integer; reviews integer; trips integer;
  fav_vessel text; fav_vessel_n integer; fav_port text; fav_port_n integer; since integer;
  badges jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO p FROM public.bw_traveller_profiles WHERE handle = p_handle;
  IF NOT FOUND THEN RETURN NULL; END IF;
  uid := p.user_id;
  SELECT count(*) INTO alerts FROM public.bw_travel_alerts WHERE user_id = uid;
  SELECT count(*) INTO confirmed FROM public.bw_travel_alerts a
   WHERE a.user_id = uid AND EXISTS (SELECT 1 FROM public.bw_alert_confirmations c WHERE c.alert_id = a.id);
  SELECT count(*) INTO confirmations FROM public.bw_alert_confirmations WHERE user_id = uid;
  SELECT (SELECT count(*) FROM public.port_reviews WHERE user_id = uid AND status = 'published')
       + (SELECT count(*) FROM public.bw_vessel_reviews WHERE user_id = uid AND status = 'published') INTO reviews;
  SELECT count(*) INTO trips FROM public.bw_follows f JOIN public.departures d ON d.id = f.target_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller AND d.departure_at < now();
  SELECT v.name, count(*) INTO fav_vessel, fav_vessel_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.vessels v ON v.id = d.vessel_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY v.name ORDER BY count(*) DESC, v.name LIMIT 1;
  SELECT po.name, count(*) INTO fav_port, fav_port_n FROM public.bw_follows f
    JOIN public.departures d ON d.id = f.target_id JOIN public.routes r ON r.id = d.route_id
    JOIN public.ports po ON po.id = r.departure_port_id
   WHERE f.user_id = uid AND f.target_kind = 'departure' AND f.traveller
   GROUP BY po.name ORDER BY count(*) DESC, po.name LIMIT 1;
  SELECT extract(year FROM created_at)::integer INTO since FROM auth.users WHERE id = uid;
  IF alerts >= 1 THEN badges := badges || '{"code":"premier_signalement","label":"Premier signalement"}'; END IF;
  IF confirmed >= 10 THEN badges := badges || '{"code":"oeil_de_lynx","label":"10 infos confirmées"}'; END IF;
  IF confirmations >= 10 THEN badges := badges || '{"code":"entraide","label":"Toujours là pour confirmer"}'; END IF;
  IF reviews >= 1 THEN badges := badges || '{"code":"plume","label":"A donné son avis"}'; END IF;
  IF trips >= 5 THEN badges := badges || '{"code":"habitue","label":"5 traversées"}'; END IF;
  IF fav_vessel_n >= 3 THEN badges := badges || jsonb_build_object('code', 'fidele', 'label', 'Fidèle du ' || fav_vessel); END IF;
  IF fav_port_n >= 3 THEN badges := badges || jsonb_build_object('code', 'port', 'label', 'Habitué·e de ' || fav_port); END IF;
  RETURN private.bw_traveller_card(p) || jsonb_build_object(
    'since', since, 'contributions', alerts + reviews, 'confirmed', confirmed,
    'confirmations', confirmations, 'reviews', reviews, 'trips', trips,
    'favorite_vessel', fav_vessel, 'favorite_port', fav_port, 'badges', badges,
    'me', uid = auth.uid());
END $$;

-- 6. Auteurs des signalements et des avis affichés (cabas, pseudo, humeur), sans identifiant de compte.
CREATE OR REPLACE FUNCTION public.bw_contribution_authors(p_kind text, p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_kind NOT IN ('alert','port_review','vessel_review') OR coalesce(array_length(p_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Demande invalide';
  END IF;
  SELECT coalesce(jsonb_object_agg(x.id, private.bw_traveller_card(p)), '{}'::jsonb) INTO result
    FROM (
      SELECT id, user_id FROM public.bw_travel_alerts WHERE p_kind = 'alert' AND id = ANY(p_ids)
      UNION ALL SELECT id, user_id FROM public.port_reviews WHERE p_kind = 'port_review' AND id = ANY(p_ids) AND status = 'published'
      UNION ALL SELECT id, user_id FROM public.bw_vessel_reviews WHERE p_kind = 'vessel_review' AND id = ANY(p_ids) AND status = 'published'
    ) x CROSS JOIN LATERAL private.bw_ensure_traveller(x.user_id) p;
  RETURN result;
END $$;

-- 7. Réactions légères : merci, courage, bon voyage, bien vu (une de chaque par voyageur et contribution).
CREATE TABLE IF NOT EXISTS public.bw_reactions (
  target_kind text NOT NULL CHECK (target_kind IN ('alert','port_review','vessel_review')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('merci','courage','bon_voyage','bien_vu')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, user_id, code)
);
CREATE INDEX IF NOT EXISTS bw_reactions_target ON public.bw_reactions(target_kind, target_id);
ALTER TABLE public.bw_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bw_reactions FROM anon, authenticated;
GRANT ALL ON public.bw_reactions TO service_role;

CREATE OR REPLACE FUNCTION public.bw_react(p_kind text, p_target uuid, p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  IF p_kind NOT IN ('alert','port_review','vessel_review') OR p_code NOT IN ('merci','courage','bon_voyage','bien_vu') THEN
    RAISE EXCEPTION 'Réaction inconnue';
  END IF;
  IF (SELECT count(*) FROM public.bw_reactions WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'Doucement : réessayez dans une minute';
  END IF;
  DELETE FROM public.bw_reactions WHERE target_kind = p_kind AND target_id = p_target AND user_id = auth.uid() AND code = p_code;
  IF FOUND THEN RETURN false; END IF;
  INSERT INTO public.bw_reactions(target_kind, target_id, user_id, code) VALUES (p_kind, p_target, auth.uid(), p_code);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.bw_reaction_counts(p_kind text, p_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(target_id, counts), '{}'::jsonb) FROM (
    SELECT target_id, jsonb_object_agg(code, jsonb_build_object('n', n, 'mine', mine)) AS counts FROM (
      SELECT target_id, code, count(*)::integer AS n, bool_or(user_id = auth.uid()) AS mine
        FROM public.bw_reactions
       WHERE target_kind = p_kind AND target_id = ANY(p_ids[1:200])
       GROUP BY target_id, code
    ) c GROUP BY target_id
  ) t
$$;

REVOKE ALL ON FUNCTION public.bw_my_traveller(), public.bw_save_traveller(text,text,text,boolean),
  public.bw_set_mood(text), public.bw_trip_travellers(uuid), public.bw_public_profile(text),
  public.bw_contribution_authors(text,uuid[]), public.bw_react(text,uuid,text),
  public.bw_reaction_counts(text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_my_traveller(), public.bw_save_traveller(text,text,text,boolean),
  public.bw_set_mood(text), public.bw_react(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bw_trip_travellers(uuid), public.bw_public_profile(text),
  public.bw_contribution_authors(text,uuid[]), public.bw_reaction_counts(text,uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
