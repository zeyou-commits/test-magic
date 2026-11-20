import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BellRing, CalendarClock, Lock, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Porte d'entrée de l'espace équipe (/admin) quand on n'est pas connecté, ou pas membre de
 * l'équipe : écran habillé BledWay au lieu d'une phrase seule au milieu de la page.
 * La connexion ramène exactement à la rubrique demandée (?tab=…).
 */
export function AdminGate({ state }: { state: "signin" | "refused" }) {
  // Adresse demandée, lue après le premier rendu (pas de différence serveur / navigateur).
  const [next, setNext] = useState("/admin");
  useEffect(() => {
    setNext(`${window.location.pathname}${window.location.search}`);
  }, []);

  return (
    <main className="min-h-dvh bg-[#f4f1ea] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-[#0d3b4f] text-white">
        <img
          src="/images/bledway-horizon-algerien.webp"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d3b4f]/70 via-[#0d3b4f]/85 to-[#0d3b4f]" />
        <div className="relative flex h-full flex-col gap-6 px-6 py-7 sm:px-10 lg:min-h-dvh lg:justify-between lg:py-12">
          <a href="/" className="inline-flex items-center gap-3 self-start">
            <img
              src="/pwa-icon-192.png"
              alt=""
              width={44}
              height={44}
              className="rounded-xl shadow-lg shadow-black/20"
            />
            <span className="leading-tight">
              <span className="block font-display text-xl font-extrabold">BledWay</span>
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#f6c453]">
                Espace équipe
              </span>
            </span>
          </a>
          <div className="max-w-md">
            <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl">
              Les coulisses de la route du bled.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#cfe7dc] sm:text-base">
              Départs, voyageurs, contenus : l'équipe tient l'information à jour pour que chaque
              traversée se passe sans mauvaise surprise.
            </p>
            <ul className="mt-6 hidden gap-3 sm:grid">
              <Feature icon={<CalendarClock className="size-4" />} title="Traversées">
                Planning, départs, flotte et imports des compagnies.
              </Feature>
              <Feature icon={<Users className="size-4" />} title="Voyageurs">
                Avis, photos, signalements et salons à modérer.
              </Feature>
              <Feature icon={<BellRing className="size-4" />} title="Contenus">
                Veille, Flash info, notifications et e-mails.
              </Feature>
            </ul>
          </div>
          <p className="hidden text-xs text-[#cfe7dc]/80 lg:block">
            Accès réservé aux membres invités par un administrateur.
          </p>
        </div>
      </aside>

      <section className="grid place-items-center px-4 py-10 sm:px-8 lg:min-h-dvh">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-[0_18px_50px_-20px_rgba(13,59,79,0.35)] sm:p-8">
            {state === "signin" ? (
              <>
                <span className="grid size-12 place-items-center rounded-2xl bg-[#0e6b3b]/10 text-[#0e6b3b]">
                  <Lock className="size-6" aria-hidden />
                </span>
                <h2 className="mt-5 font-display text-2xl font-extrabold text-[#0d3b4f]">
                  Connexion à l'espace équipe
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Connectez-vous avec le compte qui a reçu l'invitation : vous arriverez directement
                  sur la rubrique demandée.
                </p>
                <Button asChild size="lg" className="mt-6 w-full">
                  <a href={`/auth?next=${encodeURIComponent(next)}`}>Se connecter</a>
                </Button>
                <p className="mt-4 rounded-xl bg-[#f7f5ef] p-3 text-xs leading-relaxed text-muted-foreground">
                  Pas encore de compte d'équipe ? L'accès se fait sur invitation d'un
                  administrateur. Vous avez reçu un e-mail d'invitation ? Ouvrez-le et touchez
                  « Accepter l'invitation ».
                </p>
              </>
            ) : (
              <>
                <span className="grid size-12 place-items-center rounded-2xl bg-[#b54708]/10 text-[#b54708]">
                  <ShieldCheck className="size-6" aria-hidden />
                </span>
                <h2 className="mt-5 font-display text-2xl font-extrabold text-[#0d3b4f]">
                  Espace réservé à l'équipe
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Votre compte est bien connecté, mais il n'a pas encore de rôle dans l'équipe
                  BledWay. Un administrateur peut vous en donner un : vous serez alors prévenu par
                  e-mail.
                </p>
                <Button asChild size="lg" variant="outline" className="mt-6 w-full">
                  <a href="/">Retour à la carte</a>
                </Button>
              </>
            )}
          </div>
          <a
            href="/"
            className="mx-auto mt-5 flex w-fit items-center gap-1.5 text-sm font-semibold text-[#0d3b4f] hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden /> Retour au site
          </a>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 backdrop-blur-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#0e6b3b] text-white">
        {icon}
      </span>
      <span className="text-sm">
        <b className="block">{title}</b>
        <span className="text-[#cfe7dc]">{children}</span>
      </span>
    </li>
  );
}
