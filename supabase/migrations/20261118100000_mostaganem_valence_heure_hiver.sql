-- Mostaganem → Valence : horaire d'hiver, 18:30 à Mostaganem au lieu de 19:30. Durée inchangée.
UPDATE public.departures d
SET departure_at = d.departure_at - interval '1 hour', arrival_at = d.arrival_at - interval '1 hour'
FROM public.routes r
JOIN public.ports a ON a.id = r.departure_port_id
JOIN public.ports b ON b.id = r.arrival_port_id
WHERE r.id = d.route_id AND a.name = 'Mostaganem' AND b.name = 'Valence'
  AND d.departure_at > now() AND d.status <> 'cancelled'
  AND to_char(d.departure_at AT TIME ZONE 'Africa/Algiers', 'HH24:MI') = '19:30';
