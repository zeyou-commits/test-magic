-- BledWay · Chaque message d'exemple est rattaché à un port ou à une ligne : sa bulle sort de ce
-- port, ou du navire qui fait la ligne, sur la carte.

ALTER TABLE public.bw_chat_demo_messages
  ADD COLUMN IF NOT EXISTS port_id uuid REFERENCES public.ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL;

-- Les exemples de départ retrouvent leur lieu d'après leur libellé.
UPDATE public.bw_chat_demo_messages m
   SET route_id = r.id
  FROM public.routes r
  JOIN public.ports a ON a.id = r.departure_port_id
  JOIN public.ports b ON b.id = r.arrival_port_id
 WHERE m.route_id IS NULL AND m.port_id IS NULL AND m.label = a.name || ' → ' || b.name;

UPDATE public.bw_chat_demo_messages m
   SET port_id = p.id
  FROM public.ports p
 WHERE m.route_id IS NULL AND m.port_id IS NULL AND m.label = 'Port de ' || p.name;
