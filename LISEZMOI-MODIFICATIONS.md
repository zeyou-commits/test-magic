# Batogo — Modifications UX/UI (octobre 2026)

Ce document explique **quoi copier sur GitHub** et **comment le faire**, même sans connaissance technique.

---

## ⚠️ Avant de commencer : une vérification importante

Ces modifications ont été faites à partir du zip `test-magic-main (4).zip`.
Si des changements ont été faits **depuis** sur GitHub ou dans Lovable, les écraser les ferait disparaître.

1. Ouvrez votre dépôt sur GitHub.
2. Regardez la date du dernier « commit » (en haut de la liste des fichiers).
3. **Si cette date est postérieure au téléchargement du zip**, ne remplacez rien et demandez d'abord une fusion des deux versions.

---

## Méthode la plus simple (recommandée) : envoyer le dossier « fichiers-modifies »

Le zip `batogo-fichiers-modifies.zip` contient **uniquement** les 39 fichiers modifiés ou nouveaux (plus cette notice), rangés dans les bons dossiers.

1. Décompressez `batogo-fichiers-modifies.zip` sur votre ordinateur.
2. Sur GitHub, ouvrez votre dépôt, puis cliquez sur **Add file → Upload files**.
3. Ouvrez le dossier décompressé et **glissez son contenu** (les dossiers `src`, `public`, `scripts` et les fichiers `.md`) dans la zone d'envoi de GitHub.
   GitHub conserve les dossiers : chaque fichier remplace celui qui porte le même chemin.
4. En bas de la page, écrivez un message, par exemple « Refonte UX : filtres, heures locales, planificateur ».
5. Cliquez sur **Commit changes**.
6. Lovable récupère automatiquement la nouvelle version. Vérifiez l'aperçu, puis republiez le site depuis Lovable.

> Aucun fichier n'est à supprimer.

---

## Liste des fichiers

### Fichiers à CRÉER (3)

| Fichier | Rôle |
|---|---|
| `src/lib/ferry/time.ts` | Fuseaux horaires des ports : chaque heure s'affiche dans l'heure locale du port, comme sur le billet. |
| `src/components/map/MapLegend.tsx` | Légende de la carte (bouton « Légende » en bas à gauche, sur ordinateur). |
| `scripts/sql/2026-10-correctif-fuseaux-horaires.sql` | Script **facultatif** pour recaler les horaires déjà en base (voir plus bas). |

### Fichiers à REMPLACER (36)

**Racine et dossier `public`**
- `README.md`, `roadmap.md`, `public/llms.txt` : nom et accroche unifiés (« Batogo — Ferries Europe ↔ Algérie »).

**Styles**
- `src/styles.css` : palette par rôle (le corail est réservé aux actions principales), poignée du tiroir mobile, ports estompés ou fermés sur la carte, infobulles.

**Logique (dossier `src/lib/ferry`)**
- `types.ts`, `filtering.ts`, `urlState.ts` : **un seul système de filtres** pour la carte, la liste, le mobile et l'adresse de la page.
- `format.ts` : formats de date et d'heure en heure locale, services « non renseignés » masqués.

**Mise en page (dossier `src/components/layout`)**
- `SiteLayout.tsx` : même en-tête partout, marges latérales sur toutes les pages, pied de page.
- `MobileTabBar.tsx` : barre mobile Carte / Planifier / Horaires / Lignes / Plus.
- `UserMenu.tsx`, `BrandMark.tsx` : bouton de connexion, logo unique.

**Carte (dossier `src/components/map`)**
- `FerryMap.tsx` : cliquer ne modifie plus les filtres, vue à plat, noms en français, recentrage au-dessus du tiroir mobile, symbole ⇄ pour les lignes dans les deux sens.
- `MobileMapControls.tsx` : vrai logo, bouton d'inversion du sens, trajets fréquents dans les deux sens.
- `MapStatusBar.tsx` : filtres actifs affichés au-dessus de la carte, chacun supprimable.

**Volet (dossier `src/components/panel`)**
- `SidePanel.tsx`, `ExplorerView.tsx`, `PortFilters.tsx` : recherche Départ ⇄ Arrivée, liste des départs enfin filtrée.
- `TripPlanner.tsx`, `TripProfile.tsx`, `GroupedPortSelect.tsx` : planificateur réorganisé.
- `PortView.tsx`, `RouteView.tsx`, `EntityViews.tsx`, `shared.tsx`, `ReportButton.tsx` : fiches avec heures locales, bouton « Réserver sur le site de la compagnie », sens inverse.

