import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Mail, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  INVITE_DEFAULTS,
  INVITE_LANGS,
  INVITE_LIMITS,
  inviteEmail,
  inviteOverridesOnly,
  inviteTexts,
  type InviteLang,
  type InviteRole,
  type InviteTextKey,
  type InviteTexts,
} from "../../../supabase/functions/_shared/inviteTemplate";

const supabase = typedSupabase as unknown as SupabaseClient;
const SETTING = "email_invite";
const QUERY_KEY = ["admin-setting", SETTING] as const;

const LANG_LABELS: Record<InviteLang, string> = { fr: "Français", ar: "العربية", en: "English" };
const ROLE_LABELS: Record<InviteRole, string> = {
  admin: "Administrateur",
  editor: "Éditeur",
  moderator: "Modérateur",
  none: "Voyageur",
};

type Field = { key: InviteTextKey; label: string; long?: boolean };
/** Les champs, rangés comme ils apparaissent dans l'e-mail. Voyageur = invitation sans rôle. */
const GROUPS: { title: string; hint?: string; fields: Field[]; traveller?: boolean }[] = [
  {
    title: "Boîte de réception",
    fields: [
      { key: "subject", label: "Objet" },
      { key: "preheader", label: "Phrase d'aperçu (après l'objet)" },
    ],
  },
  {
    title: "Haut du message",
    fields: [
      { key: "tagline", label: "Slogan sous le logo" },
      { key: "title", label: "Titre" },
      { key: "intro", label: "Introduction", long: true },
    ],
  },
  {
    title: "Les trois étapes",
    fields: [
      { key: "step1Title", label: "Étape 1 : titre" },
      { key: "step1", label: "Étape 1 : texte" },
      { key: "step2Title", label: "Étape 2 : titre" },
      { key: "step2", label: "Étape 2 : texte" },
      { key: "step3Title", label: "Étape 3 : titre" },
      { key: "step3", label: "Étape 3 : texte" },
    ],
  },
  {
    title: "Bas du message",
    fields: [
      { key: "button", label: "Bouton" },
      { key: "expiry", label: "Validité du lien", long: true },
      { key: "footer", label: "Pied de message", long: true },
    ],
  },
  {
    title: "Invitation sans rôle (voyageur)",
    hint: "Remplace l'objet, le titre, l'introduction et l'étape 3 quand l'invité n'a pas de rôle.",
    traveller: true,
    fields: [
      { key: "subjectTraveller", label: "Objet" },
      { key: "titleTraveller", label: "Titre" },
      { key: "introTraveller", label: "Introduction", long: true },
      { key: "step3TitleTraveller", label: "Étape 3 : titre" },
      { key: "step3Traveller", label: "Étape 3 : texte" },
    ],
  },
];

const allTexts = (saved: unknown) =>
  Object.fromEntries(INVITE_LANGS.map((lang) => [lang, inviteTexts(lang, saved)])) as Record<
    InviteLang,
    InviteTexts
  >;

/**
 * Rubrique « E-mails » : les e-mails de BledWay modifiables par l'équipe. Pour l'instant,
 * l'invitation dans l'équipe (envoyée depuis Réglages → Utilisateurs), en trois langues.
 * Un champ vidé reprend le texte d'origine ; {inviteur} devient le pseudo de l'administrateur.
 */
