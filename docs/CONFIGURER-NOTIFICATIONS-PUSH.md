# Activer les notifications BledWay

Le code prévoit trois types de messages : ouverture d'une liaison sur le mois suivi, rappels d'une traversée (7 jours, 48 heures, 24 heures) et nouveaux signalements/avis d'un bateau suivi. Chaque message est enregistré dans « Mon compte » avant l'envoi Web Push. Les envois échoués sont réessayés jusqu'à cinq fois ; les abonnements expirés sont supprimés.

## 1. Base de données

Dans Supabase → SQL Editor, exécuter les migrations dans cet ordre si elles ne sont pas déjà appliquées :

1. `supabase/migrations/20261022110000_sales_alert_journey.sql`
2. `supabase/migrations/20261022140000_push_follows.sql`

Ne pas coller la clé `service_role` dans le code client ou dans une variable `VITE_*`.

## 2. Clés Web Push

Depuis le dossier du projet, exécuter `npx web-push generate-vapid-keys --json`. Conserver la paire générée dans un gestionnaire de secrets. Dans Vercel → Project → Settings → Environment Variables, configurer :

| Variable | Valeur |
| --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | clé publique VAPID |
| `VAPID_PUBLIC_KEY` | même clé publique |
| `VAPID_PRIVATE_KEY` | clé privée VAPID |
| `VAPID_SUBJECT` | `https://test-magic.vercel.app` ou une adresse `mailto:` valide |
| `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` du projet Supabase |
| `CRON_SECRET` | chaîne aléatoire longue (32 caractères ou plus) |

Conserver les variables Supabase déjà en place. Redéployer après l'ajout de la clé publique : elle est intégrée au build client. Une rotation VAPID invalide les abonnements navigateur existants ; les voyageurs devront réactiver les notifications.

## 3. Traitement périodique

`vercel.json` déclenche `/api/push-dispatch` une fois par jour vers 08:07 UTC (sur Vercel Hobby, l'appel peut arriver plus tard dans l'heure). Ce traitement couvre les rappels et les ouvertures, mais un signalement voyageurs expire au bout de deux heures. Pour ces informations urgentes, activer aussi Supabase Cron et `pg_net` dans Supabase → Integrations / Database Extensions, puis enregistrer deux secrets dans Supabase Vault :

- `bledway_dispatch_url` : `https://test-magic.vercel.app/api/push-dispatch` (adapter au domaine de production réel)
- `bledway_cron_secret` : la même valeur que `CRON_SECRET` dans Vercel

Dans SQL Editor, créer le job :

```sql
select cron.schedule(
  'bledway-push-10m',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bledway_dispatch_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bledway_cron_secret')),
    timeout_milliseconds := 30000
  );
  $$
);
```

Le job est idempotent : une notification ne peut être créée qu'une fois par événement et par voyageur. Les clés restent dans Vault et Vercel.

## 4. Contrôle

1. Sur un appareil compatible, se connecter, ouvrir une fiche traversée et choisir « Suivre ». Autoriser les notifications lorsque le navigateur le demande.
2. Vérifier l'abonnement et les suivis dans « Mon compte », puis les compteurs dans Back-office → Notifications.
3. Contrôler les exécutions dans Supabase Cron et Vercel Logs. Une réponse JSON contient `created`, `pushed` et `pending`.
4. Sur iPhone, installer d'abord l'app sur l'écran d'accueil ; l'autorisation push se demande depuis l'app installée. Sur les autres navigateurs, elle se demande au clic sur « Suivre » ou « Activer les notifications ».

Les rappels d'arrivée au port sont des repères à confirmer auprès de la compagnie. Les avis et signalements sont des contributions de voyageurs, pas des annonces officielles.
