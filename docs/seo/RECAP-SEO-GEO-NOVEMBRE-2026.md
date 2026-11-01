# Récapitulatif SEO/GEO — 1er novembre 2026

Contrôles faits sur le serveur local : HTML servi, données structurées, console du navigateur. Rien n'est mesuré en production tant que le lot n'est pas publié. Aucun effet sur le classement ou les citations par les IA n'est garanti.

## Page par page

| Page | Avant | Après |
|---|---|---|
| `/` | Lignes phares absentes du HTML, H1 vague, image de 2,6 Mo | Lignes dans le HTML, H1 descriptif, FAQPage, lien vers la FAQ, image WebP de 123 Ko |
| `/horaires` | H1 sans sujet | H1 complet, fil d'Ariane balisé, rappel de confirmer auprès de la compagnie |
| `/questions-frequentes` | N'existait pas | 16 réponses directes, tableau des 31 lignes, FAQPage |
| `/barometre-prix` | Absente du sitemap, H1 vague | Dans le sitemap, H1 et titre sur le prix, fil d'Ariane, FAQ |
| `/mes-dinars` | Absente du sitemap | Dans le sitemap, titre et description sur la conversion euros–dinars |
| `/ports` | Pas de fil d'Ariane | Fil d'Ariane |
| `/ports/<port>` | 11 ports sur 15 absents du sitemap, « port de Alger » | Les 15 dans le sitemap, français corrigé, Place enrichi, FAQ tirée des données |
| `/lignes` | Description de 215 signes | Description réécrite, fil d'Ariane |
| `/lignes/<ligne>` | 10 lignes sur 31 absentes du sitemap (sens Europe → Algérie) | Les 31 dans le sitemap, réponse directe, FAQ, liens vers les prix et la FAQ |
| `/compagnies` | Pas de données structurées propres | CollectionPage avec les compagnies et leur site, fil d'Ariane |
| `/bateaux` | Flotte absente du HTML (96 mots), titre de 85 signes | Flotte dans le HTML (800 mots), titre raccourci, introduction |
| `/bateaux/<navire>` | Pas d'image de partage | Image de partage, description limitée à 160 signes |
| `/guide` | H1 sans sujet | H1 sur le voyage en ferry |
| `/guide/<article>` (14) | FAQ visible non balisée, titres longs | FAQPage, image, titres raccourcis |
| `/covoiturage`, `/simulateurs` | H1 sans sujet | H1 descriptif |
| `/covoiturage/<aire>`, `/simulateurs/<outil>` | Pas d'image de partage | Image de partage, descriptions limitées |
| `/voyage-algerie`, `/vehicules-moins-3-ans`, `/methode-editoriale`, `/a-propos`, `/contact`, `/mentions-legales`, `/confidentialite` | Pas d'image de partage | Image de partage |
| `/auth`, `/compte`, `/admin` | Privées | Inchangées, hors sitemap |

Toutes les pages publiques héritent d'Organization (logo et e-mail ajoutés) et de WebSite.

## Fichiers de découverte

- `sitemap-maritime.xml` : le filtre `is_demo = false` écartait des pages pourtant publiques, dont Alger, Marseille et Oran. Il passe de 25 à 46 URL.
- `sitemap-pages.xml` : ajout de `/questions-frequentes`, `/barometre-prix` et `/mes-dinars`.
- `robots.txt` : inchangé. Il autorise déjà tous les robots, robots d'IA compris, sauf `/api/`.
- `/llms.txt` : portait encore le nom Batogo. C'est désormais une route alimentée par les données : pages, dossiers, lignes, ports, réponses et règles de citation.

## Choix faits

- **Domaine** : `www.bledway.com` affiche « Site en construction » (OVH, noindex). Les URL canoniques restent donc sur `test-magic-three.vercel.app`.
- **Pas de BoatTrip** : les départs à venir n'ont aucune URL source en base et leurs horaires restent à confirmer auprès des compagnies.
- **Prix** : uniquement les repères Direct Ferries déjà publiés, présentés comme estimations. Aucune ligne sans repère ne reçoit de prix.

## À faire de votre côté

1. Décider du domaine définitif et le brancher, avant de déclarer le site aux moteurs. Changer ensuite `siteUrl` dans `seo.config.json` et rediriger l'ancienne adresse.
2. Vérifier que `contact@bledway.com` reçoit bien les messages : cette adresse est publiée dans les données structurées.
3. Compléter l'identité de l'éditeur dans les mentions légales si elle manque encore.
4. Déclarer le site dans Google Search Console et Bing Webmaster Tools, puis y soumettre `/sitemap.xml`.
5. Obtenir des liens entrants : associations de la diaspora, forums de voyageurs, blogs de voyage, annuaires francophones, offices de tourisme.
6. Contrôler les données : 11 ports et 10 lignes actives portent `is_demo = true` en base alors qu'ils sont publics. Certains écarts de durée entre les deux sens méritent aussi une relecture (Almería → Ghazaouet 10 h, retour 13 h).

## Limites

- Pas de mesure Core Web Vitals : elle demande le site en production.
- Après publication, contrôler `/sitemap.xml`, `/llms.txt` et une page de ligne avec le test des résultats enrichis de Google. Google n'affiche plus les résultats enrichis FAQ : ce balisage sert à la compréhension de la page, sans promesse d'affichage.
