import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BellRing, Mail, PartyPopper, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  changedOnly,
  textsFor,
  type Texts,
} from "../../../supabase/functions/_shared/emailTexts";
import {
  INVITE_DEFAULTS,
  INVITE_LANGS,
  INVITE_LIMITS,
  inviteEmail,
  type InviteLang,
  type InviteRole,
} from "../../../supabase/functions/_shared/inviteTemplate";
import {
  ROLE_MAIL_DEFAULTS,
  ROLE_MAIL_LIMITS,
  roleEmail,
  type StaffRole,
} from "../../../supabase/functions/_shared/roleTemplate";
import {
  WELCOME_DEFAULTS,
  WELCOME_LIMITS,
  welcomeEmail,
} from "../../../supabase/functions/_shared/welcomeTemplate";
import {
  ALERT_DEFAULTS,
  ALERT_LIMITS,
  ALERT_SAMPLES,
  alertEmail,
  type AlertKind,
} from "../../../supabase/functions/_shared/alertTemplate";

const supabase = typedSupabase as unknown as SupabaseClient;

const LANG_LABELS: Record<InviteLang, string> = { fr: "Français", ar: "العربية", en: "English" };

type Field = { key: string; label: string; long?: boolean };
type Group = { title: string; hint?: string; fields: Field[]; variant?: string };
type Preview = { subject: string; html: string };
type Spec = {
  id: string;
  tab: string;
  tabHint: string;
  icon: typeof Mail;
  setting: string;
  title: string;
  description: ReactNode;
  langs: readonly InviteLang[];
  defaults: Record<string, Texts>;
  limits: Record<string, number>;
  groups: Group[];
  variants?: { label: string; options: [string, string][]; initial: string };
  render: (lang: InviteLang, variant: string, overrides: unknown, me: string) => Preview;
  test: { fn: string; body: (lang: InviteLang, variant: string, overrides: unknown) => object };
  testNote: string;
  savedToast: string;
};

const ROLE_OPTIONS: [string, string][] = [
  ["admin", "Administrateur"],
  ["editor", "Éditeur"],
  ["moderator", "Modérateur"],
];

const ALERT_LABELS: Record<AlertKind, string> = {
  cancel: "Traversée annulée",
  reschedule: "Nouvel horaire",
  deadline: "Rappel de préparation",
  opening: "Ouverture des ventes",
};
const alertGroup = (kind: AlertKind, voice: string): Group => ({
  title: ALERT_LABELS[kind],
  hint: voice,
  variant: kind,
  fields: [
    { key: `${kind}Emoji`, label: "Emoji devant l'objet" },
    { key: `${kind}Badge`, label: "Pastille" },
    { key: `${kind}Button`, label: "Bouton" },
    { key: `${kind}Why`, label: "Pourquoi cet e-mail", long: true },
    { key: `${kind}Stop`, label: "Pour ne plus le recevoir", long: true },
  ],
});

