-- BledWay · Correctif : le lieu « staff » des messages de l'équipe était refusé par la contrainte du lieu,
-- si bien qu'aucun message de l'équipe ne partait.
ALTER TABLE public.bw_chat_messages DROP CONSTRAINT IF EXISTS bw_chat_messages_place_check;
ALTER TABLE public.bw_chat_messages ADD CONSTRAINT bw_chat_messages_place_check
  CHECK (place = ANY (ARRAY['aboard', 'port', 'trip', 'done', 'asker', 'staff']));
