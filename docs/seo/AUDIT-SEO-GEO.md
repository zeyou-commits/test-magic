# Batogo — audit SEO/GEO et proposition de développement

Audit du dépôt fourni, établi le 17 octobre 2026. Le GEO désigne ici la visibilité et la citation dans les réponses de moteurs et assistants génératifs. Il ne s'agit pas du seul référencement local.

## La proposition

Faire de Batogo une référence de préparation du voyage Europe–Algérie, depuis le choix du port jusqu'au véhicule et à la sortie du terminal. La carte reste le cœur du service ; les dossiers et outils répondent aux questions que le voyageur se pose avant d'ouvrir les horaires.

Le lot livré apporte **32 nouvelles URL publiques**, en plus de la refonte du guide existant : 14 articles, 4 dossiers bateaux, 4 fiches de covoiturage, 4 simulateurs et 6 pages d'entrée ou de méthode. Les nouvelles pages documentaires fonctionnent sans accès à la base maritime. Les fiches ports et lignes continuent de dépendre des données publiées dans Supabase.

La proposition ambitieuse à six mois repose surtout sur des informations originales et entretenues : essais à bord documentés, accès portuaires photographiés avec autorisation, mesures de délais contextualisées, comparaisons de devis datés et retours d'expérience modérés. Aucun de ces éléments n'est inventé dans le lot.

## Périmètre et limites de l'audit

Examen du code, de l'arborescence, des métadonnées, des routes, du sitemap et des contenus présents dans le ZIP ; recherche de références primaires pour les nouveaux contenus. Sans accès à Search Console, Bing Webmaster Tools, aux statistiques, aux logs de robots et aux données de trafic, il n'est pas possible d'établir le nombre de pages indexées, les positions, les volumes de recherche ou un gain de trafic. Aucun score SEO global ni prévision chiffrée de croissance n'est fabriqué.

Cet audit ne constitue pas une mesure de performance du domaine en production. Les contrôles locaux de cette livraison sont consignés séparément dans VALIDATION.md.

## Les constats prioritaires

| Priorité | Constat dans le dépôt reçu | Effet probable | Traitement du lot |
|---|---|---|---|
| P0 | `ports.tsx` et `lignes.tsx` sont des parents de routes détaillées, mais n'affichent pas d'Outlet | Une URL de fiche peut rendre la liste parente sans son contenu spécifique ; à vérifier au navigateur | Séparation des index et des layouts parents ; fiches accessibles directement |
| P0 | Canonical présent sur les listes ports/lignes seulement ; domaine répété en dur | Signaux d'URL incomplets, risque de confusion au changement de domaine | Configuration unique, canonical absolu et Open Graph cohérent pour les pages publiques |
| P0 | robots.txt contient des groupes spécifiques Allow pour Googlebot/Bingbot ; exclusions seulement dans le groupe générique | Les exclusions du groupe générique ne sont pas reprises par ces groupes spécifiques | Un seul groupe cohérent ; pages privées en noindex et explorables pour lire la directive |
| P2 | noindex déjà présent sur auth, admin et compte ; exclusions robots incohérentes selon le groupe | Une interdiction d’exploration peut empêcher la relecture du noindex | noindex conservé et harmonisé avec nofollow, pages privées explorables ; les autorisations métier restent le contrôle de sécurité |
| P1 | Navigation surtout orientée carte/lignes ; guide unique et général | Peu de réponses dédiées aux intentions de préparation | 4 ensembles éditoriaux, nouveaux points d'entrée et maillage contextuel |
| P1 | Descriptifs de bateaux surtout dans le panneau de carte ; pas de dossier public dédié dans les routes | Les caractéristiques sont difficiles à découvrir par une recherche spécifique | 4 dossiers indépendants et liens depuis le site |
| P1 | Sitemap basé sur l'origine de la requête, sans échappement XML ni pagination explicite des catalogues | URL non canoniques sur prévisualisation ; catalogue potentiellement tronqué au-delà de la limite de l'API | Index de sitemaps, origine configurée, échappement et catalogue paginé |
| P1 | Le sitemap ignore les erreurs de données et peut retourner une liste partielle comme un succès | Un catalogue manquant peut être mis en cache | Sitemap éditorial indépendant ; sitemap maritime retourne 503 avec Retry-After en cas d'erreur |
| P1 | FAQPage sur la fiche ligne sans véritable bloc de questions identique visible | Balisage à entretenir sans bénéfice particulier pour ce service | WebPage et fil d'Ariane à la place ; FAQ lisibles dans les articles sans promesse de résultat enrichi |
| P1 | Peu de sources documentaires contextualisées pour le guide | Difficile d'évaluer les affirmations ou de les citer précisément | Références primaires, portée des sources, date éditoriale et page de méthode |
| P2 | Accueil surtout cartographique, titre H1 de page absent dans son composant | Le sujet principal manque d'un titre sémantique de page explicite | H1 accessible sans modifier l'expérience de carte |
| P1 éditorial | Contact documentaire et mentions légales incomplets dans le dépôt | Informations de confiance et canal de correction à compléter | Adresse de contact désormais configurable, laissée vide à votre demande ; identité de l’éditeur à renseigner avec vos informations réelles |
| À mesurer | Core Web Vitals, couverture réelle d'indexation, popularité et liens entrants | Inconnus depuis le ZIP | Plan de mesure après déploiement ; aucun résultat de terrain revendiqué |

