-- BledWay · Aperçu des salons sur la carte : les derniers messages publics des salons de traversées
-- et du direct des ports, sur 2 h. Même contenu que ce que chacun lit déjà dans les salons :
-- pseudo, avatar, début du message, jamais de position.

CREATE OR REPLACE FUNCTION public.bw_chat_recent(p_limit integer DEFAULT 8)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT m.created_at, jsonb_build_object(
      'id', m.id,
      'kind', m.room_kind,
      'room', m.room_id,
      'body', left(private.bw_chat_plain(m.body), 140),
      'created_at', m.created_at,
      'author', private.bw_chat_author(m.user_id, m.official),
      'label', CASE WHEN m.room_kind = 'crossing' THEN (
                 SELECT a.name || ' → ' || b.name
                   FROM public.departures d
                   JOIN public.routes r ON r.id = d.route_id
                   JOIN public.ports a ON a.id = r.departure_port_id
                   JOIN public.ports b ON b.id = r.arrival_port_id
                  WHERE d.id = m.room_id)
               ELSE (SELECT 'Port de ' || p.name FROM public.ports p WHERE p.id = m.room_id) END
    ) AS item
    FROM public.bw_chat_messages m
    WHERE m.hidden_at IS NULL
      AND m.room_kind IN ('crossing', 'port')
      AND m.created_at > now() - interval '2 hours'
      -- Un salon de traversée fermé à la lecture n'apparaît plus.
      AND (m.room_kind = 'port' OR EXISTS (
        SELECT 1 FROM public.departures d
         WHERE d.id = m.room_id
           AND now() < coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '7 days'))
    ORDER BY m.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 8), 1), 20)
  ) x;
$function$;
REVOKE ALL ON FUNCTION public.bw_chat_recent(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bw_chat_recent(integer) TO anon, authenticated;
