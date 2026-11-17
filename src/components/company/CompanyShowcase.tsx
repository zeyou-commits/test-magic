import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ClipboardList,
  Images,
  Map as MapIcon,
  Megaphone,
  MessageSquareReply,
  MessagesSquare,
  Pause,
  Play,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { companiesQuery } from "@/lib/ferry/queries";
import {
  accessRequestErrors,
  emptyAccessRequest,
  sendAccessRequest,
  type AccessRequestForm,
} from "@/lib/company/accessRequest";

/**
 * Page d'accueil professionnelle de l'espace compagnie, pour une personne sans accès :
 * ce que vivent les passagers sur BledWay, la place de la compagnie, les règles, et deux portes
 * (« J'ai une invitation », « Demander un accès »). Captures : vraies pages de l'appli.
 */
const SIGN_IN = "/auth?next=%2Fespace-compagnie";

const PASSENGERS: { icon: LucideIcon; title: string; text: string; image: string; alt: string }[] =
  [
    {
      icon: ClipboardList,
      title: "Préparer",
      text: "Un guide pas à pas : papiers voyageur par voyageur, calendrier à rebours, budget et rappels.",
      image: "/images/espace-compagnie/preparer.webp",
      alt: "Écran « Préparer mon voyage » de BledWay sur téléphone",
    },
    {
      icon: Ticket,
      title: "Réserver",
      text: "Les départs de toutes les compagnies au même endroit, puis la réservation chez la compagnie ou le distributeur indiqué.",
      image: "/images/espace-compagnie/horaires.webp",
      alt: "Liste des départs et arrivées des ferries sur BledWay",
    },
    {
      icon: MapIcon,
      title: "Suivre",
      text: "La carte des navires et des ports, les changements d'horaire et les alertes sur la traversée suivie.",
      image: "/images/espace-compagnie/suivre.webp",
      alt: "Carte BledWay avec les navires en Méditerranée",
    },
    {
      icon: MessagesSquare,
      title: "Échanger",
      text: "Un salon par traversée, des signalements faits sur place et des avis sur les navires.",
      image: "/images/espace-compagnie/salons.webp",
      alt: "Choix du salon de discussion d'une traversée sur BledWay",
    },
  ];

const PLACE: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarClock,
    title: "Des horaires justes",
    text: "Signalez un retard, un changement de navire ou une annulation. Après relecture, la traversée est mise à jour et les passagers qui la suivent sont prévenus.",
  },
  {
    icon: Megaphone,
    title: "Vos annonces, signées",
    text: "Envoyez un message aux passagers d'une traversée, signé du nom de votre compagnie.",
  },
  {
    icon: MessageSquareReply,
    title: "Votre réponse, à côté de l'avis",
    text: "Répondez aux avis et aux signalements : votre réponse s'affiche juste en dessous, là où les voyageurs la lisent.",
  },
  {
    icon: Images,
    title: "Votre fiche et vos photos",
    text: "Proposez des corrections de votre fiche et des photos informatives de vos navires.",
  },
];

const RULES: { icon: LucideIcon; text: string }[] = [
  { icon: BadgeCheck, text: "Tout est relu par l'équipe BledWay avant publication." },
  { icon: Scale, text: "Aucun avis n'est masqué, noté ni effacé par une compagnie." },
  {
    icon: UserCheck,
    text: "Des comptes nominatifs : chaque action est attribuée à une personne de votre équipe.",
  },
  {
    icon: ShieldCheck,
    text: "Pour une annonce, vous voyez le nombre de destinataires, jamais leur liste.",
  },
];

