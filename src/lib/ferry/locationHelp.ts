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

type Place = { name: string; latitude: number; longitude: number };
type Here = [number, number];

export function distanceKm(a: Here, b: Here) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const kmFrom = (here: Here, place: Place) => distanceKm(here, [place.latitude, place.longitude]);
const formatKm = (km: number) =>
  km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`;
const ofPort = (name: string) =>
  `du port ${/^[aeiouyhàâéèêîïôöû]/i.test(name) ? "d’" : "de "}${name}`;

function nearestPort(here: Here, ports: Place[]) {
  return ports
    .map((port) => ({ port, km: kmFrom(here, port) }))
    .sort((a, b) => a.km - b.km)[0];
}

/** Une position réseau peut se tromper de plusieurs kilomètres : on le dit plutôt que d'accuser le voyageur. */
function roughHint(accuracyM: number | null) {
  return accuracyM !== null && accuracyM > 1_000
    ? ` Cette position est approximative, à environ ${formatKm(accuracyM / 1_000)} près : si elle est fausse, activez la position précise du téléphone, sortez à l’extérieur, puis réessayez.`
    : "";
}

/** Refus au port : ce qu'il faut, et où la position place le voyageur. Calculé sur l'appareil, rien n'est envoyé. */
export function offSitePortMessage(input: {
  action: string;
  port: Place;
  limitKm: number;
  here: Here;
  ports: Place[];
  accuracyM: number | null;
}) {
  const { action, port, limitKm, here, ports, accuracyM } = input;
  const nearest = nearestPort(here, ports);
  const nearby =
    nearest && nearest.port.name !== port.name && nearest.km <= 30
      ? `, près ${ofPort(nearest.port.name)}`
      : "";
  return `Pour ${action}, vous devez être à moins de ${limitKm} km ${ofPort(port.name)}. Votre position indique que vous êtes à ${formatKm(kmFrom(here, port))} de ce port${nearby}.${roughHint(accuracyM)}`;
}

/** Refus sur un navire : la règle du serveur accepte ses ports du moment ou sa dernière position. */
export function offSiteVesselMessage(input: {
  action: string;
  here: Here;
  ports: Place[];
  accuracyM: number | null;
}) {
  const { action, here, ports, accuracyM } = input;
  const nearest = nearestPort(here, ports);
  const where = nearest
    ? ` Votre position indique que vous êtes à ${formatKm(nearest.km)} ${ofPort(nearest.port.name)}, le plus proche.`
    : "";
  return `Pour ${action}, vous devez être près de ce navire, ou à moins de 3 km du port de départ ou d’arrivée de sa traversée.${where}${roughHint(accuracyM)}`;
}

/** « Me localiser » : prévient tout de suite si le port le plus proche est trop loin pour signaler. */
export function farFromPortsNote(here: Here, ports: Place[], limitKm: number) {
  const nearest = nearestPort(here, ports);
  if (!nearest || nearest.km <= limitKm) return null;
  return `Votre position indique que vous êtes à ${formatKm(nearest.km)} ${ofPort(nearest.port.name)}, le plus proche. Pour signaler une situation au port, vous devez être à moins de ${limitKm} km.`;
}
