-- BledWay · Écoute AIS toutes les 3 minutes (130 s d'écoute, soit environ 72 % du temps).
-- Le nom de la tâche reste bledway-ais-10m : cron.alter_job ne permet pas de le changer.
SELECT cron.alter_job(jobid, schedule => '*/3 * * * *')
FROM cron.job WHERE jobname = 'bledway-ais-10m';
