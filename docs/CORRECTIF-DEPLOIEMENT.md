# Correctif BledWay : accueil et chargement

Le correctif part de `origin/main` au commit `8334c1d`.

## Diagnostic vérifié

- Les fichiers de la refonte avaient été ajoutés à la racine (`components/`, `routes/`, `home.css`, etc.). Les alias et les routes de l’application utilisent `src/`. Les anciens composants étaient donc encore compilés.
- Le HTML servi par `https://test-magic.vercel.app` demandait `/@id/virtual:tanstack-start-dev-client-entry`. Cette ressource de développement renvoyait 404. Sans hydratation, les requêtes publiques ne démarraient pas dans le navigateur.
- La panne est reproduite en remettant les fichiers racine : Nitro détecte `server.ts` comme une entrée serveur supplémentaire, en dehors du service SSR de TanStack. Son manifeste ne pointe alors plus sur le bundle de production. `nitro.config.ts` désactive cette détection automatique.
- Ce constat ne démontre pas une perte de données en base. Le build corrigé charge les données publiques existantes.

## Changements

- Remise de la refonte dans `src/`, suppression des 191 doublons vérifiés à la racine. Leur contenu correspond à la version précédemment livrée.
- Dossier source explicitement fixé à `src` et preset Nitro fixé à `vercel`.
- Entrée serveur automatique de Nitro désactivée : seul le service SSR Vite/TanStack utilise `src/server.ts`.
- `vercel.json` choisit TanStack Start et `npm run build:vercel`, avec détection automatique du dossier de sortie. Le build habituel reste disponible pour Lovable.
- Contrôle après compilation : rendu de la vraie fonction Vercel, réponse 200, présence du nouvel accueil, absence de ressources de développement, existence des bundles JS et CSS référencés.
- Palette sable/encre/bleu, police Inter et boutons d’action verts `#0E7A43` de la refonte conservés.
- Hauteur du sélecteur de ports limitée à l’espace disponible ; la liste défile et son bouton de validation reste accessible.

L’intégration Nitro correspond à la [documentation Vercel pour TanStack Start](https://vercel.com/docs/frameworks/full-stack/tanstack-start). Aucun second plugin TanStack ou Nitro n’est ajouté.

## Validation

- `tsc --noEmit` : réussi.
- ESLint ciblé sur le sélecteur et le contrôle de production : réussi.
- `npm run build:vercel` : réussi, y compris le contrôle du HTML et des ressources.
- Même contrôle réussi en conservant les 191 fichiers racine, pour reproduire l’application du ZIP depuis GitHub. Sans `serverEntry: false`, ce scénario reproduit exactement la panne.
- Le contrôle rejette aussi le HTML défectueux récupéré sur le site public avant correction.
- Test navigateur du build Vercel : nouvelle interface, carte, 15 ports, 9 compagnies et 20 traversées sous 7 jours affichés lors du test. Ouverture du formulaire et sélecteur de ports vérifiés. Bouton principal mesuré à `rgb(14, 122, 67)`.
- À 1280 × 720, le bouton de validation du sélecteur reste dans l’écran et ferme correctement la fenêtre.
- Les données publiques ne sont pas simulées. Aucune migration de base ni modification des horaires.
- Le suivi AIS serveur reste un sujet distinct : l’API publique renvoie actuellement une liste de positions vide. L’environnement local ne contient pas les secrets nécessaires à sa collecte ; le retour des ports et des horaires ne prouve pas le fonctionnement de cette collecte.

## Application avec Git

Sur une copie propre et à jour de `main`, appliquer le patch avec `git am <chemin-du-patch>`. Examiner les changements puis pousser le commit. Aucun historique publié n’est réécrit.

## Application depuis le site GitHub

Le ZIP de correction ne contient que les fichiers à ajouter ou remplacer. Après extraction, ouvrir **Add file → Upload files** à la racine de `main`. Déposer les dossiers `src`, `scripts`, `public`, `docs` et les fichiers `package.json`, `vite.config.ts`, `nitro.config.ts`, `vercel.json`, `.gitignore` en conservant leurs noms et leur arborescence.

**Ne pas ouvrir `src` pour déposer son contenu à la racine.** La page d’envoi doit montrer `src/home.css` et `src/routes/index.tsx`, jamais `home.css` ou `routes/index.tsx`.

Cette méthode remplace les sources utilisées et la configuration. Un envoi de fichiers ne supprime pas les anciens doublons de la racine ; le patch Git réalise également ce nettoyage. La configuration explicite utilise les fichiers sous `src/`.

Après le commit sur `main`, attendre le nouveau déploiement Vercel. Le dossier racine du projet Vercel doit être la racine du dépôt (celle de `package.json`). Vérifier que le déploiement affiche la commande `npm run build:vercel` et le message `Production Vercel vérifiée` dans ses logs.

Le déploiement distant n’a pas été effectué depuis cette session : l’authentification Git en écriture n’est pas disponible.
