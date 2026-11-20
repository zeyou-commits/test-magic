import { describe, expect, it } from "vitest";
import { changedOnly, rich } from "../../../supabase/functions/_shared/emailTexts";
import {
  WELCOME_DEFAULTS,
  welcomeEmail,
} from "../../../supabase/functions/_shared/welcomeTemplate";
import { ALERT_SAMPLES, alertEmail } from "../../../supabase/functions/_shared/alertTemplate";
import { roleEmail } from "../../../supabase/functions/_shared/roleTemplate";

describe("e-mails modifiables de BledWay", () => {
  it("bienvenue : texte d'origine, pseudo et salutation sans pseudo", () => {
    const mail = welcomeEmail("Samir");
    expect(mail.subject).toBe("Bienvenue sur BledWay 🚢");
    expect(mail.html).toContain("Salam Samir&nbsp;!");
    expect(mail.html).toContain("Moi, c’est la 504.");
    expect(welcomeEmail("").html).toContain("Salam et bienvenue&nbsp;!");
  });

  it("bienvenue : applique les textes de l'admin, échappe le HTML", () => {
    const mail = welcomeEmail("<b>x</b>", {
      fr: { button: "C'est parti", hello: "Ahlan {prenom}" },
    });
    expect(mail.html).toContain("C&#39;est parti");
    expect(mail.html).toContain("Ahlan &lt;b&gt;x&lt;/b&gt;");
    expect(mail.text).toContain("Ahlan <b>x</b>");
  });

  it("alertes : vous pour l'équipe, tu pour la 504, emoji dans l'objet", () => {
    const cancel = alertEmail({ template: "cancel", name: "Nadia", ...ALERT_SAMPLES.cancel });
    expect(cancel.subject.startsWith("⚠️ ")).toBe(true);
    expect(cancel.html).toContain("Bonjour Nadia,");
    expect(cancel.html).toContain("confirmez toujours");
    const deadline = alertEmail({ template: "deadline", name: "", ...ALERT_SAMPLES.deadline });
    expect(deadline.html).toContain("Salam&nbsp;!");
    expect(deadline.html).toContain("https://www.bledway.com/preparer-mon-voyage");
    const custom = alertEmail(
      { template: "opening", name: "", ...ALERT_SAMPLES.opening, url: "//evil.example" },
      { fr: { openingEmoji: "✅", openingBadge: "C'est ouvert" } },
    );
    expect(custom.subject).toBe(`✅ ${ALERT_SAMPLES.opening.title}`);
    expect(custom.html).toContain("C&#39;est ouvert");
    expect(custom.html).not.toContain("evil.example");
  });

  it("nouveau rôle : rôle, administrateur et lien vers l'espace équipe", () => {
    const mail = roleEmail("fr", "editor", "Samira", "Youssouf");
    expect(mail.subject).toBe("Vous êtes désormais Éditeur sur BledWay");
    expect(mail.html).toContain("<b>Youssouf</b> vient de vous donner le rôle <b>Éditeur</b>");
    expect(mail.html).toContain('href="https://www.bledway.com/admin"');
    const ar = roleEmail("ar", "moderator", "", "", { ar: { title: "أهلًا" } });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain("أهلًا");
    expect(ar.html).toContain("فريق BledWay");
  });

  it("n'enregistre que les champs modifiés, et rich() remplace toutes les variables", () => {
    expect(
      changedOnly(WELCOME_DEFAULTS, { fr: { ...WELCOME_DEFAULTS.fr, button: "Go", footer: " " } }),
    ).toEqual({ fr: { button: "Go" } });
    expect(rich("{a} et {a} ?", "fr", { a: "x" })).toBe("x et x&nbsp;?");
  });
});
