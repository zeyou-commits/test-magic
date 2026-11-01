# Remplacer les images de BledWay

## En 3 gestes

1. **Déposez** vos images de Gemini dans ce dossier, ou dans son sous-dossier (`avatars`, `statuts`, `persos`, `humeurs`, `pictos`, `reactions`).
2. **Double-cliquez** sur `REMPLACER-LES-IMAGES.bat`.
3. **Regardez** `apercu.html`, qui s'ouvre tout seul : chaque image y apparaît sur fond clair et sur fond sombre, aux tailles de l'application.

Vous pouvez faire quelques images à la fois et recommencer autant de fois que vous voulez. Celles déjà faites ne sont pas retraitées.

## Le nom du fichier

Le nom doit être exactement celui de l'image à remplacer. L'extension n'a pas d'importance (PNG ou JPG).

- Bien : `01_valise_pleine.png`, `avatar-3.jpg`, `lina.png`
- Ignoré et signalé : `01_valise_pleine (1).png`, `Gemini_Generated_Image.png`

Tous les noms sont dans `apercu.html` et dans `Prompts_Gemini_BledWay.md`. La voiture `voiture_504` ne se remplace pas.

## Le fond

Demandez à Gemini un **fond blanc pur et uni**. L'outil enlève le fond en partant des bords : les blancs à l'intérieur du dessin (yeux, barbe) sont conservés. Il vide aussi le blanc entre les anses du cabas, et enlève un faux damier de transparence et la petite étoile de Gemini en bas à droite.

Dans `apercu.html`, regardez toujours la bande sombre. Un morceau blanc en trop, ou un trou dans le dessin : redemandez l'image à Gemini, par exemple avec des anses sans espace vide.

## Revenir en arrière

Double-cliquez sur `REVENIR-EN-ARRIERE.bat`, puis tapez le nom d'une image, ou `toutes`. L'ancienne image revient, et votre image déposée part dans `_annulees`. Pour la réutiliser, remettez-la ici.

## Et après ?

Vos images sont prêtes sur votre ordinateur, mais le site public ne change pas tout seul. Quand l'aperçu vous plaît, dites à Claude : **« Enregistre mes images sur la branche images-remplacables et montre-moi le résultat. »** Rien n'est mis en ligne sans votre accord.

## Ce qui n'est jamais publié

Tout ce dossier reste hors du site. Vos dépôts, `_sauvegarde-originaux` et `_annulees` restent aussi hors de Git, donc uniquement sur cet ordinateur. Seules les images finales, dans `public/cabas`, partent avec le site.
