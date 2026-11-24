/** Quoi dire au voyageur quand l'appareil ne donne pas sa position : une réponse par cause et par navigateur. */
import { tr } from "@/lib/i18n/translate";

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
      tr("ui.libFerryLocationHelp.restezAppuyeSurLIcone"),
      tr("ui.libFerryLocationHelp.ouvrezAutorisationsPuisPositionEt"),
      tr("ui.libFerryLocationHelp.verifiezQueLaLocalisationDu"),
    ];
  if (installed && isIos(agent))
    return [
      tr("ui.libFerryLocationHelp.ouvrezReglagesConfidentialiteEtSecurite"),
      tr("ui.libFerryLocationHelp.dansLaListeOuvrezSites"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer"),
    ];
  if (/CriOS|FxiOS|EdgiOS/.test(agent))
    return [
      tr("ui.libFerryLocationHelp.ouvrezReglagesConfidentialiteEtSecurite"),
      tr("ui.libFerryLocationHelp.dansLaMemeListeOuvrez"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer2"),
    ];
  if (isIos(agent))
    return [
      tr("ui.libFerryLocationHelp.dansLaBarreDAdresse"),
      tr("ui.libFerryLocationHelp.touchezPositionEtChoisissezAutoriser"),
      tr("ui.libFerryLocationHelp.siRienNeChangeReglages"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer2"),
    ];
  if (/SamsungBrowser/.test(agent))
    return [
      tr("ui.libFerryLocationHelp.dansSamsungInternetTouchezLe"),
      tr("ui.libFerryLocationHelp.autorisezPositionPourBledway"),
      tr("ui.libFerryLocationHelp.siRienNeChangeParametres"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer3"),
    ];
  if (/Firefox/.test(agent) && isAndroid(agent))
    return [
      tr("ui.libFerryLocationHelp.dansFirefoxTouchezLeCadenas"),
      tr("ui.libFerryLocationHelp.siRienNeChangeParametres2"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer3"),
    ];
  if (isAndroid(agent))
    return [
      tr("ui.libFerryLocationHelp.dansLaBarreDAdresse2"),
      tr("ui.libFerryLocationHelp.siRienNeChangeMenu"),
      tr("ui.libFerryLocationHelp.siCaBloqueEncoreParametres"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer2"),
    ];
  return [
    tr("ui.libFerryLocationHelp.cliquezSurLIconeA"),
    tr("ui.libFerryLocationHelp.autorisezPositionPourCeSite"),
    tr("ui.libFerryLocationHelp.revenezIciEtCliquezSur"),
  ];
}

/** L'autorisation est bonne mais le téléphone ne trouve pas sa position. */
export function unavailableSteps(agent: string) {
  if (isAndroid(agent))
    return [
      tr("ui.libFerryLocationHelp.faitesGlisserLeHautDe"),
      tr("ui.libFerryLocationHelp.activezAussiLeWiFi"),
      tr("ui.libFerryLocationHelp.touchezReessayer"),
    ];
  if (isIos(agent))
    return [
      tr("ui.libFerryLocationHelp.ouvrezReglagesConfidentialiteEtSecurite"),
      tr("ui.libFerryLocationHelp.activezAussiLeWiFi"),
      tr("ui.libFerryLocationHelp.revenezIciEtTouchezReessayer2"),
    ];
  return [
    tr("ui.libFerryLocationHelp.activezLaLocalisationDeL"),
    tr("ui.libFerryLocationHelp.revenezIciEtCliquezSur"),
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
  tr("ui.libFerryLocationHelp.duPort", { v: /^[aeiouyhàâéèêîïôöû]/i.test(name) ? "d’" : "de ", name });

function nearestPort(here: Here, ports: Place[]) {
  return ports
    .map((port) => ({ port, km: kmFrom(here, port) }))
    .sort((a, b) => a.km - b.km)[0];
}

/** Une position réseau peut se tromper de plusieurs kilomètres : on le dit plutôt que d'accuser le voyageur. */
function roughHint(accuracyM: number | null) {
  return accuracyM !== null && accuracyM > 1_000
    ? tr("ui.libFerryLocationHelp.cettePositionEstApproximativeA", { formatKm: formatKm(accuracyM / 1_000) })
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
      ? tr("ui.libFerryLocationHelp.pres", { ofPort: ofPort(nearest.port.name) })
      : "";
  return tr("ui.libFerryLocationHelp.pourVousDevezEtreA", { action, limitKm, ofPort: ofPort(port.name), formatKm: formatKm(kmFrom(here, port)), nearby, roughHint: roughHint(accuracyM) });
}

/** Refus sur un navire : la règle du serveur accepte le port de la phase, ou la dernière position du navire. */
export function offSiteVesselMessage(input: {
  action: string;
  category?: string;
  here: Here;
  ports: Place[];
  accuracyM: number | null;
}) {
  const { action, category, here, ports, accuracyM } = input;
  const nearest = nearestPort(here, ports);
  const port =
    category === "boarding"
      ? tr("ui.libFerryLocationHelp.duPortDeDepart")
      : category === "disembarking"
        ? tr("ui.libFerryLocationHelp.duPortDArrivee")
        : tr("ui.libFerryLocationHelp.duPortDeDepartOu");
  const where = nearest
    ? tr("ui.libFerryLocationHelp.votrePositionIndiqueQueVous", { formatKm: formatKm(nearest.km), ofPort: ofPort(nearest.port.name) })
    : "";
  return tr("ui.libFerryLocationHelp.pourVousDevezEtrePres", { action, port, where, roughHint: roughHint(accuracyM) });
}

/** « Me localiser » : prévient tout de suite si le port le plus proche est trop loin pour signaler. */
export function farFromPortsNote(here: Here, ports: Place[], limitKm: number) {
  const nearest = nearestPort(here, ports);
  if (!nearest || nearest.km <= limitKm) return null;
  return tr("ui.libFerryLocationHelp.votrePositionIndiqueQueVous2", { formatKm: formatKm(nearest.km), ofPort: ofPort(nearest.port.name), limitKm });
}
