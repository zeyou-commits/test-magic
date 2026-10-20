# Contrôles de la livraison

Contrôles locaux effectués le 17 octobre 2026 sur le projet fourni et le lot de modifications. Aucun déploiement GitHub, Lovable ou de production n'a été effectué.

## Résultats obtenus

| Contrôle | Résultat | Portée |
|---|---|---|
| Compilation TypeScript | Réussie, aucune erreur | `tsc --noEmit` sur le projet complet |
| Build de production | Réussi | `npm run build`, compilation client, serveur et sortie Nitro |
| Tests SEO et calculs | 12 tests réussis dans 2 fichiers | Âge calendaire, jour limite, 29 février, dates invalides, taxes inconnues, conversion, totaux, occupants, liens, sources, encodage et canonical |
| Régression existante | 6 tests réussis dans 2 fichiers | Réservation des billets et durée du séjour, sans modification des tests existants |
| HTML rendu côté serveur | 44 réponses publiques 200 vérifiées | Les 42 URL du sitemap statique, plus une fiche port et une fiche ligne avec données de test |
| Titres et canonical | Un H1 et un canonical exact sur chacune de ces 44 réponses | Vérification du HTML livré à la requête, sans exécution JavaScript cliente |
| Données structurées | JSON analysable sur ces pages | Vérification de syntaxe ; ce n'est pas une validation d'éligibilité à un résultat enrichi |
| URL inexistantes | 4 réponses 404 vérifiées | Un slug absent dans chaque ensemble : guide, bateaux, covoiturage et simulateurs |
| Pages privées | Directive `noindex, nofollow` présente | Auth, compte et admin, sans connexion |
| Sitemaps | Index, pages et maritime répondent en XML | Catalogue maritime avec données de test ; présence de la fiche ligne vérifiée |
| Erreur du catalogue | 503 et `Retry-After: 300` vérifiés | Indisponibilité de la source maritime simulée ; sitemap des pages toujours disponible |
| Formulaires React | Les 4 exemples calculent le résultat attendu | Environnement DOM simulé, activation de l'exemple puis soumission ; vérification d'un label pour chaque champ |
| Lint ciblé | Aucune erreur, 2 avertissements | Fichiers TS/TSX livrés, hors routeTree généré et grandes pages privées dont seul le head change |

Les avertissements de lint portent sur l'export partagé de navigation dans SiteLayout et une dépendance du gestionnaire d'erreur racine. Les constructions concernées existaient déjà dans le dépôt reçu. Le build conserve aussi un avertissement de taille de certains bundles ; il ne s'agit pas d'une mesure Core Web Vitals.

## Ce que les données de test prouvent

Les contrôles serveur utilisent un catalogue fictif de deux ports et une ligne, en remplaçant les réponses de lecture Supabase dans le processus de test. Ils prouvent l'affichage de la bonne route et les contrats de réponse. Ils ne prouvent pas la qualité ou la disponibilité du catalogue en production, les droits RLS effectifs, ni l'actualité des départs.

Les tests de formulaires utilisent un DOM simulé, pas un moteur de rendu graphique. Les exemples ne sont pas des prix de marché : l'importation reste incomplète sans fiscalité saisie, la comparaison de voyages donne un écart fictif de 103,60 €, et le partage fictif donne 31,30 € par occupant.

## Vérification visuelle à effectuer après déploiement

Le navigateur graphique de l'environnement n'a pas pu être lancé. **Aucune validation visuelle, capture de navigateur réussie, mesure de débordement ou conformité WCAG complète n'est revendiquée.**

Les points à vérifier sur l'hébergement sont donc :

- Rendu à 320, 768, 1024 et 1440 pixels, en particulier sommaire, tableaux et comparaison de budgets.
- Navigation au clavier, visibilité du focus, lecture avec un lecteur d'écran et ouverture du menu mobile.
- Réactivité des champs avec le clavier numérique d'un vrai téléphone et validation native des dates/montants.
- Hydratation dans un navigateur réel, absence d'erreur console et conservation de l'expérience de carte.
- Affichage des données réelles des ports/lignes et fonctionnement des signaux d'indisponibilité.

Les styles mobiles, labels, boutons natifs, zones de résultat annoncées et défilements de tableaux sont intégrés au code. Ces dispositions ne remplacent pas les vérifications visuelles listées ci-dessus.

## Ce qui reste hors périmètre

Pas de connexion à un compte de production, de test d'envoi de signalement, d'alerte e-mail, de paiement ou de réservation réelle. Pas d'audit de logs, de positions Google/Bing, de trafic, d'indexation réelle, de liens entrants ou de performance terrain.

L'adresse de contact est volontairement laissée vide, selon votre choix. Les mentions légales attendent toujours les coordonnées réelles de l'éditeur. La relecture spécialisée et l'actualisation réglementaire sont particulièrement importantes pour toute décision d'importation.

La comparaison finale du ZIP avec l'archive d'entrée contrôle que seuls des fichiers nouveaux ou modifiés sont inclus, que les fichiers source sont complets et qu'aucun fichier secret, dépendance installée, build ou journal temporaire n'est livré.
