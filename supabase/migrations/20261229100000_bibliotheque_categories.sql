-- BledWay · Bibliothèque d'emojis et d'avatars, rangée par catégories (08/11/2026).
-- Avant : trois listes séparées. L'avatar du profil ne proposait que la table bw_avatars
-- (personnages + images d'humeur), l'humeur seulement les 24 humeurs de bw_moods, et le salon
-- une liste figée dans le code. Les « catégories » étaient des types figés (persona / mood / other).
-- Désormais :
--   • une seule bibliothèque (bw_avatars), complétée par toutes les images du site
--     (humeurs, réactions, pictos) qui n'y étaient pas encore ;
--   • des catégories libres, gérées par l'équipe, qui servent seulement à RANGER : une image peut
--     être dans plusieurs catégories ou dans aucune, et reste choisissable partout ;
--   • l'humeur peut être n'importe quelle image de la bibliothèque (bw_set_mood_item).
-- Supprimer une catégorie ne supprime aucune image : ses images vont dans la catégorie choisie,
-- ou restent dans « Sans catégorie ». Les profils, humeurs et messages existants ne changent pas.
-- Prérequis : script « avatars_admin » (table bw_avatars). Le script peut être relancé.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.bw_avatars') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord le script avatars_admin (table bw_avatars).';
  END IF;
END $$;

-- 1. Compléter la bibliothèque avec les images du site absentes (même image = pas de doublon).
--    Les personnages ne sont pas recréés : ceux que l'équipe a supprimés restent supprimés.
INSERT INTO public.bw_avatars(id, label, kind, image, sort)
SELECT v.id, v.label, 'other', v.image, v.sort
FROM (VALUES
  ('h_01_valise_pleine','Valise pleine','/cabas/humeurs/01_valise_pleine.webp',2010),
  ('h_02_glaciere','Glacière','/cabas/humeurs/02_glaciere.webp',2020),
  ('h_03_surpoids','Surpoids','/cabas/humeurs/03_surpoids.webp',2030),
  ('h_04_reveil_4h','Réveil à 4 h','/cabas/humeurs/04_reveil_4h.webp',2040),
  ('h_05_yallah','Yallah','/cabas/humeurs/05_yallah.webp',2050),
  ('h_06_galerie','Galerie','/cabas/humeurs/06_galerie.webp',2060),
  ('h_07_mobylette','Mobylette','/cabas/humeurs/07_mobylette.webp',2070),
  ('h_08_bouchon','Bouchon','/cabas/humeurs/08_bouchon.webp',2080),
  ('h_09_pneu_creve','Pneu crevé','/cabas/humeurs/09_pneu_creve.webp',2090),
  ('h_10_route_longue','Route longue','/cabas/humeurs/10_route_longue.webp',2100),
  ('h_11_file_attente','File d''attente','/cabas/humeurs/11_file_attente.webp',2110),
  ('h_12_chemma','Chemma','/cabas/humeurs/12_chemma.webp',2120),
  ('h_13_billet_perdu','Billet perdu','/cabas/humeurs/13_billet_perdu.webp',2130),
  ('h_14_controle','Contrôle','/cabas/humeurs/14_controle.webp',2140),
  ('h_15_retard','Retard','/cabas/humeurs/15_retard.webp',2150),
  ('h_16_annule','Annulé','/cabas/humeurs/16_annule.webp',2160),
  ('h_17_embarquement','Embarquement','/cabas/humeurs/17_embarquement.webp',2170),
  ('h_18_mal_de_mer','Mal de mer','/cabas/humeurs/18_mal_de_mer.webp',2180),
  ('h_19_dodo_pont','Dodo sur le pont','/cabas/humeurs/19_dodo_pont.webp',2190),
  ('h_20_tempete','Tempête','/cabas/humeurs/20_tempete.webp',2200),
  ('h_21_selfie','Selfie','/cabas/humeurs/21_selfie.webp',2210),
  ('h_22_msemen','Msemen','/cabas/humeurs/22_msemen.webp',2220),
  ('h_23_pas_de_reseau','Pas de réseau','/cabas/humeurs/23_pas_de_reseau.webp',2230),
  ('h_24_ambiance','Ambiance','/cabas/humeurs/24_ambiance.webp',2240),
  ('h_25_ennui_traversee','Ennui','/cabas/humeurs/25_ennui_traversee.webp',2250),
  ('h_26_la_cote','La côte','/cabas/humeurs/26_la_cote.webp',2260),
  ('h_27_debarquement','Débarquement','/cabas/humeurs/27_debarquement.webp',2270),
  ('h_28_fouille','Fouille','/cabas/humeurs/28_fouille.webp',2280),
  ('h_29_douane_ok','Douane OK','/cabas/humeurs/29_douane_ok.webp',2290),
  ('h_30_chaleur','Chaleur','/cabas/humeurs/30_chaleur.webp',2300),
  ('h_31_chaise_plastique','Chaise en plastique','/cabas/humeurs/31_chaise_plastique.webp',2310),
  ('h_32_accueil','Accueil','/cabas/humeurs/32_accueil.webp',2320),
  ('h_33_bien_arrive','Bien arrivé','/cabas/humeurs/33_bien_arrive.webp',2330),
  ('h_34_ko_total','KO total','/cabas/humeurs/34_ko_total.webp',2340),
  ('h_35_adieux','Adieux','/cabas/humeurs/35_adieux.webp',2350),
  ('h_36_bidons_huile','Bidons d''huile','/cabas/humeurs/36_bidons_huile.webp',2360),
  ('h_37_deja_nostalgique','Déjà nostalgique','/cabas/humeurs/37_deja_nostalgique.webp',2370),
  ('r_merci','Merci','/cabas/reactions/merci.webp',3010),
  ('r_courage','Courage','/cabas/reactions/courage.webp',3020),
  ('r_bon_voyage','Bon voyage','/cabas/reactions/bon_voyage.webp',3030),
  ('r_bien_vu','Bien vu','/cabas/reactions/bien_vu.webp',3040),
  ('p_viva_algerie','Viva l''Algérie','/cabas/pictos/viva_algerie.webp',4010),
  ('p_yallah','Yallah','/cabas/pictos/yallah.webp',4020),
  ('p_zen','Zen','/cabas/pictos/zen.webp',4030),
  ('p_valise_pleine','Valise pleine','/cabas/pictos/valise_pleine.webp',4040),
  ('p_surpoids','Surpoids','/cabas/pictos/surpoids.webp',4050),
  ('p_route_longue','Route longue','/cabas/pictos/route_longue.webp',4060),
  ('p_bouchon','Bouchon','/cabas/pictos/bouchon.webp',4070),
  ('p_file','File','/cabas/pictos/file.webp',4080),
  ('p_controle','Contrôle','/cabas/pictos/controle.webp',4090),
  ('p_msemen','Msemen','/cabas/pictos/msemen.webp',4100),
  ('p_chaleur','Chaleur','/cabas/pictos/chaleur.webp',4110)
) AS v(id, label, image, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.bw_avatars a WHERE a.image = v.image)
ON CONFLICT (id) DO NOTHING;

-- 2. Catégories (rangement seulement) et affectations (une image peut être dans plusieurs).
CREATE TABLE IF NOT EXISTS public.bw_library_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bw_library_categories_label
  ON public.bw_library_categories (lower(btrim(label)));

CREATE TABLE IF NOT EXISTS public.bw_library_category_items (
  category_id uuid NOT NULL REFERENCES public.bw_library_categories(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.bw_avatars(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sort integer NOT NULL DEFAULT 100,
  PRIMARY KEY (category_id, item_id)
);
CREATE INDEX IF NOT EXISTS bw_library_category_items_item ON public.bw_library_category_items (item_id);

ALTER TABLE public.bw_library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_library_category_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bw_library_categories, public.bw_library_category_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bw_library_categories, public.bw_library_category_items TO authenticated;
GRANT ALL ON public.bw_library_categories, public.bw_library_category_items TO service_role;

DROP POLICY IF EXISTS bw_library_categories_read ON public.bw_library_categories;
CREATE POLICY bw_library_categories_read ON public.bw_library_categories
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS bw_library_categories_staff ON public.bw_library_categories;
CREATE POLICY bw_library_categories_staff ON public.bw_library_categories FOR ALL TO authenticated
  USING (coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false))
  WITH CHECK (coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false));

DROP POLICY IF EXISTS bw_library_category_items_read ON public.bw_library_category_items;
CREATE POLICY bw_library_category_items_read ON public.bw_library_category_items
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS bw_library_category_items_staff ON public.bw_library_category_items;
CREATE POLICY bw_library_category_items_staff ON public.bw_library_category_items FOR ALL TO authenticated
  USING (coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false))
  WITH CHECK (coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false));

