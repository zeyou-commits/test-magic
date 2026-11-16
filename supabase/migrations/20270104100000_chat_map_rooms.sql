-- Carte : une pastille par salon (traversée ou port) avec le nombre de messages des dernières
-- 24 h et les 3 derniers, pour l'aperçu au zoom et le fil au toucher. Mêmes règles de
-- visibilité que bw_chat_recent : messages masqués exclus, salon de traversée fermé exclu.
CREATE OR REPLACE FUNCTION public.bw_chat_map_rooms(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH visible AS (
    SELECT m.*
      FROM public.bw_chat_messages m
     WHERE m.hidden_at IS NULL
       AND m.room_kind IN ('crossing', 'port')
       AND m.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 72))
       AND (m.room_kind = 'port' OR EXISTS (
         SELECT 1 FROM public.departures d
          WHERE d.id = m.room_id
            AND now() < coalesce(d.arrival_at, d.departure_at + interval '48 hours') + interval '7 days'))
  ), ranked AS (
    SELECT v.*, row_number() OVER (PARTITION BY v.room_kind, v.room_id ORDER BY v.created_at DESC) AS rn,
           count(*) OVER (PARTITION BY v.room_kind, v.room_id) AS total
      FROM visible v
  ), rooms AS (
    SELECT r.room_kind, r.room_id, max(r.total) AS total, max(r.created_at) AS last_at,
           jsonb_agg(jsonb_build_object(
             'id', r.id,
             'body', left(private.bw_chat_plain(r.body), 140),
             'created_at', r.created_at,
             'author', private.bw_chat_author(r.user_id, r.official)
           ) ORDER BY r.created_at DESC) FILTER (WHERE r.rn <= 3) AS messages
      FROM ranked r
     GROUP BY r.room_kind, r.room_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'kind', x.room_kind,
           'room', x.room_id,
           'count', x.total,
           'last_at', x.last_at,
           'label', CASE WHEN x.room_kind = 'crossing' THEN (
                      SELECT a.name || ' → ' || b.name
                        FROM public.departures d
                        JOIN public.routes rt ON rt.id = d.route_id
                        JOIN public.ports a ON a.id = rt.departure_port_id
                        JOIN public.ports b ON b.id = rt.arrival_port_id
                       WHERE d.id = x.room_id)
                    ELSE (SELECT 'Port de ' || p.name FROM public.ports p WHERE p.id = x.room_id) END,
           'messages', x.messages
         ) ORDER BY x.last_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM rooms ORDER BY last_at DESC LIMIT 60) x;
$function$;

REVOKE ALL ON FUNCTION public.bw_chat_map_rooms(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.bw_chat_map_rooms(integer) TO anon, authenticated;