function Phone({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[15rem] overflow-hidden rounded-[1.75rem] border-[6px] border-[#0c1f33] bg-[#0c1f33] shadow-[0_18px_40px_-18px_rgb(12_31_51/0.55)]">
      <img
        src={src}
        alt={alt}
        width={390}
        height={780}
        loading={eager ? "eager" : "lazy"}
        className="block aspect-[1/2] w-full rounded-[1.3rem] object-cover object-top"
      />
    </div>
  );
}

/** Durée d'affichage de chaque écran dans le téléphone de l'accroche. */
const SLIDE_MS = 4500;

/**
 * Téléphone de l'accroche : les 4 écrans défilent en fondu, avec un onglet par écran et une
 * barre de progression. La barre pilote le défilement : elle s'arrête au survol et
 * avec le bouton pause, et n'avance pas si le système demande moins d'animations.
 */
function HeroPhone() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const paused = hovered || stopped;
  const current = PASSENGERS[active]!;
  const next = () => setActive((i) => (i + 1) % PASSENGERS.length);
  return (
    <div
      className="mx-auto grid w-full max-w-[19rem] gap-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <style>{`@keyframes bw-hero-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.bw-hero-fill{animation:none!important;transform:scaleX(1)}.bw-hero-shot{transition:none!important}}`}</style>
      <div className="overflow-hidden rounded-[1.75rem] border-[6px] border-[#0c1f33] bg-[#0c1f33] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/10">
        <div className="relative aspect-[1/2] w-full overflow-hidden rounded-[1.3rem] bg-white">
          {PASSENGERS.map((item, i) => (
            <img
              key={item.image}
              src={item.image}
              alt={i === active ? item.alt : ""}
              aria-hidden={i === active ? undefined : true}
              width={390}
              height={780}
              loading="eager"
              className={`bw-hero-shot absolute inset-0 size-full object-cover object-top transition-[opacity,transform] duration-700 ease-out ${
                i === active ? "scale-100 opacity-100" : "scale-[1.04] opacity-0"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="grid flex-1 grid-cols-4 gap-1.5"
          role="group"
          aria-label="Écrans de l'appli"
        >
          {PASSENGERS.map((item, i) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={`group grid gap-1.5 rounded-lg px-0.5 pb-1 pt-1.5 text-[11.5px] font-bold transition-colors ${
                i === active ? "text-white" : "text-white/55 hover:text-white/85"
              }`}
            >
              <span className="flex flex-col items-center gap-1 leading-none">
                <item.icon className="size-4" aria-hidden />
                {item.title}
              </span>
              <span className="h-[3px] overflow-hidden rounded-full bg-white/20">
                {i === active ? (
                  <span
                    key={`${active}-${i}`}
                    className="bw-hero-fill block h-full origin-left rounded-full bg-[#f6c445]"
                    style={{
                      animation: `bw-hero-fill ${SLIDE_MS}ms linear forwards`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                    onAnimationEnd={next}
                  />
                ) : i < active ? (
                  <span className="block h-full rounded-full bg-white/45" />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStopped((s) => !s)}
          className="grid size-7 flex-none place-items-center rounded-full border border-white/25 text-white/80 hover:bg-white/10"
          aria-label={stopped ? "Reprendre le défilement" : "Mettre le défilement en pause"}
        >
          {stopped ? (
            <Play className="size-3" aria-hidden />
          ) : (
            <Pause className="size-3" aria-hidden />
          )}
        </button>
      </div>
      <p className="min-h-[3.75rem] text-center text-[13px] leading-relaxed text-white/75">
        {current.text}
      </p>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 md:px-8 md:py-16">
      <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#2f8fe0]">{eyebrow}</p>
      <h2 className="mt-2 max-w-3xl text-2xl font-bold leading-tight text-[#0c1f33] md:text-3xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[#4a5a6a]">{lead}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function CompanyShowcase({
  signedInEmail,
}: {
  /** Adresse du compte connecté sans accès ; absent si personne n'est connecté. */
  signedInEmail?: string | null;
}) {
  const signedIn = signedInEmail !== undefined;
  return (
    <div className="min-h-dvh bg-[#f5f7fa] text-[#0c1f33]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0c1f33] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5"
            aria-label="BledWay, retour au site"
          >
            <img
              src="/favicon-192.png"
              alt=""
              width={40}
              height={40}
              className="size-10 flex-none rounded-xl shadow-[0_0_0_1px_rgb(255_255_255/0.22),0_4px_14px_rgb(0_0_0/0.25)]"
            />
            <span className="grid leading-tight">
              <strong className="text-base font-extrabold">BledWay</strong>
              <span className="text-[10.5px] font-extrabold uppercase tracking-[.09em] text-[#f6c445]">
                Espace compagnie
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link
              to="/"
              className="hidden rounded-lg px-3 py-2 text-white/80 hover:text-white sm:inline-flex"
            >
              Retour au site
            </Link>
            {signedIn ? null : (
              <a
                href={SIGN_IN}
                className="inline-flex rounded-lg border border-white/30 px-3 py-2 hover:bg-white/10"
              >
                Se connecter
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        {signedIn ? (
          <div className="border-b border-[#f6c445]/50 bg-[#fff8e1]">
            <p className="mx-auto max-w-6xl px-4 py-3 text-sm leading-relaxed md:px-8">
              Votre compte{signedInEmail ? ` (${signedInEmail})` : ""} n'a pas encore d'accès à un
              espace compagnie. Vous avez reçu une invitation ? Ouvrez le lien reçu avec ce compte.
              Sinon, faites une demande ci-dessous.
            </p>
          </div>
        ) : null}

        <section className="bg-[linear-gradient(160deg,#0c1f33_0%,#12304d_62%,#17466c_100%)] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.25fr_1fr] md:px-8 md:py-20">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#f6c445]">
                Pour les compagnies maritimes
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-[1.15] md:text-[2.6rem]">
                Vos passagers préparent et suivent leur traversée sur BledWay. Soyez-y avec eux.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80 md:text-base">
                BledWay accompagne les voyageurs entre l'Europe et l'Algérie, de la préparation du
                voyage jusqu'au port. L'espace compagnie vous permet d'y prendre la parole en votre
                nom, avec des informations relues.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="#demande"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#f6c445] px-5 py-3 text-sm font-bold text-[#0c1f33] hover:bg-[#f9d36d]"
                >
                  Demander un accès
                </a>
                {signedIn ? null : (
                  <a
                    href={SIGN_IN}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/35 px-5 py-3 text-sm font-bold hover:bg-white/10"
                  >
                    J'ai reçu une invitation
                  </a>
                )}
              </div>
            </div>
            <div className="hidden md:block">
              <HeroPhone />
            </div>
          </div>
        </section>

        <Section
          eyebrow="Côté voyageurs"
          title="Ce que vivent vos passagers"
          lead="Captures de l'application telle que les voyageurs l'utilisent aujourd'hui."
        >
          <ul className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-8 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {PASSENGERS.map((item) => (
              <li
                key={item.title}
                className="grid w-[72%] flex-none snap-start content-start gap-4 sm:w-auto"
              >
                <Phone src={item.image} alt={item.alt} />
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold">
                    <item.icon className="size-5 text-[#2f8fe0]" aria-hidden />
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#4a5a6a]">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="bg-white">
          <Section
            eyebrow="Côté compagnie"
            title="Votre place dans cette expérience"
            lead="Un espace réservé à votre équipe, avec deux niveaux d'accès : Lecture et Opérations."
          >
            <ul className="grid gap-4 md:grid-cols-2">
              {PLACE.map((item) => (
                <li key={item.title} className="flex gap-4 rounded-2xl border border-[#e1e7ee] p-5">
                  <span className="grid size-11 flex-none place-items-center rounded-xl bg-[#e8f2fc] text-[#0f4f86]">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#4a5a6a]">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section eyebrow="Confiance" title="Les mêmes règles pour toutes les compagnies">
          <ul className="grid gap-3 sm:grid-cols-2">
            {RULES.map((rule) => (
              <li key={rule.text} className="flex items-start gap-3 text-[15px] leading-relaxed">
                <rule.icon className="mt-0.5 size-5 flex-none text-[#17a05a]" aria-hidden />
                {rule.text}
              </li>
            ))}
          </ul>
        </Section>

        <div className="bg-white">
          <Section
            id="demande"
            eyebrow="Accès"
            title="Demander un accès pour votre compagnie"
            lead="Une demande n'ouvre aucun accès à elle seule : l'équipe BledWay vérifie qui vous êtes, puis vous envoie une invitation personnelle."
          >
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <AccessRequestFormCard defaultEmail={signedInEmail ?? ""} />
              <aside className="grid content-start gap-4">
                <div className="rounded-2xl bg-[#0c1f33] p-6 text-white">
                  <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em] text-[#f6c445]">
                    <Sparkles className="size-4" aria-hidden />
                    Bientôt
                  </p>
                  <h3 className="mt-2 text-lg font-bold">Devenir partenaire BledWay</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/80">
                    Un espace partenaires est en préparation, pour faire connaître vos offres aux
                    voyageurs, aux couleurs de votre compagnie. Si cela vous intéresse, dites-le
                    dans votre demande.
                  </p>
                </div>
                {signedIn ? null : (
                  <div className="rounded-2xl border border-[#e1e7ee] p-6">
                    <h3 className="font-bold">Vous avez reçu une invitation ?</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#4a5a6a]">
                      Ouvrez le lien reçu : il vous permet de créer votre compte ou de vous
                      connecter avec la bonne adresse.
                    </p>
                    <a
                      href={SIGN_IN}
                      className="mt-4 inline-flex rounded-xl bg-[#12304d] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0c1f33]"
                    >
                      Se connecter
                    </a>
                  </div>
                )}
              </aside>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t border-[#e1e7ee] bg-[#f5f7fa]">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-sm text-[#4a5a6a] md:px-8">
          <Link to="/" className="hover:text-[#0c1f33]">
            Retour au site
          </Link>
          <Link to="/contact" className="hover:text-[#0c1f33]">
            Contact
          </Link>
          <Link to="/confidentialite" className="hover:text-[#0c1f33]">
            Confidentialité
          </Link>
          <Link to="/mentions-legales" className="hover:text-[#0c1f33]">
            Mentions légales
          </Link>
        </div>
      </footer>
    </div>
  );
}

const fieldClass =
  "mt-1 w-full rounded-xl border border-[#cfd8e2] bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-[#2f8fe0] focus:ring-2 focus:ring-[#2f8fe0]/25";

function Field({
  label,
  error,
  optional,
  children,
}: {
  label: string;
  error?: string | undefined;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid text-sm font-semibold">
      <span>
        {label}
        {optional ? <span className="font-normal text-[#6b7a89]"> (facultatif)</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 text-xs font-medium text-[#b42318]">{error}</span> : null}
    </label>
  );
}

function AccessRequestFormCard({ defaultEmail }: { defaultEmail: string }) {
  const companies = useQuery(companiesQuery);
  const [form, setForm] = useState<AccessRequestForm>({
    ...emptyAccessRequest,
    email: defaultEmail,
  });
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const opened = useRef(Date.now());
  const errors = tried ? accessRequestErrors(form) : {};
  const set = <K extends keyof AccessRequestForm>(key: K, value: AccessRequestForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (sent)
    return (
      <div className="rounded-2xl border border-[#b7e4c7] bg-[#effaf3] p-6" role="status">
        <p className="flex items-center gap-2 text-lg font-bold text-[#0b5c33]">
          <Check className="size-5" aria-hidden />
          Demande envoyée
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#2c4a3a]">
          L'équipe BledWay vous répond par e-mail à l'adresse indiquée. Aucun accès n'est ouvert
          sans vérification.
        </p>
      </div>
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    setFailure(null);
    if (Object.keys(accessRequestErrors(form)).length) return;
    const known = (companies.data ?? []).find(
      (company) => company.name.toLowerCase() === form.companyName.trim().toLowerCase(),
    );
    setSending(true);
    try {
      await sendAccessRequest(
        { ...form, companyId: known?.id ?? null },
        Date.now() - opened.current,
      );
      setSent(true);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4 rounded-2xl border border-[#e1e7ee] bg-[#fbfcfd] p-5 md:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom et prénom" error={errors.fullName}>
          <input
            className={fieldClass}
            autoComplete="name"
            maxLength={120}
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
          />
        </Field>
        <Field label="Fonction" error={errors.jobTitle}>
          <input
            className={fieldClass}
            autoComplete="organization-title"
            maxLength={120}
            placeholder="Par exemple : responsable relation clients"
            value={form.jobTitle}
            onChange={(e) => set("jobTitle", e.target.value)}
          />
        </Field>
        <Field label="Compagnie" error={errors.companyName}>
          <input
            className={fieldClass}
            autoComplete="organization"
            list="bw-showcase-companies"
            maxLength={120}
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
          />
          <datalist id="bw-showcase-companies">
            {(companies.data ?? []).map((company) => (
              <option key={company.id} value={company.name} />
            ))}
          </datalist>
        </Field>
        <Field label="E-mail professionnel" error={errors.email}>
          <input
            className={fieldClass}
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={255}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Téléphone" optional error={errors.phone}>
          <input
            className={fieldClass}
            type="tel"
            autoComplete="tel"
            maxLength={40}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Message" optional error={errors.message}>
        <textarea
          className={`${fieldClass} min-h-24`}
          maxLength={1000}
          placeholder="Ce que vous souhaitez faire avec l'espace compagnie, intérêt pour le partenariat…"
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </Field>
      {/* Champ piège : invisible pour une personne, rempli par un robot. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Site web
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-1 size-4 flex-none accent-[#12304d]"
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
        />
        <span>
          J'accepte que BledWay utilise ces informations pour traiter ma demande et me recontacter.{" "}
          <Link to="/confidentialite" className="font-semibold text-[#0f4f86] underline">
            Confidentialité
          </Link>
          {errors.consent ? (
            <span className="mt-1 block text-xs font-medium text-[#b42318]">{errors.consent}</span>
          ) : null}
        </span>
      </label>
      {failure ? (
        <p className="rounded-xl bg-[#fdecea] px-3.5 py-2.5 text-sm text-[#8a1c12]" role="alert">
          {failure}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#12304d] px-5 py-3 text-sm font-bold text-white hover:bg-[#0c1f33] disabled:opacity-60"
        >
          <Send className="size-4" aria-hidden />
          {sending ? "Envoi…" : "Envoyer la demande"}
        </button>
      </div>
    </form>
  );
}
