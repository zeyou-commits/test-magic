# Application Android BledWay (Trusted Web Activity)

L'application Android `com.bledway.app` affiche https://www.bledway.com en plein écran
dans Chrome (Trusted Web Activity, générée avec Bubblewrap, open source). Toute
modification du site est donc visible dans l'application **sans republier sur Google Play**.

Il ne faut republier (nouvel AAB) que pour changer l'icône, le nom, les couleurs ou le
package : modifier `twa-manifest.json`, augmenter `appVersionCode` et `appVersionName`, puis :

```
bubblewrap update --skipVersionUpgrade
gradlew bundleRelease          (depuis un dossier sans accent, ex. C:\AndroidOutils\build)
jarsigner -keystore <clé> app-release.aab bledway
```

- La clé d'importation (upload key) n'est **jamais** dans ce dépôt public : elle est sur le
  PC de l'éditeur, hors du dépôt (`BledWay-CLE-ANDROID`).
- `public/.well-known/assetlinks.json` relie le site à l'application (Digital Asset Links).
  Il doit contenir l'empreinte SHA-256 de la clé d'importation **et** celle de la clé de
  signature Google Play (Play Console › Intégrité de l'application › Signature de l'application),
  sinon une barre d'adresse s'affiche en haut de l'application.
