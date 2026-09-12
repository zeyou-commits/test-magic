# FerryDZ — Plan d'architecture V1 (Informer & Explorer)

Objectif : « Comprendre le réseau ferry Europe → Algérie en un coup d'œil. » La carte est le produit.

## A. Architecture recommandée

- **Frontend** : TanStack Start (React 19) + Tailwind, déjà en place. Interface publique et back-office séparés par arborescence de routes.
- **Backend** : fonctions serveur de l'app pour toute écriture (avis, signalements, actions admin). Validation systématique côté serveur.
- **Base de données + auth + stockage images** : Lovable Cloud (base Postgres, comptes utilisateurs, connexion Google + e-mail, stockage des logos de compagnies et photos de navires).
- **Cartographie (recommandation)** : MapLibre GL (rendu vectoriel, gratuit, fond de carte libre). Comparaison courte :
  - Leaflet : simple mais rendu raster, labels/lignes moins fluides, moins prêt pour des navires animés.
  - Mapbox GL : excellent mais clé payante et quota.
  - **MapLibre GL : retenu** — fluide, marqueurs et labels totalement personnalisés en HTML, lignes vectorielles, aucun coût de licence, compatible V3 (navires live).
- **Stratégie données** : lecture publique servie par la base (pas de données métier en dur dans les composants) ; écriture toujours contrôlée serveur.

## B. Modèle de données

```text
ports ──┬─< routes >─┬── ports
        │            └─< route_operators >── companies ──< vessels
        │
        │            routes ──< schedules ──< departures >── vessels
        │                                  └─< schedule_exceptions
        └─< port_reviews >── users
             └─< review_ratings >── rating_criteria
        reports >── (port | route | departure | review)
        moderation_log >── users(admin)
        data_sources ── (schedules, departures)
```

Tables principales :

