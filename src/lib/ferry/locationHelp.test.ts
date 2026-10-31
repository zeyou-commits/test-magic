import { describe, expect, it } from "vitest";
import {
  chromeIntentUrl,
  deniedSteps,
  farFromPortsNote,
  isInAppBrowser,
  offSitePortMessage,
  offSiteVesselMessage,
  unavailableSteps,
} from "./locationHelp";

const chromeAndroid =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36";
const safariIphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const chromeIphone = safariIphone.replace("Version/18.0", "CriOS/156.0.0.0");
const samsung = chromeAndroid.replace("Chrome/156", "SamsungBrowser/28.0 Chrome/156");
const firefoxAndroid = "Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0";
const facebook = `${chromeAndroid} [FB_IAB/FB4A;FBAV/500.0.0.0;]`;

describe("aide à la position", () => {
  it("donne le bon chemin selon le navigateur", () => {
    expect(deniedSteps(chromeAndroid, false).join(" ")).toContain("Paramètres des sites");
    expect(deniedSteps(safariIphone, false).join(" ")).toContain("Réglages du site web");
    expect(deniedSteps(chromeIphone, false).join(" ")).not.toContain("aA");
    expect(deniedSteps(samsung, false).join(" ")).toContain("Samsung Internet");
    expect(deniedSteps(firefoxAndroid, false).join(" ")).toContain("Firefox");
  });

  it("une application installée passe par les réglages du téléphone", () => {
    expect(deniedSteps(chromeAndroid, true)[0]).toContain("icône BledWay");
    expect(deniedSteps(safariIphone, true)[0]).toContain("Service de localisation");
  });

  it("un téléphone sans localisation reçoit la consigne de l'activer", () => {
    expect(unavailableSteps(chromeAndroid)[0]).toContain("Position");
    expect(unavailableSteps(safariIphone)[0]).toContain("Service de localisation");
  });

  it("reconnaît un navigateur d'appli et rouvre la même page dans Chrome", () => {
    expect(isInAppBrowser(facebook)).toBe(true);
    expect(isInAppBrowser(chromeAndroid)).toBe(false);
    const link = chromeIntentUrl("https://bledway.test/port/alger?tab=1");
    expect(link).toContain("intent://bledway.test/port/alger?tab=1#Intent;scheme=https");
    expect(link).toContain("package=com.android.chrome");
    expect(link).toContain("S.browser_fallback_url=https%3A%2F%2Fbledway.test");
  });
});

describe("refus parce que le voyageur n'est pas sur place", () => {
  const marseille = { name: "Marseille", latitude: 43.3, longitude: 5.36 };
  const alger = { name: "Alger", latitude: 36.77, longitude: 3.06 };
  const sete = { name: "Sète", latitude: 43.4, longitude: 3.7 };
  const ports = [marseille, alger, sete];
  const base = { action: "signaler « Accès au port »", limitKm: 3, ports, accuracyM: 20 };

  it("dit ce qu'il faut et où la position place le voyageur", () => {
    const message = offSitePortMessage({ ...base, port: alger, here: [43.3, 5.36] });
    expect(message).toContain(
      "Pour signaler « Accès au port », vous devez être à moins de 3 km du port d’Alger.",
    );
    expect(message).toMatch(
      /Votre position indique que vous êtes à \d+ km de ce port, près du port de Marseille\./,
    );
  });

  it("une position approximative est signalée", () => {
    const message = offSitePortMessage({
      ...base,
      port: marseille,
      here: [43.34, 5.36],
      accuracyM: 4_500,
    });
    expect(message).toContain("à 4,4 km de ce port.");
    expect(message).toContain("à environ 4,5 km près");
  });

  it("sur un navire, donne le port le plus proche", () => {
    const message = offSiteVesselMessage({
      action: "signaler « Retard »",
      here: [43.4, 3.7],
      ports,
      accuracyM: null,
    });
    expect(message).toContain("près de ce navire");
    expect(message).toContain("à 0,0 km du port de Sète, le plus proche");
    expect(message).toContain("du port de départ ou d’arrivée de sa traversée");
  });

  it("l'embarquement et le débarquement nomment le bon port", () => {
    const common = { action: "signaler", here: [43.4, 3.7] as [number, number], ports, accuracyM: null };
    expect(offSiteVesselMessage({ ...common, category: "boarding" })).toContain(
      "à moins de 3 km du port de départ de sa traversée",
    );
    expect(offSiteVesselMessage({ ...common, category: "disembarking" })).toContain(
      "à moins de 3 km du port d’arrivée de sa traversée",
    );
  });

  it("« Me localiser » ne prévient que si le port est trop loin", () => {
    expect(farFromPortsNote([43.3, 5.36], ports, 3)).toBeNull();
    expect(farFromPortsNote([48.85, 2.35], ports, 3)).toMatch(
      /à \d+ km du port de Sète, le plus proche/,
    );
  });
});
