-- BledWay · Veille : sites des compagnies qui l'autorisent. Direct Ferries interdit les robots sans accord écrit.
ALTER TABLE public.bw_watch_sources DROP CONSTRAINT IF EXISTS bw_watch_sources_kind_check;
ALTER TABLE public.bw_watch_sources ADD CONSTRAINT bw_watch_sources_kind_check CHECK (kind IN ('sitemap', 'rss', 'page'));

INSERT INTO public.bw_watch_sources(name, url, kind, tier, keywords, check_minutes, active)
SELECT s.name, s.url, s.kind, 'official', s.keywords, 60, true
FROM (VALUES
  ('Algérie Ferries · Actualités', 'https://www.algerieferries.dz/actualites', 'page', '{}'::text[]),
  ('Algérie Ferries · Dernière minute', 'https://www.algerieferries.dz/derniere-minute', 'page', '{}'::text[]),
  ('Corsica Linea', 'https://www.corsicalinea.com/feed/', 'rss',
   ARRAY['retard', 'report', 'annul', 'perturb', 'modif', 'horaire', 'grève', 'navire', 'traversée', 'programme'])
) AS s(name, url, kind, keywords)
WHERE NOT EXISTS (SELECT 1 FROM public.bw_watch_sources x WHERE x.name = s.name);
