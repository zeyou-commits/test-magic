# BledWay — Ma traversée, Flash info, lieux pratiques, signalements façon Waze

Livraison **non cumulative** : uniquement les fichiers modifiés ou créés par rapport à ton dépôt GitHub au 26/10/2026 (commit `d89a6d7`, « Unify vessel photo backgrounds… »).

## Ce qui est nouveau

1. **Flash info** (actualités et perturbations Europe ↔ Algérie, sélection manuelle et sourcée)
   - Ordinateur : panneau à **droite de la carte**, repliable (choix mémorisé). Le volet de gauche reste dédié à la recherche et aux départs.
   - Mobile : icône ⚡ dans l'en-tête avec une pastille (rouge s'il y a une perturbation) ; le fil s'ouvre en plein écran. Un clic sur une info ouvre la fiche concernée.
   - Le fil mêle les actualités saisies par l'équipe et les signalements voyageurs en cours.
   - Chaque info indique son origine (Perturbation, Compagnie / port, Média, Voyageurs), avec un lien vers la source et une action : voir les départs, voir le port, confirmer sur place.
2. **Fiche port en trois onglets**, sans rien retirer :
   - **En direct** : actualités du port et de ses lignes, signalements voyageurs, départs et arrivées.
   - **Préparer** : services, **lieux pratiques** (station-service, stationnement, change, distributeur, carte SIM…) avec bouton « Y aller » (itinéraire Google Maps), à savoir, lignes.
   - **Voyageurs** : avis, avec un bouton **« Utile »**.
3. **Ma traversée** (fiche d'un départ) : historique des **changements** du départ (horaire, navire, annulation, déjà enregistrés automatiquement par ta base), infos qui concernent ce trajet, accès direct aux lieux pratiques du port de départ. Sur l'accueil, un raccourci « Ma traversée · J-3 » apparaît pour les traversées suivies (compte connecté).
4. **Signalements façon Waze**
   - Nouvelles situations : « Parking complet », « Passage fluide », « Débarquement commencé ».
   - **« Ce n'est plus le cas »** : la situation disparaît dès qu'au moins 2 voyageurs l'indiquent et qu'ils sont plus nombreux que ceux qui la confirment.
   - Sur la carte, la pastille du port affiche des **avatars** de voyageurs (personnages dessinés, aucune photo) et leur nombre.
5. **Back-office** : deux nouveaux onglets, accessibles aux rôles administrateur et éditeur.
   - **Flash info** : créer, modifier, programmer, dépublier. Titre et résumé en tes mots, lien de la source, lignes / ports / compagnies concernés, dates de début et de fin.
   - **Lieux pratiques** : lieux de chaque port, avec horaires, conseil d'accès et date de vérification.

Aucune photo stockée. Aucune promotion.

## Étape 1 — Supabase (une seule fois)

Dans Supabase → **SQL Editor**, colle et exécute **tout** le contenu du fichier :

`supabase/migrations/20261026120000_ma_traversee_flash_info.sql`

- Le script ne modifie ni ne supprime aucune donnée existante, et peut être relancé sans erreur.
- Il crée : `bw_news` (Flash info), `bw_port_places` (lieux pratiques), `bw_alert_denials` (« plus le cas »), `bw_review_helpful` (« Utile »), et les fonctions `bw_departure_events`, `bw_review_helpful_counts`, `bw_toggle_review_helpful`.
- Il met à jour `bw_community_feed` et `bw_alert_action` (mêmes résultats qu'avant, plus le compteur « plus le cas »), et élargit la liste des situations signalables.
- Il suppose que tes migrations précédentes sont appliquées (notamment `20261024120000_user_management.sql` et `20261023120000_notification_campaigns_preferences.sql`).
- **Sans le script**, le site fonctionne exactement comme aujourd'hui : le Flash info, les lieux pratiques, « Utile » et « Ce n'est plus le cas » restent simplement invisibles.

Vérification après exécution : Admin → **Flash info** affiche le formulaire (et non un message « Module non activé »).

## Étape 2 — GitHub

Glisse le **contenu** du dossier `A-GLISSER-SUR-GITHUB` (pas le dossier lui-même) : GitHub → Add file → Upload files.

**À remplacer (13)**
- `src/components/admin/AdminWorkspace.tsx`
- `src/components/layout/SiteLayout.tsx`
- `src/components/map/useTravelMarkers.ts`
- `src/components/panel/HomeTraffic.tsx`
- `src/components/panel/PortView.tsx`
- `src/components/panel/ShipViews.tsx`
- `src/components/panel/TravelCommunity.tsx`
- `src/lib/admin/navigation.ts`
- `src/lib/admin/permissions.ts`
- `src/lib/ferry/community.ts`
- `src/routes/admin.tsx`
- `src/routes/index.tsx`
- `src/styles.css`

**À créer (9)**
- `src/components/admin/ContentAdmin.tsx`
- `src/components/panel/FlashCenter.tsx`
- `src/components/panel/FlashFeed.tsx`
- `src/components/panel/MyTrip.tsx`
- `src/components/panel/PortPlaces.tsx`
- `src/components/panel/SignalAvatars.tsx`
- `src/flash.css`
- `src/lib/ferry/flash.ts`
- `supabase/migrations/20261026120000_ma_traversee_flash_info.sql`

**À supprimer : aucun.**

Attention : si tu modifies ces mêmes fichiers dans Lovable avant de déposer, tes changements seraient écrasés. Dépose d'abord, puis reprends dans Lovable.

## Étape 3 — Premiers contenus

- Admin → **Flash info** : une ou deux actualités pour tester, par exemple une perturbation rattachée à une ligne.
- Admin → **Lieux pratiques** : par exemple la station-service et le bureau de change de tes ports pilotes.

## Contrôles effectués

- Types (TypeScript) : 0 erreur. Lint : 0 erreur. Build de production : réussi.
- Tests automatiques : 188 réussis, 2 en échec (suivi AIS). Ces 2 échecs existent déjà dans ton code actuel, sans mes modifications.
- Navigateur, avec des données de démonstration temporaires (retirées de la livraison) :
  - Flash info à droite sur ordinateur, icône et fil plein écran sur mobile ;
  - pastille avec avatars sur la carte ;
  - fiche port en trois onglets avec lieux pratiques ;
  - Ma traversée avec historique des changements ;
  - clic depuis le fil mobile vers la fiche.
- Navigateur sans le script SQL : le site s'affiche comme aujourd'hui.
- **Non testé** : l'écriture réelle en base (publier une actualité, voter « Utile », « Ce n'est plus le cas »). Le script n'est pas encore appliqué chez toi et je n'ai pas accès à ta base. À tester après l'étape 1.
