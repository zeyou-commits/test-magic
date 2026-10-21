# BledWay — mobile, fiches navires et communauté

## 1. Déposer les fichiers dans GitHub

Le ZIP contient les **fichiers complets**, avec leur arborescence, à fusionner à la racine du dépôt `test-magic`. Il est basé sur `main` vérifié au commit `81b0d12`.

Conservez notamment `src/`, `supabase/`, `scripts/` et `docs/`. Ne déposez pas le contenu de `src/` directement à la racine. Les fichiers absents du ZIP sont à conserver. Aucun changement de dépendance ni nouvelle variable d’environnement n’est nécessaire.

Le prochain déploiement Vercel prend en charge les changements graphiques et les gestes de la carte.

## 2. Activer les avis et les signalements partagés

**Un dépôt Git ne modifie pas automatiquement la base Supabase.** Pour activer les contributions :

1. Ouvrez le projet Supabase déjà utilisé par BledWay.
2. Dans son éditeur SQL, exécutez une seule fois le fichier complet `supabase/migrations/20261021120000_vessel_community.sql`. Si vous gérez déjà les migrations avec la CLI Supabase, appliquez cette migration par votre procédure habituelle.
3. Rechargez ensuite la page du site. Le module est détecté automatiquement. Si le cache de schéma met quelques secondes à se rafraîchir, rechargez à nouveau.
4. Avec votre compte administrateur existant, ouvrez **Back-office → Communauté navires** pour publier ou masquer les avis et retirer un signalement.

La migration ajoute trois tables et cinq fonctions dédiées. Elle utilise l’authentification, les navires, les ports et le rôle administrateur existants. Les avis des ports et les signalements privés existants continuent à fonctionner séparément.

Sans cette migration, la carte et les nouvelles fiches fonctionnent ; les boutons de contribution et l’onglet des avis navires restent masqués. Aucune migration ni contribution de test n’a été envoyée à votre base réelle pendant la préparation du ZIP.

## Ce qui change

- Carte mobile déplaçable à un doigt ; pincement pour zoomer conservé, rotation tactile désactivée. Le défilement de la page reste possible hors de la carte.
- Au clic sur un bateau, ouverture haute du panneau, y compris si l’on revient sur le même bateau.
- Avancement, trajet et horaires regroupés au début de la fiche. Les données absentes ne créent plus de lignes d’explication technique.
- Fiche navire organisée en **Ma traversée / À bord / Avis**, petite photo, caractéristiques lisibles et accès direct à la carte.
- Fiche traversée consacrée au voyage : suivi, bateau, ports et repères de convocation. Ces repères restent indicatifs ; le billet fait référence.
- Les dossiers éditoriaux de bateaux dont le slug correspond à un navire publié partagent les mêmes avis et signalements que la carte.
- Boutons d’action verts, fonds chaleureux, icônes discrètes et commandes accessibles au clavier.

### Avis navires

Une note globale de 1 à 5 étoiles et un commentaire facultatif de 2 000 caractères. Un avis par compte et par bateau, modifiable. Chaque envoi ou modification repasse en modération. La moyenne et le total utilisent tous les avis publiés ; jusqu’à 200 contributions sont chargées dans la fiche, avec priorité à votre propre avis pour pouvoir le modifier. Les contributions sont affichées sous « Voyageur BledWay », sans exposer l’identifiant du compte.

### Signalements façon Waze — première version

Sur un bateau : **retard annoncé au départ** (environ 30 min, 1 h ou 2 h et plus) ou **embarquement commencé**. Sur un port : **attente aux contrôles** ou **accès difficile**.

Les signalements sont partagés, accompagnés d’une petite icône sur la carte et présentés comme des informations voyageurs. Un autre voyageur connecté peut confirmer une fois. L’auteur ou un administrateur peut clôturer le signalement. Il expire automatiquement après **2 heures**, même s’il a été confirmé. Les fiches et les icônes se rafraîchissent toutes les minutes ; une action rafraîchit immédiatement les données. Le flux cartographique charge au maximum les 300 signalements actifs les plus récents.

La publication nécessite un compte connecté. Les doublons d’un même auteur sont bloqués et la création est limitée à cinq signalements par quart d’heure. Les coordonnées personnelles des voyageurs ne sont ni demandées ni enregistrées. Un signalement ne modifie jamais les horaires officiels ni le suivi AIS.

## Suivi et disponibilité des données

La même source `trackingTimes` est utilisée dans les deux fiches. « Prévu », « estimé (AIS) » et « constaté (AIS) » restent distingués sur les horaires utiles. Sans position récente, la barre porte le libellé compact **Repère horaire** : elle représente l’avancement dans le créneau prévu et ne certifie pas la position réelle. Aucune durée n’est inventée lorsqu’elle manque.

Cette livraison ne configure pas de fournisseur AIS et ne fournit aucune clé serveur. L’absence de signal AIS n’empêche pas l’affichage des horaires disponibles. Les clés serveur existantes restent côté serveur et ne doivent jamais être ajoutées aux fichiers publics.

## Vérifications et tests

Les vérifications ont été effectuées sur une copie locale du dépôt avec ses dépendances : TypeScript réussi, 9 tests du calcul d’avancement et des compteurs portuaires réussis, compilation Vercel réussie et contrôle de l’accueil produit.

Le contrôle ESLint sémantique des fichiers modifiés passe sans erreur (9 avertissements de hooks ou Fast Refresh). Le lint global du dépôt conserve des problèmes antérieurs à cette livraison : formatage et fins de lignes, `prefer-const` dans `previewAuthStorage.ts` et `no-explicit-any` dans `team.functions.ts`. Ces fichiers ne sont pas modifiés par ce ZIP.

Contrôles navigateur : mise en page mobile de 320 et 390 pixels, ouverture depuis le bateau sur la carte, barre visible, absence de débordement horizontal et déplacement de carte avec un seul pointeur. Le geste physique à un doigt devra aussi être confirmé sur votre téléphone.

Les parcours de communauté ont été vérifiés avec une base PostgreSQL locale isolée : connexion de test, note, commentaire, avis en attente, publication administrateur, moyenne mise à jour, signalement, confirmation unique et clôture. Les lectures de données publiques ont servi au contexte ; aucune écriture distante n’a été faite.

Pour relancer les tests applicatifs après installation des dépendances :

```sh
npx tsc --noEmit
npx vitest run src/lib/ferry/crossingProgress.test.ts src/lib/ferry/portTraffic.test.ts
npx eslint src
npm run build:vercel
```

Pour tester la migration sans accéder à une base distante, depuis la racine du dépôt :

```sh
npm install --prefix work/db-tests --no-save --package-lock=false @electric-sql/pglite
node scripts/test-community-db.mjs
```

Ce dernier script crée une base éphémère, vérifie les accès, la modération, les catégories, les limites, les confirmations et l’expiration, puis la ferme. Il ne lit aucune clé de production.
