# Batogo — Refonte UX/UI + suivi en direct (octobre 2026) · version 5

Ce document explique **quoi mettre sur GitHub**, **quoi supprimer** et **comment faire**, même sans connaissance technique.

> Cette version **remplace** les précédentes : elle contient tout, plus le **suivi en direct des navires**.

---

## ⚠️ Avant de commencer

Ces modifications partent du zip `test-magic-main (4).zip`. Si des changements ont été faits sur GitHub ou dans Lovable **depuis**, les écraser les ferait disparaître. Regardez la date du dernier commit sur GitHub : si elle est postérieure au téléchargement du zip, ne remplacez rien et demandez d'abord une fusion.

---

## Marche à suivre sur GitHub

### Étape 1 : envoyer les fichiers
1. Décompressez `batogo-fichiers-modifies.zip`.
2. Sur GitHub : **Add file → Upload files**, puis glissez le **contenu** du dossier décompressé (`src`, `public`, `scripts` et les fichiers `.md`).
3. Message du commit, par exemple « Refonte UX : recherche unique ». Cliquez sur **Commit changes**.

### Étape 2 : supprimer 3 fichiers devenus inutiles ⚠️
Ils sont remplacés par la recherche unique. S'ils restent, le site peut ne pas se construire.
Pour chacun : ouvrez le fichier sur GitHub, cliquez sur les **trois points ⋯** en haut à droite, puis **Delete file**, puis **Commit changes**.

- `src/components/panel/ExplorerView.tsx`
- `src/components/panel/TripPlanner.tsx`
- `src/components/panel/GroupedPortSelect.tsx`

### Étape 3 : vérifier dans Lovable
L'aperçu se met à jour tout seul. Vérifiez la carte, la recherche et un clic sur « Réserver », puis republiez.

---

## NOUVEAU (v5) — Fiche navire, photos, infobulles, cadrage

- **Clic sur un bateau** : la fiche du navire s'ouvre avec sa **photo**, sa compagnie, **où il est** (en mer avec la barre d'avancement et l'arrivée prévue, ou au port avec son prochain départ) et ses prochains départs. La ligne du navire s'éclaire sur la carte.
- **Nom des bateaux en tout petit sur la carte**, dès la vue d'ensemble (plus lisible en zoomant). Les noms qui se chevauchent se masquent tout seuls.
- **D'où vient la photo ?** Dans cet ordre :
  1. la **photo que vous renseignez** dans *Admin → Navires* (adresse https d'une image dont vous avez le droit d'usage) ;
  2. sinon une **photo libre de Wikimedia Commons**, avec le nom de l'auteur, la licence et un lien (obligation des licences) ; le site vérifie que le nom du fichier contient bien le nom du navire et un mot de navire, pour éviter les mauvaises photos. Sur vos 16 navires, une photo juste a été trouvée pour environ la moitié (Danielle Casanova, Jean Nicoli, Tariq Ibn Ziyad, A Nepita, Badji Mokhtar III…) ; les autres affichent une illustration « Photo non disponible » ;
  3. sinon une illustration.
  Les photos trouvées sont mémorisées 30 jours dans le navigateur du visiteur, pour ne pas solliciter Wikimedia à chaque visite.
- **Pourquoi pas VesselFinder directement ?** Leurs photos appartiennent à leurs contributeurs, leurs conditions interdisent de les copier ou de les réafficher, et leur accès automatique est payant. À la place : renseignez le **numéro IMO** (7 chiffres) de chaque navire dans *Admin → Navires* ; la fiche affiche alors un bouton **« Voir sur VesselFinder »** (le visiteur y voit leurs photos chez eux). Exemple : IMO 9161948 → `vesselfinder.com/vessels/details/9161948`.
- **Infobulle des ports** : elle ne s'ouvre plus au survol, seulement **au clic** ; la croix la ferme (le détail du port reste dans le volet).
- **Zone cachée par le volet de gauche** : le cadrage laisse maintenant plus de place à gauche (les noms de ports ne passent plus dessous), et s'adapte aux fenêtres étroites.
- Sur mobile, le tiroir se rouvre tout seul quand on choisit un navire ou un port.

**À faire :** la migration `supabase/migrations/20261013120000_vessel_tracking.sql` contient maintenant aussi la colonne IMO : appliquez-la (même opération que pour le suivi). Puis, dans *Admin → Navires*, saisissez l'IMO et, si vous en avez, la photo de chaque navire.

**Fichiers ajoutés :** `src/lib/ferry/vesselPhoto.ts`. Modifiés : `FerryMap.tsx`, `EntityViews.tsx`, `admin.tsx`, `index.tsx`, `styles.css`, `types.ts` (×2), la migration SQL.

---

## NOUVEAU — Suivi en direct des navires

