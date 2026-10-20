# Mise à jour SEO/GEO Batogo — 17 octobre 2026

Cette livraison est un **lot de fichiers complets à ajouter ou remplacer**, préparé depuis le ZIP fourni dans cette conversation. Elle n'est pas une archive du projet entier et ne contient aucun fichier de configuration secret.

## Dépôt sur GitHub

1. Décompresser le ZIP.
2. Ouvrir le dépôt GitHub correspondant au projet fourni, à sa racine.
3. Avec **Add file → Upload files**, déposer le contenu décompressé : les fichiers de la racine et les dossiers `src`, `public`, `scripts` et `docs`. Préserver tous les sous-dossiers. Ne pas créer un dossier supplémentaire portant le nom du ZIP dans le dépôt.
4. Remplacer les fichiers de même chemin et ajouter les nouveaux, dans un seul commit. Ne pas déposer uniquement les pages : les données, composants, utilitaires et routes générées font partie du lot.
5. Laisser le déploiement habituel du projet se terminer, puis vérifier les pages indiquées dans `docs/seo/PAGES-LIVREES.md` et les contrôles ci-dessous.

Aucun fichier existant n'est à supprimer. Aucune migration SQL ni nouvelle dépendance applicative n'est nécessaire. Les dépendances du projet restent celles de votre `package.json` initial ; seuls des scripts sont ajoutés/modifiés.

Si le dépôt a évolué depuis le ZIP de départ, comparer d'abord les fichiers modifiés : le remplacement d'un fichier complet peut écraser une modification plus récente. La liste des fichiers et leurs empreintes de départ figurent dans `docs/seo/FICHIERS-LIVRES.json`.

## Résultat

- 32 nouvelles URL publiques, plus une refonte du guide existant.
- 14 articles sourcés, 4 dossiers bateaux et 4 fiches de covoiturage.
- 4 outils : âge du véhicule, budget d'importation, comparaison de voyages et partage des frais.
- Réparation de la structure des routes parents/index pour les fiches ports et lignes.
- Canonicals et métadonnées cohérents, fil d'Ariane, données structurées correspondant au contenu et maillage interne.
- Sitemap éditorial indépendant de Supabase et sitemap maritime paginé ; gestion explicite d'une indisponibilité.
- Audit argumenté, proposition de développement et roadmap de 90 jours dans `docs/seo`.

Les articles sont des entrées complètes dans `src/content/articles.ts`. Leur rendu complet se trouve dans `src/routes/guide.$slug.tsx` et les composants éditoriaux. C'est une architecture de pages avec données partagées, pas un fichier HTML à recopier par article.

## Configuration conservée et points à compléter

Comme demandé, le domaine reste `https://test-magic.lovable.app`. La source commune est `seo.config.json`.

L'adresse de contact éditoriale reste à renseigner plus tard : remplacer la chaîne vide de `contactEmail` dans ce fichier quand une adresse publique sera disponible. La page Contact l'affichera alors avec un lien e-mail. Aucun message n'est envoyé automatiquement par cette mise à jour.

L'identité et les coordonnées de l'éditeur dans les mentions légales doivent être complétées avec vos informations réelles. Elles n'ont pas été inventées. La présente livraison ne remplace pas une validation juridique des mentions ou du régime d'importation.

En cas de changement de domaine, modifier `siteUrl`, exécuter `npm run seo:discovery` puis déposer aussi les deux fichiers `public/robots.txt` et `public/llms.txt` régénérés. Le build les régénère également. Prévoir les redirections de l'ancien domaine dans l'hébergement avant toute migration.

## Vérification locale habituelle

```sh
npm install
npx tsc --noEmit
npm run test:seo
npm run build
```

`src/routeTree.gen.ts` est généré par TanStack Router ; sa version complète est incluse pour que tous les imports et types des nouvelles routes soient disponibles. Le plugin peut la régénérer au lancement ou au build. Ne pas y écrire des modifications manuelles.

## Contrôles après déploiement

- Ouvrir `/guide`, un article, un dossier bateau, une fiche de covoiturage et chacun des quatre simulateurs.
- Ouvrir directement une URL existante `/ports/<slug>` et `/lignes/<slug>` : elle doit afficher la fiche, pas seulement la liste.
- Vérifier le rendu à 320, 768, 1024 et 1440 pixels, le menu mobile, le clavier, les formulaires et l'absence de débordement.
- Vérifier `/robots.txt`, `/sitemap.xml`, `/sitemap-pages.xml` et `/sitemap-maritime.xml`.
- Si le sitemap maritime renvoie 503, vérifier l'accès aux tables publiques et les variables déjà nécessaires au site. Le sitemap éditorial doit rester disponible.
- Soumettre le sitemap principal aux outils de recherche dont vous disposez et suivre l'indexation. Ce dépôt de fichiers ne soumet ni ne publie ces URL à lui seul.

Le détail des contrôles effectivement réalisés et des limites se trouve dans `docs/seo/VALIDATION.md`.