- **ports** : nom, pays, ville, lat/lng réels, `label_anchor` (left/right/top/bottom), `label_offset_x/y`, statut, infos utiles (bloc structuré : prière, propreté, salle d'attente, douane, sanitaires, parking, accès, transports, restauration, PMR), source et date de vérification des infos. Nombre de connexions **calculé**, jamais stocké.
- **companies** : nom, logo, description, site, statut.
- **vessels** : nom, compagnie, photo, type, description, statut.
- **routes** : port de départ, port d'arrivée, durée typique (minutes), distance indicative, actif/inactif. Une ligne = un couple de ports.
- **route_operators** : table de liaison ligne ↔ compagnie (une ligne peut être exploitée par plusieurs compagnies).
- **schedules** (calendrier récurrent) : ligne, compagnie, navire par défaut, heure de départ, durée, jours de circulation, période de validité (du/au), statut, source.
- **departures** (traversée concrète datée) : ligne, compagnie, navire, date+heure départ, date+heure arrivée, statut (programmé / modifié / annulé), rattachement optionnel au calendrier générateur, source, dernière vérification, fiabilité (vérifié / à vérifier / potentiellement obsolète).
- **schedule_exceptions** : calendrier, date concernée, type (annulation, décalage, changement de navire), valeurs de remplacement, motif.
- **rating_criteria** : critères de notation en base (prière, propreté, etc.) → ajout de critères sans migration.
- **port_reviews** : utilisateur, port, commentaire, statut (en attente / approuvé / publié / refusé / masqué / supprimé), date.
- **review_ratings** : avis, critère, note. Moyennes **calculées** (par critère, globale, nombre d'avis).
- **reports** (signalements) : auteur, type de cible + identifiant de cible, motif, message, statut (nouveau / en cours / traité / rejeté).
- **moderation_log** : action, administrateur, objet, ancienne valeur, nouvelle valeur, date, commentaire.
- **user_roles** : rôles dans une table dédiée (utilisateur / admin), jamais sur le profil.

Toutes les données de démonstration sont marquées comme telles (`is_demo`) et l'interface affiche clairement « données de démonstration » tant qu'un horaire n'est pas vérifié.

## C. Architecture frontend

- Interface publique : page carte (accueil), fiche port, fiche ligne, page connexion, page compte.
- Back-office (accès admin) : tableau de bord, ports, lignes, calendriers, départs, compagnies, navires, avis, signalements, utilisateurs, sources/qualité, historique de modération.
- Composants : coquille carte, sidebar (recherche + filtres), fiche port (popup desktop / bottom sheet mobile), badges de durée, listes de départs, états vides et de chargement.
- Séparation stricte : données ← accès aux données ← logique métier ← logique carte ← composants UI.

## D. Architecture cartographique

- Les coordonnées GPS viennent de la base et ne sont **jamais** modifiées pour un souci visuel.
- Le placement des labels est un système séparé : ancre + décalage x/y stockés par port (européens à gauche, algériens en dessous, décalages spécifiques pour Marseille et Sète), ajustables en base sans toucher au code.
- Lignes maritimes tracées en couches vectorielles ; la sélection met la ligne en avant, atténue les autres et met en valeur les deux ports.
- Badge de durée positionné au milieu du tracé, discret, masqué automatiquement aux zooms trop faibles pour éviter la surcharge.
- Les filtres agissent sur les données affichées, sans bouton « Appliquer ».
- Mobile : carte plein écran, panneau inférieur repliable, zones tactiles agrandies.

## E. Calendriers

Quatre notions séparées : la **ligne** (permanent), le **calendrier** (règle récurrente sur une période), le **départ** (traversée datée réelle), l'**exception** (annulation ou modification ponctuelle). Les départs sont générés depuis les calendriers puis modifiables individuellement (horaire, navire, annulation). Chaque départ porte sa source, sa date de vérification et son niveau de fiabilité.

## F. Avis et modération

- Utilisateur connecté : note par critères + commentaire → statut « en attente ». Rien n'est publié automatiquement.
- Admin : approuver, publier, refuser, masquer, supprimer, traiter les signalements ; chaque décision est enregistrée dans l'historique.
- Notes agrégées à la lecture (moyenne par critère, moyenne globale, nombre d'avis) uniquement sur les avis publiés.

## G. Sécurité

- Lecture publique : ports, lignes, compagnies, navires, calendriers, départs, avis **publiés** uniquement.
- Écriture : uniquement l'auteur pour ses propres avis et signalements, en statut « en attente ».
- Back-office : réservé au rôle admin, vérifié côté serveur à chaque action, jamais depuis le navigateur.
- Avis non publiés, signalements et historique : invisibles au public.

## H. Roadmap technique

1. **Fondations données** — Cloud activé, tables, règles d'accès, jeu de démonstration (11 ports, quelques compagnies, navires, lignes, départs). Terminé quand les données sont lisibles et clairement étiquetées « démonstration ».
2. **Carte** — carte plein écran, fond de carte, zoom/déplacement, responsive. Terminé quand la carte domine l'écran sur desktop et mobile.
3. **Ports, lignes, durées** — marqueurs aux coordonnées réelles, labels indépendants avec décalages, tracés et badges de durée. Terminé quand aucun label ne se chevauche et que les durées sont lisibles.
4. **Fiche port** — destinations, compagnies, prochains départs, infos utiles ; popup desktop / bottom sheet mobile.
5. **Sidebar et filtres** — recherche et filtres (départ, arrivée, compagnie, date, navire) mettant la carte à jour instantanément.
6. **Calendriers et départs** — génération des départs, statuts, source et fraîcheur affichés.
7. **Comptes** — Google + e-mail, session, rôles.
8. **Avis, notes, signalements** — dépôt en attente de modération, agrégation à l'affichage.
9. **Back-office et modération** — gestion complète des données, priorité à la saisie rapide des départs, historique.

L'ordre demandé est conservé ; seule adaptation : les états de chargement/erreur/vides sont traités dans chaque étape plutôt qu'en fin de projet.

## I. Risques et parades

- **Chevauchement des labels** : système de décalage en base, réglable donnée par donnée.
- **Récurrences de calendrier** : séparation calendrier / départ / exception, et un départ modifiable reste toujours prioritaire sur sa règle.
- **Fiabilité des horaires** : statut de fiabilité visible, données de démonstration explicitement signalées.
- **Performance carte** : dataset volontairement petit en V1, badges masqués aux faibles zooms.
- **Modération** : aucune publication directe, par construction.
- **Responsive** : la carte reste prioritaire, panneaux repliables.

## J. Décisions à valider avant de coder

1. MapLibre GL comme technologie de carte (recommandation).
2. Hypothèses prises : lignes strictement Europe → Algérie en V1 ; avis uniquement sur les ports ; ports avec coordonnées réelles et horaires de démonstration étiquetés.
3. Une seule langue d'interface en V1 (français) — à confirmer.

Hors périmètre V1, conformément au cahier des charges : paiement, réservation, tarifs, suivi live/AIS, covoiturage, chat.
