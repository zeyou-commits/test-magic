import { describe, expect, it } from "vitest";
import {
  INVITE_DEFAULTS,
  inviteEmail,
  inviteOverridesOnly,
  inviteTexts,
} from "../../../supabase/functions/_shared/inviteTemplate";

const LINK = "https://projet.supabase.co/auth/v1/verify?token=t&type=invite";

describe("modèle de l'e-mail d'invitation", () => {
  it("prend le texte d'origine sans modification de l'admin", () => {
    const mail = inviteEmail("fr", "moderator", "Samir", LINK);
    expect(mail.subject).toBe("Samir vous invite dans l'équipe BledWay");
    expect(mail.html).toContain("<b>Samir</b> vous invite");
    expect(mail.html).toContain("Modérateur");
    expect(mail.html).toContain("Bienvenue dans l&#39;équipe&nbsp;!");
  });

  it("applique les textes de l'admin et garde l'origine pour les champs vides", () => {
    const overrides = { fr: { button: "Rejoindre l'équipe", title: "  " } };
    const mail = inviteEmail("fr", "editor", "Samir", LINK, overrides);
    expect(mail.html).toContain("Rejoindre l&#39;équipe");
    expect(mail.html).toContain("Bienvenue dans l&#39;équipe");
    expect(inviteTexts("ar", overrides).button).toBe(INVITE_DEFAULTS.ar.button);
  });

  it("utilise la version voyageur quand l'invité n'a pas de rôle", () => {
    const mail = inviteEmail("en", "none", "", LINK, { en: { subjectTraveller: "Join us" } });
    expect(mail.subject).toBe("Join us");
    expect(mail.html).toContain("The BledWay team");
    expect(mail.html).toContain("Plan your crossing");
  });

  it("échappe le HTML saisi et ignore une valeur inattendue en base", () => {
    const mail = inviteEmail("fr", "admin", "<i>x</i>", LINK, {
      fr: { footer: "<script>alert(1)</script>", button: 42 },
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&lt;i&gt;x&lt;/i&gt;");
    expect(mail.html).toContain("Accepter l&#39;invitation");
    expect(inviteEmail("fr", "admin", "A", LINK, "n'importe quoi").subject).toContain("A vous");
  });

  it("refuse un texte trop long et retombe sur l'origine", () => {
    const texts = inviteTexts("fr", { fr: { button: "x".repeat(61) } });
    expect(texts.button).toBe(INVITE_DEFAULTS.fr.button);
  });

  it("n'enregistre que ce qui diffère de l'origine", () => {
    const all = {
      fr: { ...INVITE_DEFAULTS.fr, button: "Rejoindre" },
      ar: { ...INVITE_DEFAULTS.ar },
      en: { ...INVITE_DEFAULTS.en, title: "" },
    };
    expect(inviteOverridesOnly(all)).toEqual({ fr: { button: "Rejoindre" } });
  });
});
