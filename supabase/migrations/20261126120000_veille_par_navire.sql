-- BledWay · Veille : recherche d'actualités par nom de navire et de compagnie, une fois par heure.
INSERT INTO public.bw_watch_sources(name, url, kind, tier, keywords, check_minutes, active)
SELECT 'Actualités par navire', 'https://news.google.com/rss/search?q=%22{name}%22+ferry&hl=fr&gl=FR&ceid=FR:fr', 'rss', 'media', '{}', 60, true
WHERE NOT EXISTS (SELECT 1 FROM public.bw_watch_sources WHERE name = 'Actualités par navire');
