-- BledWay · Admin « Utilisateurs » et photo de profil (18/11/2026).
--   1. Liste des comptes (admin) : le pseudo voyageur, son avatar et sa photo, pour reconnaître
--      chaque personne d'un coup d'œil ; la recherche trouve aussi le pseudo.
--   2. Photo de profil : un voyageur peut envoyer sa propre photo à la place de son avatar.
--      Mêmes garde-fous que les autres photos du site (réduite et sans métadonnées sur
--      l'appareil, filtre de contenu explicite, accord de l'auteur, validation par l'équipe avant
--      publication, signalement, suppression avec le compte, ménage de nuit). Seule différence :
--      le visage n'est pas flouté, puisque c'est une photo de profil.
-- Prérequis : le script « photos » (table bw_photos) et le script « communauté » (profils).
-- Aucune donnée existante n'est modifiée. Le script peut être relancé.
-- Par prudence, il s'arrête sans rien changer si les deux fonctions qu'il réécrit ne sont plus
-- celles du dépôt (modifiées entre-temps directement dans Supabase).
BEGIN;

DO $check$
DECLARE body text;
BEGIN
  IF to_regclass('public.bw_photos') IS NULL OR to_regclass('public.bw_traveller_profiles') IS NULL THEN
    RAISE EXCEPTION 'Exécutez d''abord les scripts « photos » et « communauté ».';
  END IF;
  SELECT prosrc INTO body FROM pg_proc WHERE oid = 'private.bw_traveller_card(public.bw_traveller_profiles)'::regprocedure;
  IF body NOT LIKE '%profile_photo%'
     AND md5(regexp_replace(body, '\s', '', 'g')) <> 'c5031d5af49a6fea75733f87386b895e' THEN
    RAISE EXCEPTION 'private.bw_traveller_card a été modifiée hors du dépôt : script arrêté, rien n''a changé.';
  END IF;
  SELECT prosrc INTO body FROM pg_proc WHERE oid = 'public.bw_admin_users_page(uuid,text,integer,text)'::regprocedure;
  IF body NOT LIKE '%profile_photo%'
     AND md5(regexp_replace(body, '\s', '', 'g')) <> 'c0bc91d3ddc53560d58ec269f2728240' THEN
    RAISE EXCEPTION 'public.bw_admin_users_page a été modifiée hors du dépôt : script arrêté, rien n''a changé.';
  END IF;
END
$check$;

-- 1. Les photos acceptent un nouveau type : « profile » (parent = le compte lui-même).
DO $kind$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bw_photos'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%vessel_review%' LOOP
    EXECUTE format('ALTER TABLE public.bw_photos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$kind$;
ALTER TABLE public.bw_photos ADD CONSTRAINT bw_photos_kind_check
  CHECK (kind IN ('report', 'vessel_review', 'port_review', 'chat', 'profile'));

-- 2. Envoyer sa photo de profil : déposée en attente, l'équipe la valide avant publication.
--    Une nouvelle photo remplace celle qui attendait encore ; la photo déjà validée reste
--    affichée jusqu'à la validation de la nouvelle.
CREATE OR REPLACE FUNCTION public.bw_profile_photo_submit(p_path text, p_width integer, p_height integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); new_id uuid;
BEGIN
  IF me IS NULL OR NOT private.bw_account_active() THEN RAISE EXCEPTION 'Connectez-vous pour envoyer une photo.'; END IF;
  IF p_path IS NULL OR p_path NOT LIKE me::text || '/profil-%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Photo invalide.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bledway-photos-attente' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Photo introuvable : renvoyez-la.';
  END IF;
  IF (SELECT count(*) FROM public.bw_photos WHERE user_id = me AND created_at > now() - interval '24 hours') >= 12 THEN
    RAISE EXCEPTION 'Patientez : 12 photos au plus par jour.';
  END IF;
  IF (SELECT count(*) FROM public.bw_photos WHERE user_id = me AND kind = 'profile' AND created_at > now() - interval '24 hours') >= 3 THEN
    RAISE EXCEPTION 'Patientez : 3 photos de profil au plus par jour.';
  END IF;
  DELETE FROM public.bw_photos WHERE user_id = me AND kind = 'profile' AND status = 'pending';
  INSERT INTO public.bw_photos(user_id, kind, parent_id, pending_path, width, height)
  VALUES (me, 'profile', me, p_path, p_width, p_height) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Ma photo de profil : celle qui est affichée et celle qui attend la validation.
CREATE OR REPLACE FUNCTION public.bw_my_profile_photo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'approved', (SELECT jsonb_build_object('id', p.id, 'path', p.public_path) FROM public.bw_photos p
      WHERE p.user_id = auth.uid() AND p.kind = 'profile' AND p.status = 'approved' AND p.public_path IS NOT NULL
      ORDER BY p.decided_at DESC NULLS LAST LIMIT 1),
    'pending', (SELECT jsonb_build_object('id', p.id) FROM public.bw_photos p
      WHERE p.user_id = auth.uid() AND p.kind = 'profile' AND p.status = 'pending'
      ORDER BY p.created_at DESC LIMIT 1))