/** Les e-mails de BledWay modifiables ici, dans l'ordre où ils servent. */
const SPECS: Spec[] = [
  {
    id: "welcome",
    tab: "Bienvenue",
    tabHint: "À la création d'un compte",
    icon: PartyPopper,
    setting: "email_welcome",
    title: "Bienvenue sur BledWay",
    description: (
      <>
        Envoyé une seule fois, dès qu'un compte est confirmé. C'est la 504 qui parle, au tu.{" "}
        <b>{"{prenom}"}</b> devient le pseudo du voyageur ; sans pseudo, la formule « sans pseudo »
        est utilisée.
      </>
    ),
    langs: ["fr"],
    defaults: WELCOME_DEFAULTS,
    limits: WELCOME_LIMITS,
    groups: [
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
          { key: "hello", label: "Salutation" },
          { key: "helloAnon", label: "Salutation sans pseudo" },
          { key: "intro", label: "Présentation de la 504", long: true },
        ],
      },
      {
        title: "Les quatre étapes",
        fields: [
          { key: "step1Title", label: "Étape 1 : titre" },
          { key: "step1", label: "Étape 1 : texte", long: true },
          { key: "step1Link", label: "Étape 1 : lien vers les départs" },
          { key: "step2Title", label: "Étape 2 : titre" },
          { key: "step2", label: "Étape 2 : texte", long: true },
          { key: "step3Title", label: "Étape 3 : titre" },
          { key: "step3", label: "Étape 3 : texte", long: true },
          { key: "step4Title", label: "Étape 4 : titre" },
          { key: "step4", label: "Étape 4 : texte", long: true },
        ],
      },
      {
        title: "Bas du message",
        fields: [
          { key: "button", label: "Bouton" },
          { key: "booked", label: "Question « déjà réservé »" },
          { key: "bookedLink", label: "Lien vers la carte" },
          { key: "footer", label: "Pied de message", long: true },
        ],
      },
    ],
    render: (_lang, _variant, overrides, me) => welcomeEmail(me, overrides),
    test: { fn: "welcome-email", body: (_l, _v, texts) => ({ test: true, texts }) },
    testNote: "L'essai part à votre propre adresse, avec les textes affichés (même non enregistrés).",
    savedToast: "E-mail enregistré : les prochains nouveaux comptes le recevront.",
  },
  {
    id: "alerts",
    tab: "Alertes",
    tabHint: "Annulation, horaire, rappels, ventes",
    icon: BellRing,
    setting: "email_alerts",
    title: "Alertes de traversée et rappels",
    description: (
      <>
        Le titre et le texte de chaque alerte viennent du message lui-même (équipe, veille,
        rappels) : ici, vous modifiez l'habillage autour. Annulations et nouveaux horaires parlent
        au vous (l'équipe) ; rappels et ouvertures des ventes au tu (la 504).{" "}
        <b>{"{prenom}"}</b> devient le pseudo du voyageur.
      </>
    ),
    langs: ["fr"],
    defaults: ALERT_DEFAULTS,
    limits: ALERT_LIMITS,
    groups: [
      {
        title: "Salutations",
        fields: [
          { key: "helloVous", label: "Au vous (annulation, horaire)" },
          { key: "helloVousAnon", label: "Au vous, sans pseudo" },
          { key: "helloTu", label: "Au tu (rappel, ventes)" },
          { key: "helloTuAnon", label: "Au tu, sans pseudo" },
        ],
      },
      {
        title: "Mention en bas de chaque alerte",
        fields: [
          { key: "disclaimerVous", label: "Au vous", long: true },
          { key: "disclaimerTu", label: "Au tu", long: true },
        ],
      },
      alertGroup("cancel", "Message de l'équipe, au vous."),
      alertGroup("reschedule", "Message de l'équipe, au vous."),
      alertGroup("deadline", "Rappel de « Préparer mon voyage », au tu."),
      alertGroup("opening", "Alerte d'ouverture des ventes d'une compagnie, au tu."),
    ],
    variants: {
      label: "Aperçu de l'alerte",
      options: (Object.keys(ALERT_LABELS) as AlertKind[]).map((kind) => [kind, ALERT_LABELS[kind]]),
      initial: "cancel",
    },
    render: (_lang, variant, overrides, me) =>
      alertEmail(
        { template: variant as AlertKind, name: me, ...ALERT_SAMPLES[variant as AlertKind] },
        overrides,
      ),
    test: {
      fn: "alert-email",
      body: (_l, kind, texts) => ({ test: true, kind, texts }),
    },
    testNote:
      "L'essai part à votre propre adresse : un exemple de l'alerte affichée, avec les textes en cours.",
    savedToast: "E-mails enregistrés : les prochaines alertes partiront avec ces textes.",
  },
  {
    id: "invite",
    tab: "Invitation",
    tabHint: "Inviter un membre de l'équipe",
    icon: Mail,
    setting: "email_invite",
    title: "Invitation dans l'équipe",
    description: (
      <>
        Envoyé quand un administrateur invite un membre (Réglages → Utilisateurs), dans la langue
        choisie. <b>{"{inviteur}"}</b> devient le pseudo de l'administrateur qui invite. Le nom du
        rôle et sa description suivent le catalogue des rôles.
      </>
    ),
    langs: INVITE_LANGS,
    defaults: INVITE_DEFAULTS,
    limits: INVITE_LIMITS,
    groups: [
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
        variant: "none",
        fields: [
          { key: "subjectTraveller", label: "Objet" },
          { key: "titleTraveller", label: "Titre" },
          { key: "introTraveller", label: "Introduction", long: true },
          { key: "step3TitleTraveller", label: "Étape 3 : titre" },
          { key: "step3Traveller", label: "Étape 3 : texte" },
        ],
      },
    ],
    variants: {
      label: "Aperçu pour le rôle",
      options: [...ROLE_OPTIONS, ["none", "Voyageur (sans rôle)"]],
      initial: "moderator",
    },
    render: (lang, role, overrides, me) =>
      inviteEmail(lang, role as InviteRole, me, "https://www.bledway.com/auth?mode=reset", overrides),
    test: {
      fn: "team-invite-email",
      body: (lang, role, texts) => ({ test: true, lang, role, texts }),
    },
    testNote:
      "L'essai part à votre propre adresse, avec les textes affichés. Son bouton mène à l'admin, pas à une vraie invitation.",
    savedToast: "E-mail enregistré : les prochaines invitations partiront avec ce texte.",
  },
  {
    id: "role",
    tab: "Nouveau rôle",
    tabHint: "Quand un compte reçoit un rôle",
    icon: ShieldCheck,
    setting: "email_role",
    title: "Nouveau rôle dans l'équipe",
    description: (
      <>
        Envoyé quand un administrateur donne un rôle à un compte existant (Réglages → Utilisateurs,
        case « Le prévenir par e-mail »), dans la langue choisie. <b>{"{prenom}"}</b> devient le
        pseudo de la personne, <b>{"{inviteur}"}</b> celui de l'administrateur et{" "}
        <b>{"{role}"}</b> le nom du rôle.
      </>
    ),
    langs: INVITE_LANGS,
    defaults: ROLE_MAIL_DEFAULTS,
    limits: ROLE_MAIL_LIMITS,
    groups: [
      {
        title: "Boîte de réception",
        fields: [
          { key: "subject", label: "Objet" },
          { key: "preheader", label: "Phrase d'aperçu (après l'objet)" },
        ],
      },
      {
        title: "Message",
        fields: [
          { key: "tagline", label: "Slogan sous le logo" },
          { key: "title", label: "Titre" },
          { key: "hello", label: "Salutation" },
          { key: "helloAnon", label: "Salutation sans pseudo" },
          { key: "intro", label: "Annonce du rôle", long: true },
          { key: "next", label: "Après la description du rôle", long: true },
        ],
      },
      {
        title: "Bas du message",
        fields: [
          { key: "button", label: "Bouton" },
          { key: "footer", label: "Pied de message", long: true },
        ],
      },
    ],
    variants: { label: "Aperçu pour le rôle", options: ROLE_OPTIONS, initial: "editor" },
    render: (lang, role, overrides, me) => roleEmail(lang, role as StaffRole, "Samira", me, overrides),
    test: {
      fn: "team-invite-email",
      body: (lang, role, texts) => ({ test: true, kind: "role", lang, role, texts }),
    },
    testNote: "L'essai part à votre propre adresse, avec les textes affichés (même non enregistrés).",
    savedToast: "E-mail enregistré : les prochains rôles donnés seront annoncés avec ce texte.",
  },
];

