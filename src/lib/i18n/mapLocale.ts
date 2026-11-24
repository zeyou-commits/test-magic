import { tr } from "./translate";

/**
 * Libellés des boutons de MapLibre (zoom, attribution, plein écran) dans la langue affichée.
 * En français, ce sont les libellés d'origine de MapLibre, inchangés.
 */
export function mapLocale(): Record<string, string> {
  return {
    "NavigationControl.ZoomIn": tr("ui.libMapLocale.zoomIn"),
    "NavigationControl.ZoomOut": tr("ui.libMapLocale.zoomOut"),
    "NavigationControl.ResetBearing": tr("ui.libMapLocale.resetBearing"),
    "AttributionControl.ToggleAttribution": tr("ui.libMapLocale.toggleAttribution"),
    "AttributionControl.MapFeedback": tr("ui.libMapLocale.mapFeedback"),
    "FullscreenControl.Enter": tr("ui.libMapLocale.fullscreenEnter"),
    "FullscreenControl.Exit": tr("ui.libMapLocale.fullscreenExit"),
    "GeolocateControl.FindMyLocation": tr("ui.libMapLocale.findMyLocation"),
    "GeolocateControl.LocationNotAvailable": tr("ui.libMapLocale.locationNotAvailable"),
  };
}
