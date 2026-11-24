-- Fil des salons sur la carte : les messages du salon général restent 7 jours (au lieu de 6 h).
-- Les salons de traversée gardent leurs 6 dernières heures. Le reste est inchangé.
CREATE OR REPLACE FUNCTION public.bw_chat_ticker(p_limit integer DEFAULT 12)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT m.created_at, jsonb_build_object(
      'id', m.id,
      'kind', m.room_kind,
      'room', m.room_id,
      'place', m.place,
      'body', left(private.bw_chat_plain(m.body), 140),
      'created_at', m.created_at,
      'author', private.bw_chat_author(m.user_id, m.official),
      'label', CASE WHEN m.room_kind = 'general' THEN 'Salon général' ELSE (
                 SELECT a.name || ' → ' || b.name
                   FROM public.departures d
                   JOIN public.routes r ON r.id = d.route_id
                   JOIN public.ports a ON a.id = r.departure_port_id
                   JOIN public.ports b ON b.id = r.arrival_port_id
                  WHERE d.id = m.room_id) END
    ) AS item
    FROM public.bw_chat_messages m
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.hidden_at IS NULL
      AND m.created_at > now() - CASE WHEN m.room_kind = 'general' THEN interval '7 days' ELSE interval '6 hours' END
      AND (m.official OR m.place = 'staff' OR u.created_at < now() - interval '7 days')
      AND NOT EXISTS (SELECT 1 FROM public.bw_chat_reports rp WHERE rp.message_id = m.id)
      AND (
        (m.room_kind = 'general' AND m.room_id = private.bw_chat_general_room())
        OR (m.room_kind = 'crossing' AND EXISTS (
              SELECT 1 FROM public.departures d
               WHERE d.id = m.room_id
                 AND now() < coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '7 days'))
      )
    ORDER BY m.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 12), 1), 30)
  ) x;
$function$;
REVOKE ALL ON FUNCTION public.bw_chat_ticker(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_ticker(integer) TO anon, authenticated;
