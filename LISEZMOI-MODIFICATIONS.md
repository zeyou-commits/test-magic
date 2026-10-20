# Batogo — mise à jour v8 (calendrier, partage, cartes, fiches, mobile)

Cette version part de **ton zip de production (6)**. Elle ne touche ni au suivi des navires, ni à l'administration des équipes, ni aux migrations 0001 à 0003.

## Ce qui change

| # | Demande | Résultat |
|---|---------|----------|
| 1.1 | Masquer les dates passées | Les jours écoulés disparaissent du calendrier (et les semaines entièrement passées aussi). |
| 1.2 | Hors période commerciale | Si tu choisis des vacances sans aucun départ programmé (puces marquées « à venir »), un message s'affiche : « Les traversées ne sont pas encore programmées pour ces dates », avec un formulaire « Me prévenir » (e-mail + case de consentement). |
| 1.3 | Calendrier mobile | Cases de 44 px maximum (taille tactile), calcul selon la largeur de l'écran, plus de barre de défilement horizontale, boutons de zone et de souplesse plus grands sur téléphone. |
| 1.4 | Frise « Prochains départs » | Frise réduite (7 jours à la fois) avec flèches **Dates précédentes / Dates suivantes**. |
| 2 | Partage | Boutons **Copier le lien** et **Partager** (menu natif du téléphone) : sur la liste des résultats, dans le détail de chaque traversée et en haut de chaque fiche. |
| 3 | Cartes de départs | Mention « Source : Excel » supprimée (partout, pour tout import interne). Logo de la compagnie affiché (à défaut, pastille de couleur avec initiales) et bandeau de couleur propre à chaque compagnie. |
| 4 | Fiches bateaux | Photo plus petite et plus légère (480 px au lieu de 720, bandeau de 144 px), en-tête resserré : compagnie avec logo, numéro IMO, lien « Suivre en direct » sur une seule ligne. |
| 5 | Fiches ports | Nouvelle fiche : grande photo, repères (lignes, départs, fuseau), départs avec logo de compagnie, **services en pictogrammes**. Toutes les informations d'avant sont conservées. |
| 6 | Carte mobile | Un tap sur un port n'ouvre **que la bulle**. Le panneau détaillé s'ouvre uniquement avec « Voir la fiche du port ». La bulle reste visible au-dessus du tiroir. |
| 7 | Vacances scolaires | Le bouton « Vacances scolaires » est un **interrupteur on/off** (mémorisé). Activé, les vacances de la zone A, B ou C sont colorées dans le calendrier ; l'interrupteur est aussi dans le calendrier, avec le choix de zone. Si les prochaines vacances n'ont aucun départ, l'alerte « Me prévenir » s'affiche. La section « Où voulez-vous traverser ? » devient une ligne « Trajets fréquents » et le partage passe en icônes : les premiers départs sont visibles sans défiler. |
| 8 | Mobile : carte d'abord | Plus de boutons Départ / Arrivée en haut de la carte : un en-tête fin (logo + menu burger) laisse la carte respirer. Départ, arrivée, dates et voyageurs sont tous dans le tiroir du bas, ouvert à mi-hauteur par défaut. |

## Point d'attention : notes des bateaux

Je n'ai trouvé **aucun système de notes pour les bateaux**, ni dans ton code ni dans ta base : seules les **notes des ports** existent (tables `port_reviews`, `review_ratings`, `rating_criteria`). Il n'y a donc rien à « restaurer ». Si tu veux des notes pour les bateaux, il faut créer une table et une modération : dis-le-moi et je le fais.

## À faire côté Supabase (2 scripts, une seule fois)

Dans Supabase → SQL Editor, exécute le contenu de ces deux fichiers :

1. `supabase/migrations/20261013130000_sales_alerts.sql` : table des alertes « prévenez-moi ».
2. `supabase/migrations/20261013140000_port_photos.sql` : colonne `photo_url` pour les ports.

Sans le script 1, le formulaire « Me prévenir » affiche une erreur. Sans le script 2, le champ photo de l'admin ne s'enregistre pas (l'affichage public marche quand même).

## Alertes « Me prévenir »

Les e-mails sont enregistrés dans la table `sales_alerts` (visible par les administrateurs). **Aucun e-mail n'est envoyé automatiquement** : c'est une liste à exploiter à l'ouverture des ventes. Pense à mentionner ce traitement dans ta page de confidentialité (finalité, durée de conservation).

## Photos des ports

Admin → Ports → champ **Photo du port** (lien https). Sans photo renseignée, le site cherche une photo libre sur Wikimedia Commons (crédit et licence affichés) ; sinon une illustration s'affiche.

## Fichiers à remplacer ou créer sur GitHub

Glisse le **contenu** du dossier `A-GLISSER-SUR-GITHUB` (pas le dossier lui-même) : GitHub → Add file → Upload files.

**À remplacer (16)**
- `LISEZMOI-MODIFICATIONS.md` (cette notice, facultatif)
- `src/components/map/FerryMap.tsx`
- `src/routes/index.tsx`
- `src/components/panel/EntityViews.tsx`
- `src/components/panel/PortView.tsx`
- `src/components/panel/SailingCard.tsx`
- `src/components/panel/SearchPanel.tsx`
- `src/components/panel/SidePanel.tsx`
- `src/components/panel/TripCalendar.tsx`
- `src/components/panel/shared.tsx`
- `src/integrations/supabase/types.ts`
- `src/lib/ferry/format.ts`
- `src/lib/ferry/types.ts`
- `src/lib/ferry/vesselPhoto.ts`
- `src/routes/admin.tsx`
- `src/styles.css`

**À créer (6)**
- `src/components/panel/CompanyBadge.tsx`
- `src/components/panel/FacilityIcons.tsx`
- `src/components/panel/SalesAlertForm.tsx`
- `src/components/panel/ShareButtons.tsx`
- `supabase/migrations/20261013130000_sales_alerts.sql`
- `supabase/migrations/20261013140000_port_photos.sql`

**À supprimer (1)** : `src/components/map/MobileMapControls.tsx` (GitHub → ouvrir le fichier → icône corbeille → Commit).

## Contrôles effectués

- TypeScript : aucune erreur.
- Test navigateur en local : tap sur un port (bulle seule, puis fiche), frise et cartes, calendrier (jours passés masqués, alerte hors période), fiches port et bateau.
- Non testé : l'enregistrement réel d'un e-mail d'alerte (la table n'existe pas encore chez toi), le partage natif sur un vrai téléphone, le build final de production (à vérifier au déploiement).