**Pages (dossier `src/routes`)**
- `index.tsx` : page carte.
- `horaires.tsx` : filtre « Vers / Depuis l'Algérie », heures locales, fiabilité, bouton « Afficher plus ».
- `lignes.$slug.tsx`, `ports.$slug.tsx` : fiches avec réservation, sens inverse et lien vers la carte.
- `auth.tsx` : mot de passe oublié.
- `admin.tsx` : heures saisies en heure locale, confirmations, statuts en français, contrôle qualité des durées.
- `compte.tsx`, `__root.tsx`, `mentions-legales.tsx`, `confidentialite.tsx` : libellés, titre du site, mise en page.

---

## Ce qui change pour les visiteurs

1. **Les horaires sont fiables** : chaque heure est affichée dans l'heure locale du port (« heure de Paris », « heure d'Alger »), quel que soit le pays d'où l'on consulte.
2. **Les filtres fonctionnent partout** : choisir un départ ou une arrivée met à jour la carte **et** la liste des départs, sur ordinateur comme sur mobile. Un lien partagé rouvre exactement la même vue.
3. **Les deux sens sont traités à égalité** :
   - bouton ⇄ pour inverser le sens ;
   - « Voir le sens inverse » sur chaque ligne ;
   - Horaires filtrables « Vers l'Algérie » ou « Depuis l'Algérie » ;
   - vacances scolaires disponibles dans les deux sens.
4. **Le planificateur** :
   - il suit l'ordre trajet → dates → options ;
   - le retour est proposé automatiquement (et peut partir d'un autre port) ;
   - les jours où il y a un départ sont cliquables ;
   - toutes les traversées du jour s'affichent, avec un badge « Recommandé ».
5. **Le visiteur sait où réserver** : un bouton « Réserver sur le site de [compagnie] » apparaît sur les départs, les lignes et le planificateur (si l'adresse du site de la compagnie est renseignée dans l'admin).
6. **Le mobile est plus lisible** :
   - la côte algérienne est visible au-dessus du tiroir ;
   - la poignée du tiroir est visible ;
   - les départs passent avant les filtres ;
   - l'onglet « Planifier » ne recharge plus la page.
7. **La cohérence visuelle est meilleure** : un seul logo et un seul en-tête, des icônes à la place des émojis, une légende de carte et des textes plus grands.

---

## Ce qui change dans le back-office

- **Import Excel** : saisissez les heures **telles qu'imprimées sur les billets**. L'heure de départ est l'heure locale du port de départ, l'heure d'arrivée l'heure locale du port d'arrivée. Le changement d'heure été/hiver est géré.
- **Confirmations** avant toute action définitive : suppression d'une ligne ou d'un calendrier, annulation d'un départ, génération des départs, fermeture d'un port, abandon d'un import.
- « Archiver la saison » devient **« Vider la saison »**, parce que les départs sont bien supprimés et non archivés.
- Nouvel encart **« Contrôle qualité des durées »** dans l'onglet *Données*. Il signale par exemple « Alger ⇄ Marseille : 20 h dans un sens, 6 h dans l'autre ».
- Les statuts et motifs s'affichent en français ; les avis publiés restent visibles dans la liste.

---

## Actions à faire de votre côté (dans l'ordre)

1. **Mettre les fichiers sur GitHub**, comme expliqué plus haut.
2. **Vérifier l'aperçu Lovable** : carte, recherche Départ/Arrivée, planificateur, page Horaires.
3. **Corriger les durées incohérentes** signalées dans *Admin → Données → Contrôle qualité*.
4. **Renseigner le site web de chaque compagnie** (*Admin*), sinon le bouton « Réserver » ne s'affiche pas.
5. **(Facultatif, après relecture)** Recaler les horaires déjà en base avec `scripts/sql/2026-10-correctif-fuseaux-horaires.sql`.
   - Sans ce script, les anciens horaires restent affichés comme aujourd'hui, c'est-à-dire décalés d'une à deux heures par rapport au fichier Excel d'origine.
   - Réimporter les fichiers Excel avec le nouveau code donne le même résultat.
   - Faites une sauvegarde avant, et exécutez-le une seule fois.
6. **Mot de passe oublié** : dans les réglages d'authentification de Lovable Cloud / Supabase, vérifiez que l'adresse `https://VOTRE-DOMAINE/auth` est autorisée comme adresse de redirection.
7. **Badge « Edit with Lovable »** : il ne vient pas du code. Il se masque dans les réglages du projet Lovable (selon l'abonnement).

---

## Non traité dans cette version (à prévoir)

- Interface en arabe (lecture de droite à gauche) et en anglais.
- Prix, disponibilité et réservation intégrée.
- Alertes : changement d'horaire, ouverture des ventes.
- Tracés maritimes réels (les lignes restent droites ; la légende le précise).
- Suppression ou export du compte (RGPD) et contrôle des droits admin côté serveur.
- Remplacement de la bibliothèque `xlsx` 0.18.5 (vulnérabilités publiées, à vérifier).
- Contenu du guide pratique, à rédiger et à valider avec des sources officielles.