## Architecture proposée et livrée

| Ensemble | Page d'entrée | Pages utiles et suite de parcours |
|---|---|---|
| Automobile | `/vehicules-moins-3-ans` | Régime d'importation → documents → âge → budget → simulateurs ; distinction vacances/installation durable |
| Voyage | `/voyage-algerie` | Voiture, budget du billet, cabine/fauteuil, famille, animaux, Marseille, Sète, arrivée en Algérie |
| Navires | `/bateaux` | Jean Nicoli, Danielle Casanova, Méditerranée, Badji Mokhtar III ; informations sourcées et limites de disponibilité |
| Route | `/covoiturage` | Grans–Salon, Gallargues, Avignon Nord, Narbonne ; point exact à confirmer et partage des dépenses |
| Outils | `/simulateurs` | Âge à la déclaration, budget d'importation, comparaison de deux voyages, partage des frais |
| Confiance | `/methode-editoriale` | Choix des sources, portée des dossiers, limites, correction |

Le guide `/guide` reste le catalogue transversal. Chaque article vise une tâche distincte ; il n'existe pas de série artificielle de pages quasi identiques par année, ville de départ ou mot-clé.

Les fiches ports et lignes conservent les slugs de la base. Les nouvelles fiches bateaux utilisent un catalogue documentaire explicite : on ne publie pas automatiquement toute ligne de base comme un dossier fiable.

## Les outils : une raison de consulter et de revenir

1. **Âge** : comparaison calendaire entre première mise en circulation et déclaration envisagée. Affichage du troisième anniversaire ; jour limite distinct ; convention du 29 février explicitée. Ce n'est pas un verdict d'admissibilité.
2. **Importation** : achat, acheminement, autres frais, montant fiscal fourni par le visiteur et conversion DZD/EUR choisie. Sans fiscalité confirmée, le résultat reste un sous-total incomplet. Aucun barème officiel supposé.
3. **Voyage** : comparaison A/B à périmètre égal, coûts du groupe et moyenne par personne. Pas de doublement automatique des valeurs déjà saisies pour l'aller-retour.
4. **Partage** : carburant, péages et parking répartis entre les occupants, conducteur compris. Aucun service de réservation ni annonce de transport.

Les champs ne sont pas transmis par ces outils. Ils n'introduisent ni base supplémentaire, ni compte obligatoire, ni nouveau service payant.

## GEO : rendre les pages utiles et attribuables

