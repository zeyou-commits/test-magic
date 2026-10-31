import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkPseudo, pseudoError, suggestPseudo } from "@/lib/community/travellers";
import { GoogleMark } from "./GoogleMark";

export function AccountAccessForm({
  onAwaitingConfirmation,
}: {
  onAwaitingConfirmation: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState(suggestPseudo);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const problem = pseudoError(name) ?? (await checkPseudo(name));
        if (problem) {
          setError(problem);
          return;
        }
      }
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: { display_name: name.trim(), pseudo: name.trim() },
                emailRedirectTo: `${window.location.origin}/auth?next=%2Fcompte`,
              },
            });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        onAwaitingConfirmation();
        setMessage(
          "Consultez votre e-mail pour confirmer votre compte. Votre trajet est conservé sur cet appareil ; il sera ajouté dès votre connexion.",
        );
      }
    } catch {
      setError(
        mode === "signin"
          ? "Connexion impossible. Vérifiez votre e-mail, votre mot de passe et la confirmation de votre compte."
          : "Création impossible. Si vous avez déjà un compte, choisissez « Se connecter ».",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth?next=%2Fcompte` },
    });
    if (oauthError) {
      setError("Connexion Google indisponible. Utilisez votre adresse e-mail.");
      setBusy(false);
    }
  }
  return (
    <div>
      <div
        className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1"
        role="group"
        aria-label="Accès à votre compte"
      >
        {(["signup", "signin"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setError("");
              setMessage("");
            }}
            className={`min-h-10 rounded-lg text-sm font-semibold ${mode === item ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {item === "signup" ? "Créer un compte" : "Se connecter"}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void google()}
        className="bw-action-secondary w-full"
      >
        <GoogleMark />
        Continuer avec Google
      </button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou avec votre e-mail
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        {mode === "signup" && (
          <label className="grid gap-1 text-sm font-medium">
            Votre pseudo
            <input
              className="bw-account-input"
              autoComplete="nickname"
              required
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <small className="font-normal text-muted-foreground">
              Visible par les autres voyageurs. Vous pourrez le changer une seule fois.
            </small>
          </label>
        )}
        <label className="grid gap-1 text-sm font-medium">
          E-mail
          <input
            type="email"
            className="bw-account-input"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Mot de passe
          <input
            type="password"
            className="bw-account-input"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy} className="bw-action-primary w-full">
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {mode === "signup"
            ? "Créer mon compte et garder mon suivi"
            : "Me connecter et retrouver mon suivi"}
        </button>
        {mode === "signin" && (
          <a
            href="/auth?next=%2Fcompte"
            className="inline-flex py-1 text-xs text-primary underline"
          >
            Mot de passe oublié ?
          </a>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      <p className="mt-3 text-[11px] text-muted-foreground">
        En créant un compte, vous acceptez notre{" "}
        <a href="/confidentialite" className="underline">
          politique de confidentialité
        </a>
        .
      </p>
    </div>
  );
}
