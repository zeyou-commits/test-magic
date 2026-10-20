-- Photo d'un port (URL https), renseignable dans le back-office. À défaut, le site cherche une photo libre sur Wikimedia Commons.
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS photo_url text;
