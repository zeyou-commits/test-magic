-- La 504 parle aux voyageurs au tu, dans les notifications comme dans ses bulles (décision du
-- 17/11/2026), et son avatar est réservé à la mascotte.
--
-- 1. Notifications créées par la base (salons, messages privés, invitations) : leurs textes sont
--    écrits dans de grosses fonctions (bw_chat_post, bw_dm_*, bw_room_invite_accept). Plutôt que de
--    les recréer en entier, un filtre unique passe au tu les phrases connues, au moment où la
--    notification est enregistrée. Une phrase inconnue passe telle quelle. Les messages de l'équipe
--    (annulation, retard…) ne sont pas concernés : ils restent au vous.
-- 2. L'avatar « La 504 » n'est plus proposé aux voyageurs ; ceux qui l'avaient prennent « Lina »,
--    l'avatar proposé par défaut à la création d'un profil.

CREATE OR REPLACE FUNCTION private.bw_notification_voice()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.event_key LIKE 'question-reply:%' THEN
    NEW.title := replace(NEW.title, 'On a répondu à votre question', 'On a répondu à ta question');
  ELSIF NEW.event_key LIKE 'dm-request:%' OR NEW.event_key LIKE 'dm-accept:%' OR NEW.event_key LIKE 'dm-message:%' THEN
    NEW.title := replace(replace(replace(NEW.title,
      ' souhaite vous écrire', ' souhaite t''écrire'),
      ' a accepté votre message', ' a accepté ton message'),
      ' vous a écrit', ' t''a écrit');
    NEW.body := replace(NEW.body, 'Ouvrez vos messages privés dans le salon de la traversée.',
      'Ouvre tes messages privés dans le salon de la traversée.');
  ELSIF NEW.event_key LIKE 'chat-mention:%' THEN
    -- « t'a mentionné » imposerait un masculin : la tournure reste neutre.
    NEW.title := replace(NEW.title, ' vous a mentionné', ' parle de toi dans le salon');
  ELSIF NEW.event_key LIKE 'chat-reply:%' THEN
    NEW.title := replace(NEW.title, ' vous a répondu', ' t''a répondu');
  ELSIF NEW.event_key LIKE 'room-guest:%' THEN
    NEW.title := replace(NEW.title, ' a rejoint votre salon', ' a rejoint ton salon');
    NEW.body := replace(NEW.body, 'Votre invitation est acceptée : votre proche peut écrire dans le salon.',
      'Ton invitation est acceptée : ton proche peut écrire dans le salon.');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bw_notification_voice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bw_notification_voice ON public.bw_notifications;
CREATE TRIGGER bw_notification_voice
  BEFORE INSERT ON public.bw_notifications
  FOR EACH ROW EXECUTE FUNCTION private.bw_notification_voice();

-- Avatar réservé à la mascotte.
UPDATE public.bw_avatars SET active = false WHERE id = 'voiture_504';
UPDATE public.bw_traveller_profiles SET avatar = 'lina' WHERE avatar = 'voiture_504';
