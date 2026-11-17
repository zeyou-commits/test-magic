-- BledWay · Le site proposé pour réserver un hôtel (fiche « La réservation d'hôtel pour le visa »
-- du parcours Préparer). Booking.com au départ ; modifiable dans l'admin (Données de référence),
-- lisible par tous les visiteurs.

INSERT INTO public.bw_admin_settings (key, value)
VALUES (
  'hotel_booking',
  '{"label": "Chercher un hôtel sur Booking.com", "href": "https://www.booking.com/country/dz.fr.html"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Lecture publique de ce seul réglage (la table reste réservée à l'équipe).
CREATE OR REPLACE FUNCTION public.bw_hotel_booking_link()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT s.value FROM public.bw_admin_settings s WHERE s.key = 'hotel_booking';
$function$;
REVOKE ALL ON FUNCTION public.bw_hotel_booking_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_hotel_booking_link() TO anon, authenticated;