/**
 * Rubrique « E-mails » : les e-mails de BledWay modifiables par l'équipe (bienvenue, alertes,
 * invitation, nouveau rôle). Un champ vidé reprend le texte d'origine ; seules les différences
 * sont enregistrées (bw_admin_settings), et chaque fonction d'envoi les relit.
 */
export function EmailsAdmin() {
  const [active, setActive] = useState(SPECS[0]!.id);
  return (
    <section className="space-y-4">
      <div
        role="tablist"
        aria-label="E-mails"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {SPECS.map((spec) => {
          const Icon = spec.icon;
          const selected = active === spec.id;
          return (
            <button
              key={spec.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(spec.id)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                selected
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{spec.tab}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {spec.tabHint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Tous les éditeurs restent montés : un brouillon survit au passage d'un e-mail à l'autre. */}
      {SPECS.map((spec) => (
        <div key={spec.id} hidden={active !== spec.id}>
          <EmailEditor spec={spec} />
        </div>
      ))}
    </section>
  );
}

function EmailEditor({ spec }: { spec: Spec }) {
  const client = useQueryClient();
  const { profile } = useAuth();
  const queryKey = ["admin-setting", spec.setting] as const;
  const saved = useQuery({
    queryKey,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_admin_settings")
        .select("value, updated_at")
        .eq("key", spec.setting)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { value: unknown; updated_at: string } | null) ?? null;
    },
  });
  const [lang, setLang] = useState<InviteLang>(spec.langs[0]!);
  const [variant, setVariant] = useState(spec.variants?.initial ?? "");
  const [draft, setDraft] = useState<Record<string, Texts> | null>(null);
  const texts = useMemo(
    () =>
      draft ??
      (Object.fromEntries(
        spec.langs.map((l) => [l, textsFor(spec.defaults[l]!, spec.limits, saved.data?.value, l)]),
      ) as Record<string, Texts>),
    [draft, saved.data?.value, spec],
  );
  const current = texts[lang]!;
  const defaults = spec.defaults[lang]!;
  const rtl = lang === "ar";
  const me = profile?.display_name?.trim() || "Youssouf";
  const overrides = useMemo(() => changedOnly(spec.defaults, texts), [spec.defaults, texts]);
  const preview = useMemo(
    () => spec.render(lang, variant, overrides, me),
    [spec, lang, variant, overrides, me],
  );

  const edit = (key: string, value: string) =>
    setDraft({ ...texts, [lang]: { ...current, [key]: value } });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_admin_settings").upsert({
        key: spec.setting,
        value: overrides,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey });
      setDraft(null);
      toast.success(spec.savedToast);
    },
    onError: (error: Error) => toast.error(`Enregistrement impossible : ${error.message}`),
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(spec.test.fn, {
        body: spec.test.body(lang, variant, overrides),
      });
      if (error || !(data as { sent?: boolean } | null)?.sent)
        throw new Error("l'envoi d'essai n'est pas parti. Réessayez dans un instant.");
      return (data as { to?: string }).to ?? "votre adresse";
    },
    onSuccess: (to) => toast.success(`Essai envoyé à ${to}.`),
    onError: (error: Error) => toast.error(`Essai impossible : ${error.message}`),
  });

  const keys = Object.keys(defaults);
  const changedHere = keys.some((key) => (current[key] ?? "").trim() !== defaults[key]);
  const changedCount = keys.filter(
    (key) => (current[key] ?? "").trim() && current[key]!.trim() !== defaults[key],
  ).length;
  const tooLong = keys.some((key) => (current[key] ?? "").length > spec.limits[key]!);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
          <spec.icon className="size-5 text-primary" aria-hidden /> {spec.title}
          {changedCount ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {changedCount} texte{changedCount > 1 ? "s" : ""} modifié{changedCount > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              Texte d'origine
            </span>
          )}
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {spec.description} Un champ vidé reprend le texte d'origine.
        </p>
        {saved.error ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
            Textes enregistrés illisibles : {saved.error.message}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {spec.langs.length > 1 ? (
            <div
              className="inline-flex overflow-hidden rounded-lg border border-border"
              role="tablist"
              aria-label="Langue"
            >
              {spec.langs.map((value) => (
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
          ) : (
            <span className="text-xs text-muted-foreground">Envoyé en français.</span>
          )}
          {spec.variants ? (
            <label className="flex items-center gap-2 text-sm">
              {spec.variants.label}
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="min-h-10 rounded-lg border bg-background px-3"
              >
                {spec.variants.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
        <div className="space-y-4">
          {spec.groups.map((group) => (
            <fieldset
              key={group.title}
              className="rounded-2xl border border-border bg-card p-4"
              onFocus={() => {
                if (group.variant && variant !== group.variant) setVariant(group.variant);
              }}
            >
              <legend className="px-1 text-sm font-bold">{group.title}</legend>
              {group.hint ? (
                <p className="mb-2 text-xs text-muted-foreground">{group.hint}</p>
              ) : null}
              <div className="grid gap-3">
                {group.fields.map((field) => {
                  const value = current[field.key] ?? "";
                  const limit = spec.limits[field.key]!;
                  const over = value.length > limit;
                  const common = {
                    value,
                    dir: rtl ? ("rtl" as const) : ("ltr" as const),
                    lang,
                    placeholder: defaults[field.key],
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
                          {value.length}/{limit}
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
              title={`Aperçu de l'e-mail : ${spec.title}`}
              srcDoc={preview.html}
              sandbox=""
              className="h-[560px] w-full bg-[#f4f1ea] lg:h-[640px]"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button disabled={!draft || tooLong || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              disabled={test.isPending || tooLong}
              onClick={() => test.mutate()}
            >
              <Send size={16} aria-hidden /> {test.isPending ? "Envoi…" : "M'envoyer un essai"}
            </Button>
            <Button
              variant="ghost"
              disabled={!changedHere}
              onClick={() => {
                const where = spec.langs.length > 1 ? ` en ${LANG_LABELS[lang]}` : "";
                if (
                  window.confirm(
                    `Reprendre le texte d'origine${where} ? Pensez à enregistrer ensuite.`,
                  )
                )
                  setDraft({ ...texts, [lang]: { ...defaults } });
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
          {tooLong ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              Un champ dépasse la longueur permise : raccourcissez-le pour enregistrer.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">{spec.testNote}</p>
        </div>
      </div>
    </div>
  );
}