Le contenu comporte une réponse directe, des sections explicites, des tableaux quand la comparaison le justifie et des références officielles. Les données structurées décrivent les éléments réellement affichés : WebSite, Organization, Article, WebPage, CollectionPage et BreadcrumbList. Pas de faux avis, prix, notes, test personnel ou auteur expert imaginaire.

Cette structure améliore la compréhension et la vérifiabilité ; son effet sur la citation par une IA reste une hypothèse à mesurer. Google confirme que les fondations SEO restent pertinentes pour ses expériences génératives, sans balisage spécial ni fichier llms.txt requis. Le llms.txt existant est simplement entretenu comme sommaire facultatif.

Les mises à jour officielles de Google signalent en 2026 l'abandon de l'affichage des résultats enrichis FAQ. Les questions visibles restent utiles à la lecture ; elles ne sont pas présentées comme un levier d'affichage enrichi garanti.

Sources de ces recommandations :

- [Google Search Central — optimisation pour les fonctionnalités génératives](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google Search Central — mises à jour de la documentation](https://developers.google.com/search/updates/)
- [Google Search Central — règles des données structurées](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

## Là où Batogo peut devenir difficile à remplacer

La publication de guides généralistes ne suffit pas à créer une avance durable. Les formats suivants méritent un investissement de terrain, avec un responsable et des preuves :

- **Carnets de traversée** : date, sens, navire réellement emprunté, catégorie de cabine, photos originales et détails utiles au voyageur. Identifier qui a voyagé.
- **Accès portuaires vérifiés** : porte par compagnie et type de passager, plan officiel, date, dernier kilomètre et photos autorisées. Ne jamais exposer une zone interdite ni extrapoler à une autre compagnie.
- **Observatoire des temps** : heures constatées, taille d'échantillon, médiane et dispersion, période, limites. Aucun « temps moyen » avec deux témoignages.
- **Comparatif de devis** : même famille type, même voiture, même installation, dates et captures datées, frais inclus et disponibilité au moment du relevé. Pas de faux prix d'appel.
- **Retours de voyageurs structurés** : voyage vérifié, questions comparables, modération, droit de correction ; distinguer appréciation et faits.
- **Annuaire de covoiturage entretenu** : import documenté de la Base nationale avec licence et provenance, confirmation des accès, suivi des changements. Mesurer l'intérêt avant d'étendre à toute la France.

## Pilotage et indicateurs

| Objectif | Mesure | Rythme de revue |
|---|---|---|
| Découverte | URL soumises et indexées par ensemble, erreurs de sitemap, pages exclues | Hebdomadaire au lancement |
| Pertinence | Impressions, clics, CTR et requêtes par page ; séparation marque / hors marque | Mensuel |
| Utilité | Utilisations des outils, départs vers les horaires, clics vers la compagnie | Mensuel, après choix d'une mesure respectueuse du consentement |
| Qualité | Pages sans source, référence devenue inaccessible, correction en attente | Hebdomadaire |
| Visibilité générative | Panel fixe de questions, moteur et date, URL réellement citée et exactitude | Mensuel ; résultats variables, sans automatisation des requêtes non autorisée |
| Expérience | LCP, INP, CLS terrain si volume disponible ; diagnostic local complémentaire | Mensuel et après changement majeur |

Les événements de mesure sont des propositions ; aucun tracker n'est ajouté dans cette livraison. Ne pas envoyer de données de formulaires automobiles, dates personnelles ou documents dans une solution analytics.

## Les décisions à prendre ensuite

Le domaine de référence reste celui du dépôt : `https://test-magic.lovable.app`. S'il existe un domaine de production différent, le définir dans `seo.config.json` avant déploiement. Prévoir aussi un responsable éditorial identifié, un rythme de révision réaliste, un accès Search Console/Bing pour mesurer et des contributions de terrain pour les formats différenciants.

Les prochaines pages et leurs critères de publication sont détaillés dans ROADMAP-90-JOURS.md. L'ambition est un service documentaire et pratique entretenu, pas un volume de pages déconnecté de la qualité des données.