$$;

-- Une photo validée remplace l'ancienne (le fichier part à la corbeille, vidée chaque nuit).
CREATE OR REPLACE FUNCTION private.bw_profile_photo_approved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.bw_photos
   WHERE user_id = NEW.user_id AND kind = 'profile' AND status = 'approved' AND id <> NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_profile_photo_approved() FROM PUBLIC;
DROP TRIGGER IF EXISTS bw_profile_photo_approved ON public.bw_photos;
CREATE TRIGGER bw_profile_photo_approved AFTER UPDATE OF status ON public.bw_photos
  FOR EACH ROW WHEN (NEW.kind = 'profile' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION private.bw_profile_photo_approved();

-- Deux signalements : la photo de profil est retirée de l'affichage et repasse par l'équipe.
CREATE OR REPLACE FUNCTION private.bw_profile_photo_reported() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.bw_photo_reports WHERE photo_id = NEW.photo_id) >= 2 THEN
    UPDATE public.bw_photos SET status = 'pending' WHERE id = NEW.photo_id AND kind = 'profile';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_profile_photo_reported() FROM PUBLIC;
DROP TRIGGER IF EXISTS bw_profile_photo_reported ON public.bw_photo_reports;
CREATE TRIGGER bw_profile_photo_reported AFTER INSERT ON public.bw_photo_reports
  FOR EACH ROW EXECUTE FUNCTION private.bw_profile_photo_reported();

-- 3. Carte publique d'un voyageur : la photo validée, s'il en a une (sinon son avatar).
--    Les salons, profils, avis et listes de voyageurs utilisent tous cette carte.
CREATE OR REPLACE FUNCTION private.bw_traveller_card(p public.bw_traveller_profiles)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'handle', p.handle, 'pseudo', p.pseudo, 'avatar', p.avatar, 'color', p.color,
    'mood', CASE WHEN p.mood_until > now() THEN (
      SELECT jsonb_build_object('code', m.code, 'label', m.label, 'emoji', m.emoji, 'image', m.image)
      FROM public.bw_moods m WHERE m.code = p.mood_code AND m.active) END,
    -- profile_photo : photo de profil validée par l'équipe.
    'photo', (SELECT ph.public_path FROM public.bw_photos ph
      WHERE ph.kind = 'profile' AND ph.parent_id = p.user_id AND ph.status = 'approved' AND ph.public_path IS NOT NULL
      ORDER BY ph.decided_at DESC NULLS LAST LIMIT 1))
$$;
REVOKE ALL ON FUNCTION private.bw_traveller_card(public.bw_traveller_profiles) FROM PUBLIC;

-- 4. Liste des comptes (admin) : pseudo, avatar, couleur et photo du profil voyageur.
CREATE OR REPLACE FUNCTION public.bw_admin_users_page(_actor uuid, _search text DEFAULT '', _page integer DEFAULT 1, _filter text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT private.bw_active_admin(_actor) THEN RAISE EXCEPTION 'Accès administrateur requis.'; END IF;
  WITH matched AS (
    SELECT u.id, u.email, p.display_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
      t.pseudo, t.avatar, t.color,
      -- profile_photo : photo validée, ou à défaut celle qui attend la validation (vue par l'équipe).
      (SELECT ph.public_path FROM public.bw_photos ph
        WHERE ph.kind = 'profile' AND ph.parent_id = u.id AND ph.status = 'approved' AND ph.public_path IS NOT NULL
        ORDER BY ph.decided_at DESC NULLS LAST LIMIT 1) AS photo,
      EXISTS (SELECT 1 FROM public.bw_photos ph WHERE ph.kind = 'profile' AND ph.parent_id = u.id AND ph.status = 'pending') AS photo_pending,
      COALESCE((SELECT jsonb_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user'), '[]'::jsonb) AS roles
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.bw_traveller_profiles t ON t.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND (length(trim(_search)) = 0 OR position(lower(trim(_search)) IN lower(COALESCE(u.email, '') || ' ' || COALESCE(p.display_name, '') || ' ' || COALESCE(t.pseudo, ''))) > 0)
      AND (_filter = 'all'
        OR (_filter = 'banned' AND u.banned_until > now())
        OR (_filter = 'team' AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user'))
        OR (_filter = 'travellers' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text <> 'user')))
  ), page AS (SELECT * FROM matched ORDER BY created_at DESC, id LIMIT 30 OFFSET (GREATEST(1, LEAST(_page, 100000)) - 1) * 30)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'audit', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM (SELECT actor_id, target_id, action, created_at FROM public.bw_user_admin_log ORDER BY created_at DESC LIMIT 12) l)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bw_admin_users_page(uuid,text,integer,text) TO service_role;

REVOKE ALL ON FUNCTION public.bw_profile_photo_submit(text, integer, integer), public.bw_my_profile_photo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bw_profile_photo_submit(text, integer, integer), public.bw_my_profile_photo() TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
