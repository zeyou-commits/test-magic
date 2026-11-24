import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { type AcceptResult, companyAccessKeys, companyAccessRequest } from "@/lib/company/access";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/rejoindre-compagnie")({
  head: () => ({
    meta: [
      { title: tr("ui.pageRejoindreCompagnie.rejoindreUnEspaceCompagnieBledway") },
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
    get title() { return tr("ui.pageRejoindreCompagnie.accesOuvert"); },
    get text() { return tr("ui.pageRejoindreCompagnie.votreCompteAMaintenantAcces"); },
    done: true,
  },
  already_accepted: {
    get title() { return tr("ui.pageRejoindreCompagnie.accesDejaOuvert"); },
    get text() { return tr("ui.pageRejoindreCompagnie.vousAvezDejaAccepteCette"); },
    done: true,
  },
  already_member: {
    get title() { return tr("ui.pageRejoindreCompagnie.accesDejaOuvert"); },
    get text() { return tr("ui.pageRejoindreCompagnie.votreCompteAvaitDejaAcces"); },
    done: true,
  },
  wrong_account: {
    get title() { return tr("ui.pageRejoindreCompagnie.ceNEstPasLe"); },
    get text() { return tr("ui.pageRejoindreCompagnie.ceLienAEteCree"); },
  },
  email_unconfirmed: {
    get title() { return tr("ui.pageRejoindreCompagnie.adresseAConfirmer"); },
    get text() { return tr("ui.pageRejoindreCompagnie.confirmezDAbordVotreAdresse"); },
  },
  expired: {
    get title() { return tr("ui.pageRejoindreCompagnie.lienExpire"); },
    get text() { return tr("ui.pageRejoindreCompagnie.ceLienNEstPlus"); },
    final: true,
  },
  revoked: {
    get title() { return tr("ui.pageRejoindreCompagnie.lienAnnule"); },
    get text() { return tr("ui.pageRejoindreCompagnie.cetteInvitationAEteAnnulee"); },
    final: true,
  },
  used: {
    get title() { return tr("ui.pageRejoindreCompagnie.lienDejaUtilise"); },
    get text() { return tr("ui.pageRejoindreCompagnie.ceLienADejaServi"); },
    final: true,
  },
  not_found: {
    get title() { return tr("ui.pageRejoindreCompagnie.lienInconnu"); },
    get text() { return tr("ui.pageRejoindreCompagnie.ceLienNEstPas"); },
    final: true,
  },
  account_inactive: {
    get title() { return tr("ui.pageRejoindreCompagnie.compteBloque"); },
    get text() { return tr("ui.pageRejoindreCompagnie.votreCompteNePeutPas"); },
  },
  suspended: {
    get title() { return tr("ui.pageRejoindreCompagnie.accesSuspendu"); },
    get text() { return tr("ui.pageRejoindreCompagnie.votreAccesACetteCompagnie"); },
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
          {tr("ui.pageRejoindreCompagnie.retourAuSite")}
        </Link>
      </div>
    </main>
  );

  if (loading || code === undefined) return shell(tr("ui.pageRejoindreCompagnie.espaceCompagnie"), <p>{tr("ui.pageRejoindreCompagnie.chargement")}</p>);
  if (!code)
    return shell(
      tr("ui.pageRejoindreCompagnie.lienIncomplet"),
      <p>
        {tr("ui.pageRejoindreCompagnie.ouvrezLeLienDInvitation")}
      </p>,
    );
  if (!user)
    return shell(
      tr("ui.pageRejoindreCompagnie.rejoindreUnEspaceCompagnie"),
      <>
        <p>{tr("ui.pageRejoindreCompagnie.bledwayVousInviteARejoindre")}</p>
        <p>
          {tr("ui.pageRejoindreCompagnie.connectezVousOuCreezVotre")}
        </p>
      </>,
      <a href="/auth?next=%2Frejoindre-compagnie" className="bw-action-primary inline-flex">
        {tr("ui.pageRejoindreCompagnie.seConnecterOuCreerUn")}
      </a>,
    );

  if (accept.isError)
    return shell(
      tr("ui.pageRejoindreCompagnie.verificationImpossible"),
      <p>{(accept.error as Error).message}</p>,
      <button
        type="button"
        className="bw-action-primary inline-flex"
        onClick={() => accept.mutate()}
      >
        {tr("ui.pageRejoindreCompagnie.reessayer")}
      </button>,
    );
  if (accept.data) {
    const outcome = OUTCOMES[accept.data.result] ?? OUTCOMES.not_found;
    return shell(
      outcome.title,
      <p>
        {outcome.done
          ? `${outcome.text} ${accept.data.companyName ?? tr("ui.pageRejoindreCompagnie.votreCompagnie")}.`
          : outcome.text}
      </p>,
      outcome.done ? (
        <a
          href={`/espace-compagnie${accept.data.companyId ? `?c=${accept.data.companyId}` : ""}`}
          className="bw-action-primary inline-flex"
        >
          {tr("ui.pageRejoindreCompagnie.ouvrirLEspaceCompagnie")}
        </a>
      ) : accept.data.result === "wrong_account" ? (
        <button
          type="button"
          className="bw-action-primary inline-flex"
          onClick={() => void signOut()}
        >
          {tr("ui.pageRejoindreCompagnie.seDeconnecter")}
        </button>
      ) : null,
    );
  }
  return shell(
    tr("ui.pageRejoindreCompagnie.rejoindreUnEspaceCompagnie"),
    <>
      <p>
        {tr("ui.pageRejoindreCompagnie.compteConnecte")}<strong className="text-foreground">{user.email}</strong>.
      </p>
      <p>
        {tr("ui.pageRejoindreCompagnie.enAcceptantCeComptePersonnel")}
      </p>
    </>,
    <button
      type="button"
      className="bw-action-primary inline-flex"
      disabled={accept.isPending}
      onClick={() => accept.mutate()}
    >
      {accept.isPending ? tr("ui.pageRejoindreCompagnie.verification") : tr("ui.pageRejoindreCompagnie.accepterLInvitation")}
    </button>,
  );
}
