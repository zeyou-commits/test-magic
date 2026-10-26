-- BledWay · Flash info rattaché à une ou plusieurs traversées datées (ex. « le départ du 23 novembre est reporté »).
-- À exécuter APRÈS 20261026120000_ma_traversee_flash_info.sql. Additif, sans effet sur les données existantes,
-- peut être relancé sans erreur.
ALTER TABLE public.bw_news ADD COLUMN IF NOT EXISTS departure_ids uuid[] NOT NULL DEFAULT '{}';
NOTIFY pgrst, 'reload schema';