**Ce que voient les visiteurs**
- Sur la carte : les **vrais navires** (icône orientée selon leur cap, avec leur nom) à la place des pastilles animées, sur les lignes concernées.
- Sur chaque carte de traversée : « **En mer · 17 nœuds · Arrivée vers 19:39** » (avec le retard estimé s'il y en a un).
- Dans la fiche d'un départ : **« Où est mon bateau ? »** avec l'heure d'arrivée estimée, le retard, la vitesse, le cap, la distance restante et l'âge de la dernière position.
- Entre deux mises à jour, le navire avance doucement selon sa vitesse et son cap (maximum 40 minutes d'estimation).

**Comment ça limite les appels (20 minutes)**
- La clé API reste **côté serveur** : le navigateur ne la voit jamais.
- Une position n'est redemandée qu'après **20 minutes**, même avec des milliers de visiteurs : le résultat est mis en cache dans la base et partagé.
- Seuls les navires utiles sont interrogés : de **6 h avant le départ jusqu'à 1 h après l'arrivée prévue**. Un navire à quai depuis des jours n'est pas suivi.
- Plafond de sécurité : 20 appels maximum par requête. En cas de panne de l'API, le site continue de fonctionner normalement, sans le suivi.

**À faire pour l'activer (dans l'ordre)**
1. **Régénérer la clé RapidAPI** (celle de votre capture d'écran a été partagée en clair) : RapidAPI → Apps → Security → Regenerate.
2. **Créer la table dans la base** : demandez à Lovable d'appliquer le fichier `supabase/migrations/20261013120000_vessel_tracking.sql` (ou exécutez son contenu dans l'éditeur SQL).
3. **Ajouter 4 secrets dans Lovable Cloud** (réglages du projet, rubrique des secrets / variables d'environnement) :
   | Nom | Valeur |
   |---|---|
   | `RAPIDAPI_KEY` | la **nouvelle** clé |
   | `RAPIDAPI_HOST` | `marinetraffic1.p.rapidapi.com` |
   | `RAPIDAPI_VESSEL_PATH` | le chemin de l'endpoint « position d'un navire » (onglet *Endpoints* de l'API, par exemple `/vessel`) |
   | `RAPIDAPI_MMSI_PARAM` | le nom du paramètre MMSI dans cet endpoint (souvent `mmsi`) |
4. **Saisir le MMSI de chaque navire** : *Admin → onglet « Navires »*. Un navire sans MMSI n'est pas suivi.
5. Vérifier que vos **départs sont bien rattachés à un navire** (colonne Navire de l'import Excel), sinon le lien départ ↔ navire ne peut pas se faire.

> ⚠️ **Non testé avec l'API réelle** : je n'ai ni clé ni documentation de l'endpoint. J'ai testé la lecture de la réponse avec votre exemple (et des variantes de noms de champs) et tout l'affichage avec des positions fictives. Si le suivi ne s'allume pas, regardez dans *Admin → Navires* : un message d'erreur s'affiche sous chaque navire (par exemple « HTTP 404 » = mauvais chemin d'endpoint).
> L'heure d'arrivée est une **estimation en ligne droite** ; l'écran le précise.

**Fichiers ajoutés pour la flotte et le suivi :** `src/lib/ferry/fleet.ts`, `src/lib/ferry/useFleet.ts`, `src/components/map/shipIcons.ts`, `src/lib/tracking/parse.ts`, `src/lib/tracking/positions.server.ts`, `src/routes/api.vessel-positions.ts`, `src/lib/ferry/tracking.ts`, `src/lib/ferry/useLiveShips.ts`, `supabase/migrations/20261013120000_vessel_tracking.sql`. Fichiers modifiés : `src/routeTree.gen.ts` (généré automatiquement, à remplacer), `FerryMap.tsx`, `SailingCard.tsx`, `SearchPanel.tsx`, `EntityViews.tsx`, `index.tsx`, `admin.tsx`, `src/lib/ferry/types.ts`, `src/integrations/supabase/types.ts`.

---

## Ce qui change (le principal)

**Une seule recherche, qui pilote tout.** Plus d'onglets « Explorer » / « Planifier ». Un seul bloc :
**Départ ⇄ Arrivée · Aller / Retour · Voyageurs · Vacances**.
La carte, la liste et l'adresse de la page lisent la même recherche : un lien partagé rouvre exactement le même trajet, avec ses dates.

**Ce qui se passe quand on remplit la recherche :**

| Vous renseignez | La page montre |
|---|---|
| Rien | « Où voulez-vous traverser ? », les trajets les plus fréquents en un clic, les prochains départs |
| Un départ | Ses traversées ; la carte se cadre dessus |
| Départ + arrivée | La carte zoome sur le trajet, la ligne s'éclaire, une frise des jours avec départ apparaît |
| + une date | Les traversées du jour, avec un badge « Recommandé » |
| Aller-retour | Une deuxième section « Retour » apparaît automatiquement, dans le sens inverse |

**Une carte vivante, avec de vrais bateaux :**
- trajets **courbes** (plus de lignes droites) ;
- de **vrais ferrys vus du dessus** (coque, passerelle, cheminée, sillage), orientés selon leur cap, avec leur nom au zoom ;
- **un navire par traversée en base de données**, placé d'après les horaires, **sans suivi nécessaire** :
  - traversée **en cours** → le navire est **en pleine mer**, sur sa ligne, à l'avancement exact de l'horaire (il avance aussi lentement que dans la réalité, par exemple 1/20e de la route par heure pour 20 h) ;
  - départ **dans les 36 prochaines heures** → le navire est **au port de départ**, rangé le long de la côte (plusieurs navires au même port sont alignés) ;
  - arrivé depuis **moins de 12 h** → il reste **au port d'arrivée** ;
  - quand le suivi en direct est activé, la **position réelle remplace automatiquement** la position déduite : le navire bouge alors selon sa vitesse et son cap réels ;
- le trajet cherché est **éclairé** et les autres navires s'estompent ; cliquer sur un navire ouvre sa traversée ;
- cadrage automatique, légende, panneau en verre dépoli.

**Des cartes de traversée plus lisibles :** heure de départ, frise avec durée, heure d'arrivée (« +1 » = lendemain), compagnie et navire, fiabilité, bouton **Réserver** qui ouvre le site de la compagnie, badges « Recommandé » et « Nuit », apparition animée.

**Aussi :** la barre mobile devient Carte · Horaires · Lignes · Ports · Plus ; les vacances scolaires remplissent d'un clic les dates d'aller et de retour.

> Tout ce qui figurait dans la version précédente est conservé : heures locales des ports, sens inverse, back-office corrigé, mot de passe oublié, etc.

---

## Liste des fichiers

### Fichiers à CRÉER (13)
| Fichier | Rôle |
|---|---|
| `src/components/panel/SearchPanel.tsx` | La recherche unique et ses résultats. |
| `src/components/panel/SailingCard.tsx` | Carte de traversée et frise des jours. |
| `src/lib/ferry/trips.ts` | Calcul des traversées, jours disponibles, recommandation, trajets fréquents. |
| `src/lib/ferry/geo.ts` | Trajets courbes et position des navires. |
| `src/lib/ferry/time.ts` | Fuseaux horaires des ports (heure locale partout). |
| `src/components/map/MapLegend.tsx` | Légende de la carte. |
| `scripts/sql/2026-10-correctif-fuseaux-horaires.sql` | Script **facultatif** pour recaler les anciens horaires (voir plus bas). |

### Fichiers à SUPPRIMER (3)
`ExplorerView.tsx`, `TripPlanner.tsx`, `GroupedPortSelect.tsx` (dans `src/components/panel/`) : voir l'étape 2.

### Fichiers à REMPLACER
Tous les autres fichiers du zip `batogo-fichiers-modifies.zip` (environ 38), notamment :
`src/routes/index.tsx`, `src/components/panel/SidePanel.tsx`, `src/components/map/FerryMap.tsx`, `src/components/map/MobileMapControls.tsx`, `src/components/layout/MobileTabBar.tsx`, `src/styles.css`, `src/lib/ferry/types.ts`, `filtering.ts`, `urlState.ts`, `format.ts`, ainsi que les pages (`horaires`, `lignes.$slug`, `ports.$slug`, `auth`, `admin`…), les fiches (`PortView`, `RouteView`, `EntityViews`…) et les documents (`README.md`, `roadmap.md`, `public/llms.txt`).

---

## Actions à faire de votre côté

1. Mettre les fichiers sur GitHub et **supprimer les 3 fichiers** (étapes 1 et 2).
2. **Corriger les durées incohérentes** de vos données (ex. Alger → Marseille à 6 h) : *Admin → Données → Contrôle qualité*.
3. **Renseigner le site web de chaque compagnie** dans l'admin, sinon le bouton « Réserver » n'apparaît pas.
4. **(Facultatif, après relecture par une personne compétente)** le script SQL qui recale les horaires déjà en base. Faites une **sauvegarde** avant, exécutez-le **une seule fois**. Sans lui, les anciens horaires restent décalés d'une à deux heures ; réimporter vos fichiers Excel avec le nouveau code corrige aussi le problème.
5. **Mot de passe oublié** : autorisez l'adresse `…/auth` comme adresse de retour dans les réglages d'authentification de Lovable Cloud.
6. Le badge « Edit with Lovable » se masque dans les réglages du projet Lovable, pas dans le code.

## Pas encore fait
Interface arabe et anglaise · prix et réservation intégrée · alertes · mode sombre · tracés maritimes réels · suppression et export de compte (RGPD) · remplacement de la bibliothèque `xlsx` · contenu approfondi du guide.
