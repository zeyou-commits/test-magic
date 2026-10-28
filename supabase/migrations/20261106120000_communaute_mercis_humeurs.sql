-- BledWay · Communauté, suite : « mercis » reçus sur le profil, et humeur dominante d'un port
-- ou d'un bateau (affichée sur la carte avec les cabas des voyageurs présents).
-- Prérequis : script 20261105120000_communaute_profils.sql. Script additif, il peut être relancé.
BEGIN;

CREATE OR REPLACE FUNCTION public.bw_public_profile(p_handle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.bw_traveller_profiles; uid uuid;
  alerts integer; confirmed integer; confirmations integer; reviews integer; trips integer;
  fav_vessel text; fav_vessel_n integer; fav_port text; fav_port_n integer; since integer;
  badges jsonb := '[]'::jsonb; thanks integer;
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
  -- « Merci » reçus sur ses signalements et ses avis (hors les siens).
  SELECT count(*) INTO thanks FROM public.bw_reactions x
   WHERE x.code = 'merci' AND x.user_id <> uid AND (
         (x.target_kind = 'alert' AND EXISTS (SELECT 1 FROM public.bw_travel_alerts a WHERE a.id = x.target_id AND a.user_id = uid))
      OR (x.target_kind = 'port_review' AND EXISTS (SELECT 1 FROM public.port_reviews r WHERE r.id = x.target_id AND r.user_id = uid))
      OR (x.target_kind = 'vessel_review' AND EXISTS (SELECT 1 FROM public.bw_vessel_reviews r WHERE r.id = x.target_id AND r.user_id = uid)));
  SELECT extract(year FROM created_at)::integer INTO since FROM auth.users WHERE id = uid;
  IF alerts >= 1 THEN badges := badges || '{"code":"premier_signalement","label":"Premier signalement"}'; END IF;
  IF confirmed >= 10 THEN badges := badges || '{"code":"oeil_de_lynx","label":"10 infos confirmées"}'; END IF;
  IF confirmations >= 10 THEN badges := badges || '{"code":"entraide","label":"Toujours là pour confirmer"}'; END IF;
  IF thanks >= 25 THEN badges := badges || '{"code":"merci","label":"25 mercis reçus"}'; END IF;
  IF reviews >= 1 THEN badges := badges || '{"code":"plume","label":"A donné son avis"}'; END IF;
  IF trips >= 5 THEN badges := badges || '{"code":"habitue","label":"5 traversées"}'; END IF;
  IF fav_vessel_n >= 3 THEN badges := badges || jsonb_build_object('code', 'fidele', 'label', 'Fidèle du ' || fav_vessel); END IF;
  IF fav_port_n >= 3 THEN badges := badges || jsonb_build_object('code', 'port', 'label', 'Habitué·e de ' || fav_port); END IF;
  RETURN private.bw_traveller_card(p) || jsonb_build_object(
    'since', since, 'contributions', alerts + reviews, 'confirmed', confirmed,
    'confirmations', confirmations, 'reviews', reviews, 'thanks', thanks, 'trips', trips,
    'favorite_vessel', fav_vessel, 'favorite_port', fav_port, 'badges', badges,
    'me', uid = auth.uid());
END $$;

-- Humeur la plus partagée par les voyageurs au port (étape « Au port ») ou à bord (« À bord »),
-- statut et humeur de moins de 24 h. Aucune identité : un code d'humeur et un nombre.
CREATE OR REPLACE FUNCTION public.bw_place_moods()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'target', target, 'count', n,
           'mood', jsonb_build_object('code', m.code, 'label', m.label, 'emoji', m.emoji, 'image', m.image))), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (kind, target) kind, target, code, n FROM (
      SELECT CASE s.status WHEN 'port' THEN 'port' ELSE 'vessel' END AS kind,
             CASE s.status WHEN 'port' THEN r.departure_port_id ELSE d.vessel_id END AS target,
             p.mood_code AS code, count(*)::integer AS n
        FROM public.bw_trip_status s
        JOIN public.departures d ON d.id = s.departure_id
        JOIN public.routes r ON r.id = d.route_id
        JOIN public.bw_traveller_profiles p ON p.user_id = s.user_id
       WHERE s.status IN ('port', 'onboard') AND s.updated_at > now() - interval '24 hours'
         AND p.mood_until > now() AND p.mood_code IS NOT NULL AND p.show_on_trip
       GROUP BY 1, 2, 3
    ) g WHERE target IS NOT NULL
    ORDER BY kind, target, n DESC, code
  ) t JOIN public.bw_moods m ON m.code = t.code AND m.active
$$;
REVOKE ALL ON FUNCTION public.bw_place_moods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_place_moods() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
