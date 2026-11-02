-- BledWay · Salons en direct : chaque changement réveille les salons concernés, aussitôt.
-- Le signal ne transporte aucun texte ni compte : les écrans relisent le fil par sa fonction habituelle.

CREATE OR REPLACE FUNCTION private.bw_chat_notify_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE msg public.bw_chat_messages; port_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN msg := OLD; ELSE msg := NEW; END IF;
  -- Un signal perdu ne doit jamais empêcher d'écrire : les écrans relisent aussi régulièrement.
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'changed', 'chat:' || msg.room_kind || ':' || msg.room_id, false);
    IF msg.room_kind = 'crossing' THEN
      -- Le fil de chaque port de la traversée regroupe aussi ses messages.
      FOR port_id IN
        SELECT unnest(ARRAY[r.departure_port_id, r.arrival_port_id])
          FROM public.departures d JOIN public.routes r ON r.id = d.route_id
         WHERE d.id = msg.room_id
      LOOP
        PERFORM realtime.send('{}'::jsonb, 'changed', 'chat:port:' || port_id, false);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.bw_chat_notify_room() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bw_chat_messages_notify ON public.bw_chat_messages;
CREATE TRIGGER bw_chat_messages_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.bw_chat_messages
  FOR EACH ROW EXECUTE FUNCTION private.bw_chat_notify_room();