export function EmailsAdmin() {
  const client = useQueryClient();
  const { profile } = useAuth();
  const saved = useQuery({
    queryKey: QUERY_KEY,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_admin_settings")
        .select("value, updated_at")
        .eq("key", SETTING)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { value: unknown; updated_at: string } | null) ?? null;
    },
  });
  const [lang, setLang] = useState<InviteLang>("fr");
  const [role, setRole] = useState<InviteRole>("moderator");
  const [draft, setDraft] = useState<Record<InviteLang, InviteTexts> | null>(null);
  const texts = draft ?? allTexts(saved.data?.value);
  const current = texts[lang];
  const rtl = lang === "ar";
  const inviter = profile?.display_name?.trim() || "Youssouf";

  const preview = useMemo(
    () =>
      inviteEmail(
        lang,
        role,
        inviter,
        "https://www.bledway.com/auth?mode=reset",
        inviteOverridesOnly(texts),
      ),
    [lang, role, inviter, texts],
  );

  const edit = (key: InviteTextKey, value: string) =>
    setDraft({ ...texts, [lang]: { ...current, [key]: value } });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_admin_settings").upsert({
        key: SETTING,
        value: inviteOverridesOnly(texts),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEY });
      setDraft(null);
      toast.success("E-mail enregistré : les prochaines invitations partiront avec ce texte.");
    },
    onError: (error: Error) => toast.error(`Enregistrement impossible : ${error.message}`),
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("team-invite-email", {
        body: { test: true, lang, role, texts: inviteOverridesOnly(texts) },
      });
      if (error || !(data as { sent?: boolean } | null)?.sent)
        throw new Error("l'envoi d'essai n'est pas parti. Réessayez dans un instant.");
      return (data as { to?: string }).to ?? "votre adresse";
    },
    onSuccess: (to) => toast.success(`Essai envoyé à ${to}.`),
    onError: (error: Error) => toast.error(`Essai impossible : ${error.message}`),
  });

  const changedHere = (Object.keys(current) as InviteTextKey[]).some(
    (key) => current[key].trim() !== INVITE_DEFAULTS[lang][key],
  );
  const tooLong = (Object.keys(current) as InviteTextKey[]).filter(
    (key) => current[key].length > INVITE_LIMITS[key],
  );

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Mail className="size-5 text-primary" aria-hidden /> Invitation dans l'équipe
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Envoyé quand un administrateur invite un membre (Réglages → Utilisateurs), dans la langue
          choisie. <b>{"{inviteur}"}</b> est remplacé par le pseudo de l'administrateur qui invite.
          Un champ vidé reprend le texte d'origine. Le nom du rôle et sa description suivent le
          catalogue des rôles.
        </p>
        {saved.error ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
            Textes enregistrés illisibles : {saved.error.message}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="inline-flex overflow-hidden rounded-lg border border-border"
            role="tablist"
          >
            {INVITE_LANGS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                lang={value}
                aria-selected={lang === value}
                onClick={() => setLang(value)}
                className={`min-h-10 border-l border-border px-4 text-sm font-semibold first:border-l-0 ${
                  lang === value ? "bg-foreground text-background" : "bg-white"
                }`}
              >
                {LANG_LABELS[value]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            Aperçu pour le rôle
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              className="min-h-10 rounded-lg border bg-background px-3"
            >
              {(Object.keys(ROLE_LABELS) as InviteRole[]).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <fieldset
              key={group.title}
              className="rounded-2xl border border-border bg-card p-4"
              onFocus={() => {
                if (group.traveller && role !== "none") setRole("none");
              }}
            >
              <legend className="px-1 text-sm font-bold">{group.title}</legend>
              {group.hint ? (
                <p className="mb-2 text-xs text-muted-foreground">{group.hint}</p>
              ) : null}
              <div className="grid gap-3">
                {group.fields.map((field) => {
                  const value = current[field.key];
                  const over = value.length > INVITE_LIMITS[field.key];
                  const common = {
                    value,
                    dir: rtl ? ("rtl" as const) : ("ltr" as const),
                    lang,
                    placeholder: INVITE_DEFAULTS[lang][field.key],
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      edit(field.key, e.target.value),
                    "aria-invalid": over || undefined,
                  };
                  return (
                    <label key={field.key} className="grid gap-1 text-sm">
                      <span className="flex items-baseline justify-between gap-2 font-semibold">
                        {field.label}
                        <span
                          className={`text-xs font-normal ${over ? "text-red-700" : "text-muted-foreground"}`}
                        >
                          {value.length}/{INVITE_LIMITS[field.key]}
                        </span>
                      </span>
                      {field.long ? <Textarea rows={3} {...common} /> : <Input {...common} />}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Objet : </span>
              <b dir={rtl ? "rtl" : "ltr"}>{preview.subject}</b>
            </div>
            <iframe
              title="Aperçu de l'e-mail d'invitation"
              srcDoc={preview.html}
              sandbox=""
              className="h-[640px] w-full bg-[#f4f1ea]"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={!draft || tooLong.length > 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              disabled={test.isPending || tooLong.length > 0}
              onClick={() => test.mutate()}
            >
              <Send size={16} aria-hidden /> {test.isPending ? "Envoi…" : "M'envoyer un essai"}
            </Button>
            <Button
              variant="ghost"
              disabled={!changedHere}
              onClick={() => {
                if (
                  window.confirm(
                    `Reprendre le texte d'origine en ${LANG_LABELS[lang]} ? Pensez à enregistrer ensuite.`,
                  )
                )
                  setDraft({ ...texts, [lang]: { ...INVITE_DEFAULTS[lang] } });
              }}
            >
              <RotateCcw size={16} aria-hidden /> Texte d'origine
            </Button>
            {draft ? (
              <span className="text-xs font-semibold text-amber-800">
                Modifications non enregistrées
              </span>
            ) : saved.data?.updated_at ? (
              <span className="text-xs text-muted-foreground">
                Enregistré le{" "}
                {new Date(saved.data.updated_at).toLocaleString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
          {tooLong.length ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              Un champ dépasse la longueur permise : raccourcissez-le pour enregistrer.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            L'essai part à votre propre adresse, avec les textes affichés (même non enregistrés).
            Son bouton mène à l'admin, pas à une vraie invitation.
          </p>
        </div>
      </div>
    </section>
  );
}
