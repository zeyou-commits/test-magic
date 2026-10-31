/** Quoi dire au voyageur quand l'appareil ne donne pas sa position : une réponse par cause et par navigateur. */

/** Navigateur intégré à une appli (Facebook, Instagram, WhatsApp…) : la position y marche rarement. */
export const isInAppBrowser = (agent: string) =>
  /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|TikTok|musical_ly|Line\/|; wv\)/.test(agent);

export const isAndroid = (agent: string) => /Android/.test(agent);
const isIos = (agent: string) => /iPhone|iPad|iPod/.test(agent);

/** Ouvre la même page dans Chrome depuis un navigateur d'appli Android, sans recopier l'adresse. */
export function chromeIntentUrl(href: string) {
  const url = new URL(href);
  const fallback = encodeURIComponent(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

/** Réglages à ouvrir : une fois la position refusée, seul le voyageur peut la rétablir. */
export function deniedSteps(agent: string, installed: boolean) {
  // Application installée : il n'y a pas de barre d'adresse, tout passe par les réglages du téléphone.
  if (installed && isAndroid(agent))
    return [
      "Restez appuyé sur l’icône BledWay de votre écran d’accueil, puis touchez « Infos sur l’application » (ⓘ).",
      "Ouvrez « Autorisations », puis « Position », et choisissez « Autoriser ». Si vous ne la trouvez pas, faites de même pour votre navigateur (Chrome).",
      "Vérifiez que la localisation du téléphone est activée, revenez ici et touchez « Réessayer ».",
    ];
  if (installed && isIos(agent))
    return [
      "Ouvrez Réglages › Confidentialité et sécurité › Service de localisation, et activez-le.",
      "Dans la liste, ouvrez « Sites web Safari » et choisissez « Lorsque l’app est active ».",
      "Revenez ici et touchez « Réessayer ». Si besoin, fermez puis rouvrez BledWay.",
    ];
  if (/CriOS|FxiOS|EdgiOS/.test(agent))
    return [
      "Ouvrez Réglages › Confidentialité et sécurité › Service de localisation, et activez-le.",
      "Dans la même liste, ouvrez votre navigateur et choisissez « Lorsque l’app est active ».",
      "Revenez ici et touchez « Réessayer ».",
    ];
  if (isIos(agent))
    return [
      "Dans la barre d’adresse de Safari, touchez l’icône « aA » ou ≡, puis « Réglages du site web ».",
      "Touchez « Position » et choisissez « Autoriser ».",
      "Si rien ne change : Réglages › Confidentialité et sécurité › Service de localisation. Activez-le, puis ouvrez « Sites web Safari » et choisissez « Lorsque l’app est active ».",
      "Revenez ici et touchez « Réessayer ».",
    ];
  if (/SamsungBrowser/.test(agent))
    return [
      "Dans Samsung Internet, touchez le menu ≡, puis « Paramètres », et ouvrez les autorisations des sites.",
      "Autorisez « Position » pour BledWay.",
      "Si rien ne change : Paramètres du téléphone › Applications › Samsung Internet › Autorisations › Position › Autoriser.",
      "Revenez ici et touchez « Réessayer ». Sinon, ouvrez BledWay dans Chrome.",
    ];
  if (/Firefox/.test(agent) && isAndroid(agent))
    return [
      "Dans Firefox, touchez le cadenas à gauche de l’adresse et autorisez « Position ».",
      "Si rien ne change : Paramètres du téléphone › Applications › Firefox › Autorisations › Position › Autoriser.",
      "Revenez ici et touchez « Réessayer ». Sinon, ouvrez BledWay dans Chrome.",
    ];
  if (isAndroid(agent))
    return [
      "Dans la barre d’adresse, touchez l’icône à gauche de l’adresse, puis « Autorisations » ou « Paramètres du site ». Mettez « Position » sur « Autoriser », ou touchez « Réinitialiser les autorisations ».",
      "Si rien ne change : menu ⋮ › « Paramètres » › « Paramètres des sites » › « Position ». Vérifiez que la position n’est pas bloquée pour tous les sites, et retirez BledWay de la liste « Bloqués ».",
      "Si ça bloque encore : Paramètres du téléphone › Applications › Chrome › Autorisations › Position › Autoriser, et activez la localisation du téléphone.",
      "Revenez ici et touchez « Réessayer ».",
    ];
  return [
    "Cliquez sur l’icône à gauche de l’adresse, dans la barre du navigateur.",
    "Autorisez « Position » pour ce site, puis rechargez la page si le navigateur le demande.",
    "Revenez ici et cliquez sur « Réessayer ».",
  ];
}

/** L'autorisation est bonne mais le téléphone ne trouve pas sa position. */
export function unavailableSteps(agent: string) {
  if (isAndroid(agent))
    return [
      "Faites glisser le haut de l’écran vers le bas et activez « Position » ou « Localisation ».",
      "Activez aussi le Wi-Fi ou les données mobiles, et sortez si possible à l’extérieur.",
      "Touchez « Réessayer ».",
    ];
  if (isIos(agent))
    return [
      "Ouvrez Réglages › Confidentialité et sécurité › Service de localisation, et activez-le.",
      "Activez aussi le Wi-Fi ou les données mobiles, et sortez si possible à l’extérieur.",
      "Revenez ici et touchez « Réessayer ».",
    ];
  return [
    "Activez la localisation de l’ordinateur : Paramètres › Confidentialité › Localisation.",
    "Revenez ici et cliquez sur « Réessayer ».",
  ];
}
