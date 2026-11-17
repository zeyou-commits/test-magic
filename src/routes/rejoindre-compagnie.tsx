import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { type AcceptResult, companyAccessKeys, companyAccessRequest } from "@/lib/company/access";

export const Route = createFileRoute("/rejoindre-compagnie")({
  head: () => ({
    meta: [
      { title: "Rejoindre un espace compagnie — BledWay" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinCompanyPage,
});

/**
 * Le code arrive après « # » : il n'est jamais envoyé dans l'adresse demandée au serveur.
 * Il est gardé dans ce navigateur le temps de se connecter ou de créer le compte, puis effacé.
 */
const STORE = "bw-company-invite";
const CODE = /^[A-Za-z0-9_-]{43}$/;
function takeCode(): string | null {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("code");
  try {
    if (fromLink && CODE.test(fromLink)) {
      localStorage.setItem(STORE, JSON.stringify({ code: fromLink, at: Date.now() }));
      window.history.replaceState(null, "", window.location.pathname);
      return fromLink;
    }
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as {
      code?: string;
      at?: number;
    } | null;
    if (saved?.code && CODE.test(saved.code) && Date.now() - (saved.at ?? 0) < 8 * 86_400_000)
      return saved.code;
  } catch {
    return fromLink && CODE.test(fromLink) ? fromLink : null;
  }
  return null;
}
function forgetCode() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* stockage indisponible : rien à effacer */
  }
}

const OUTCOMES: Record<
  AcceptResult,
  { title: string; text: string; done?: boolean; final?: boolean }
> = {
  accepted: {
    title: "Accès ouvert",
    text: "Votre compte a maintenant accès à l'espace de",
    done: true,
  },
  already_accepted: {
    title: "Accès déjà ouvert",
    text: "Vous avez déjà accepté cette invitation pour",
    done: true,
  },
  already_member: {
    title: "Accès déjà ouvert",
    text: "Votre compte avait déjà accès à l'espace de",
    done: true,
  },
  wrong_account: {
    title: "Ce n'est pas le bon compte",
    text: "Ce lien a été créé pour une autre adresse e-mail. Déconnectez-vous, puis connectez-vous ou créez votre compte avec l'adresse à laquelle vous avez reçu ce lien.",
  },
  email_unconfirmed: {
    title: "Adresse à confirmer",
    text: "Confirmez d'abord votre adresse e-mail avec le message reçu à l'inscription, puis rouvrez ce lien.",
  },
  expired: {
    title: "Lien expiré",
    text: "Ce lien n'est plus valable. Demandez une nouvelle invitation à votre interlocuteur BledWay.",
    final: true,
  },
  revoked: {
    title: "Lien annulé",
    text: "Cette invitation a été annulée par BledWay. Contactez votre interlocuteur si besoin.",
    final: true,
  },
  used: {
    title: "Lien déjà utilisé",
    text: "Ce lien a déjà servi à un autre compte. Il ne fonctionne qu'une fois.",
    final: true,
  },
  not_found: {
    title: "Lien inconnu",
    text: "Ce lien n'est pas reconnu. Vérifiez que vous l'avez copié en entier.",
    final: true,
  },
  account_inactive: {
    title: "Compte bloqué",
    text: "Votre compte ne peut pas recevoir d'accès pour le moment. Contactez BledWay.",
  },
  suspended: {
    title: "Accès suspendu",
    text: "Votre accès à cette compagnie est suspendu. Contactez votre interlocuteur BledWay.",
    final: true,
  },
};

function JoinCompanyPage() {
  const { user, loading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  useEffect(() => setCode(takeCode()), []);
  const accept = useMutation({
    mutationFn: () =>
      companyAccessRequest<{ result: AcceptResult; companyId?: string; companyName?: string }>({
        action: "accept",
        token: code,
      }),
    onSuccess: (data) => {
      const outcome = OUTCOMES[data.result];
      if (outcome?.done || outcome?.final) forgetCode();
      if (outcome?.done && user)
        void queryClient.invalidateQueries({ queryKey: companyAccessKeys.me(user.id) });
    },
  });

  const shell = (title: string, body: ReactNode, actions?: ReactNode) => (
    <main className="mx-auto grid max-w-lg gap-3 px-4 py-10 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="grid gap-2 text-sm text-muted-foreground">{body}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {actions}
        <Link to="/" className="bw-action-secondary inline-flex">
          Retour au site
        </Link>
      </div>
    </main>
  );

  if (loading || code === undefined) return shell("Espace compagnie", <p>Chargement…</p>);
  if (!code)
    return shell(
      "Lien incomplet",
      <p>
        Ouvrez le lien d'invitation reçu de BledWay en entier, depuis le message où il vous a été
        envoyé.
      </p>,
    );
  if (!user)
    return shell(
      "Rejoindre un espace compagnie",
      <>
        <p>BledWay vous invite à rejoindre l'espace de votre compagnie.</p>
        <p>
          Connectez-vous, ou créez votre compte, avec l'adresse e-mail à laquelle vous avez reçu ce
          lien. Revenez ensuite sur cette page.
        </p>
      </>,
      <a href="/auth?next=%2Frejoindre-compagnie" className="bw-action-primary inline-flex">
        Se connecter ou créer un compte
      </a>,
    );

  if (accept.isError)
    return shell(
      "Vérification impossible",
      <p>{(accept.error as Error).message}</p>,
      <button
        type="button"
        className="bw-action-primary inline-flex"
        onClick={() => accept.mutate()}
      >
        Réessayer
      </button>,
    );
  if (accept.data) {
    const outcome = OUTCOMES[accept.data.result] ?? OUTCOMES.not_found;
    return shell(
      outcome.title,
      <p>
        {outcome.done
          ? `${outcome.text} ${accept.data.companyName ?? "votre compagnie"}.`
          : outcome.text}
      </p>,
      outcome.done ? (
        <a
          href={`/espace-compagnie${accept.data.companyId ? `?c=${accept.data.companyId}` : ""}`}
          className="bw-action-primary inline-flex"
        >
          Ouvrir l'espace compagnie
        </a>
      ) : accept.data.result === "wrong_account" ? (
        <button
          type="button"
          className="bw-action-primary inline-flex"
          onClick={() => void signOut()}
        >
          Se déconnecter
        </button>
      ) : null,
    );
  }
  return shell(
    "Rejoindre un espace compagnie",
    <>
      <p>
        Compte connecté : <strong className="text-foreground">{user.email}</strong>.
      </p>
      <p>
        En acceptant, ce compte personnel aura accès à l'espace de votre compagnie sur BledWay.
        BledWay peut modifier ou retirer cet accès.
      </p>
    </>,
    <button
      type="button"
      className="bw-action-primary inline-flex"
      disabled={accept.isPending}
      onClick={() => accept.mutate()}
    >
      {accept.isPending ? "Vérification…" : "Accepter l'invitation"}
    </button>,
  );
}
