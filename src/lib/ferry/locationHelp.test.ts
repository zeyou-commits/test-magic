import { describe, expect, it } from "vitest";
import { chromeIntentUrl, deniedSteps, isInAppBrowser, unavailableSteps } from "./locationHelp";

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
