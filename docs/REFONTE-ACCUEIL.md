# Accueil BledWay — refonte graphique

## Direction retenue

Charte globale v1 utilisée comme référence de conception. Deux choix plus récents de l’utilisateur priment : le logo fourni bleu/rouge et les boutons d’action verts (#0E7A43).

L’accueil commence par la recherche et la carte interactive. Il se poursuit par une présentation courte, des liaisons issues des données existantes, les bateaux, des guides, une FAQ et le pied de page. Les rubriques gardent leurs propres adresses.

## Réalisation

- Palette sable, blanc, encre, bleu Méditerranée et vert d’action ; Inter pour les textes.
- En-tête et pied de page partagés, navigation Explorer regroupée.
- Logo fourni préservé, sans recoloration.
- Trois illustrations SVG originales : côte, ferry générique, bagages. Aucune image ne prétend représenter un navire identifié.
- Carte désaturée, tracés unifiés, sélection verte ; zoom à la molette désactivé et gestes coopératifs pour permettre le défilement de la page.
- Recherche compacte, sélecteurs de ports existants réutilisés en popover / écran mobile. Résultats détaillés après choix des critères.
- Les liaisons éditoriales réouvrent la carte avec les ports correspondants et conservent les dates.
- Animations de révélation discrètes, respect de la réduction des mouvements, sillage décoratif continu retiré.
- Détails masqués exclus du parcours clavier ; retour du focus à la fermeture d’une fiche.
- Prix et actions de redirection explicitement présentés comme estimations et consultation d’offres.

## Périmètre

La refonte ne modifie pas les horaires ou positions en base. L’anomalie de durée Sète–Béjaïa constatée pendant l’audit nécessite une vérification de la donnée source ; aucune durée de remplacement n’a été inventée.

Le thème clair est la référence. Une certification d’accessibilité ou de performance n’est pas revendiquée.

## Vérification

- Compilation de production : réussie.
- TypeScript : aucune erreur.
- ESLint sur les composants modifiés : aucune erreur ; 11 avertissements, principalement sur les dépendances de hooks existantes.
- Parcours vérifié dans le navigateur : sélection Marseille → Alger sur mobile, passage aux dates puis aux voyageurs, affichage des résultats, liaison éditoriale vers la carte, défilement de toutes les sections.
- Largeurs contrôlées : 320, 768, 1024 et 1440 px. Aucun débordement horizontal de la page observé ; le calendrier a été adapté au petit écran.
- Tests ferry existants : 15 réussites, 2 échecs dans tracking.test.ts. Le module de suivi et ses tests sont identiques à main ; ils n’ont pas été modifiés par cette refonte.
- Le suivi AIS serveur complet n’a pas été validé localement : SUPABASE_SERVICE_ROLE_KEY n’est pas fourni dans cet environnement. Les listes publiques de ports, lignes et départs ont chargé depuis la connexion existante.

Les tests ont été exécutés sur une copie des sources dans un dossier de chemin court, avec les mêmes dépendances déclarées, afin de contourner les restrictions Windows sur les caches et les liens symboliques. Aucun changement d’outillage n’est ajouté au dépôt.