-- Premier rangement, seulement à la première exécution (ensuite, c'est l'équipe qui décide).
DO $$
DECLARE c_persos uuid; c_humeurs uuid; c_reactions uuid; c_pictos uuid; c_equipe uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.bw_library_categories) THEN RETURN; END IF;
  INSERT INTO public.bw_library_categories(label, sort) VALUES ('Personnages', 10) RETURNING id INTO c_persos;
  INSERT INTO public.bw_library_categories(label, sort) VALUES ('Humeurs', 20) RETURNING id INTO c_humeurs;
  INSERT INTO public.bw_library_categories(label, sort) VALUES ('Réactions', 30) RETURNING id INTO c_reactions;
  INSERT INTO public.bw_library_categories(label, sort) VALUES ('Pictos', 40) RETURNING id INTO c_pictos;
  INSERT INTO public.bw_library_categories(label, sort) VALUES ('Ajoutés par l''équipe', 50) RETURNING id INTO c_equipe;
  INSERT INTO public.bw_library_category_items(category_id, item_id, sort)
    SELECT c_persos, id, sort FROM public.bw_avatars WHERE kind = 'persona'
    UNION ALL
    SELECT c_humeurs, id, sort FROM public.bw_avatars
      WHERE kind = 'mood' OR image LIKE '/cabas/humeurs/%'
    UNION ALL
    SELECT c_reactions, id, sort FROM public.bw_avatars WHERE image LIKE '/cabas/reactions/%'
    UNION ALL
    SELECT c_pictos, id, sort FROM public.bw_avatars WHERE image LIKE '/cabas/pictos/%'
    UNION ALL
    SELECT c_equipe, id, sort FROM public.bw_avatars WHERE kind = 'other' AND image LIKE 'https://%'
  ON CONFLICT DO NOTHING;
