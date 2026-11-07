# Modèles d'e-mails Supabase (Authentication → Emails → Templates)

Coller le contenu de chaque fichier dans le champ « Message body » du modèle, avec l'objet indiqué.

| Modèle Supabase | Fichier | Objet |
|---|---|---|
| Confirm signup | confirmation.html | Confirmez votre compte BledWay |
| Reset Password | recovery.html | Votre nouveau mot de passe BledWay |
| Change Email Address | email_change.html | Confirmez votre nouvelle adresse e-mail |
| Magic Link | magic_link.html | Votre lien de connexion BledWay |

Ne pas modifier `{{ .ConfirmationURL }}` ni `{{ .NewEmail }}` : Supabase les remplace à l'envoi.