END $$;

-- Supprimer une catégorie : ses images vont dans p_move_to (si donnée), sinon restent sans catégorie.
-- Aucune image n'est supprimée. Renvoie le nombre d'images concernées.
CREATE OR REPLACE FUNCTION public.bw_delete_library_category(p_id uuid, p_move_to uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE moved integer;
BEGIN
  IF NOT coalesce(private.bw_staff_permission(ARRAY['admin','editor']), false) THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;
  IF p_move_to = p_id THEN RAISE EXCEPTION 'Choisissez une autre catégorie'; END IF;
  SELECT count(*) INTO moved FROM public.bw_library_category_items WHERE category_id = p_id;
  IF p_move_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bw_library_categories WHERE id = p_move_to) THEN
      RAISE EXCEPTION 'Catégorie de destination introuvable';
    END IF;
    INSERT INTO public.bw_library_category_items(category_id, item_id, sort)
      SELECT p_move_to, item_id, sort FROM public.bw_library_category_items WHERE category_id = p_id
      ON CONFLICT DO NOTHING;
  END IF;
  DELETE FROM public.bw_library_categories WHERE id = p_id;
  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION public.bw_delete_library_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_delete_library_category(uuid, uuid) TO authenticated;

-- 3. L'humeur peut être n'importe quelle image de la bibliothèque.
--    Une image qui n'est pas déjà une humeur reçoit une humeur « miroir » (cachée de l'admin des
--    humeurs), qui suit le nom et l'image de la bibliothèque et disparaît avec elle.
ALTER TABLE public.bw_moods
  ADD COLUMN IF NOT EXISTS library_item text REFERENCES public.bw_avatars(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS bw_moods_library_item ON public.bw_moods (library_item)
  WHERE library_item IS NOT NULL;
-- Une image envoyée par l'équipe (adresse https) peut désormais servir d'humeur.
ALTER TABLE public.bw_moods DROP CONSTRAINT IF EXISTS bw_moods_image_check;
ALTER TABLE public.bw_moods ADD CONSTRAINT bw_moods_image_check
  CHECK (image ~ '^/cabas/[a-z0-9_/-]+\.webp$' OR image ~ '^https://');

CREATE OR REPLACE FUNCTION public.bw_set_mood_item(p_item text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.bw_avatars; mood text; name text;
BEGIN
  IF NOT private.bw_account_active() THEN RAISE EXCEPTION 'Compte actif requis'; END IF;
  PERFORM private.bw_ensure_traveller(auth.uid());
  SELECT * INTO item FROM public.bw_avatars WHERE id = p_item AND active;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Image indisponible'; END IF;
  -- Image d'une humeur existante (« humeur_zen ») : on garde sa phrase.
  SELECT code INTO mood FROM public.bw_moods
   WHERE active AND library_item IS NULL AND item.id = 'humeur_' || code;
  IF mood IS NULL THEN
    name := left(btrim(item.label), 40);
    IF char_length(name) < 2 THEN name := rpad(name, 2, '·'); END IF;
    INSERT INTO public.bw_moods(code, label, emoji, image, moments, sort, active, library_item)
    VALUES ('l_' || substr(md5(item.id), 1, 16), name, '', item.image, '{}', 9000, true, item.id)
    ON CONFLICT (code) DO UPDATE SET label = excluded.label, image = excluded.image, active = true,
      library_item = excluded.library_item, updated_at = now()
    RETURNING code INTO mood;
  END IF;
  UPDATE public.bw_traveller_profiles
     SET mood_code = mood, mood_until = now() + interval '24 hours', updated_at = now()
   WHERE user_id = auth.uid();
  RETURN public.bw_my_traveller();
END $$;
REVOKE ALL ON FUNCTION public.bw_set_mood_item(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_set_mood_item(text) TO authenticated;

-- Renommer ou remplacer une image de la bibliothèque met à jour son humeur miroir.
CREATE OR REPLACE FUNCTION private.bw_library_sync_mood() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.bw_moods
     SET label = CASE WHEN char_length(left(btrim(NEW.label), 40)) < 2
                      THEN rpad(left(btrim(NEW.label), 40), 2, '·') ELSE left(btrim(NEW.label), 40) END,
         image = NEW.image, updated_at = now()
   WHERE library_item = NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bw_library_sync_mood ON public.bw_avatars;
CREATE TRIGGER bw_library_sync_mood AFTER UPDATE OF label, image ON public.bw_avatars
  FOR EACH ROW EXECUTE FUNCTION private.bw_library_sync_mood();

NOTIFY pgrst, 'reload schema';
COMMIT;
