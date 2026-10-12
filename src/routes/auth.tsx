import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/layout/BrandMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Batogo" },
      {
        name: "description",
        content:
          "Connectez-vous à Batogo pour noter les ports, laisser un avis et signaler une information inexacte.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "reset";

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (message.includes("email not confirmed"))
    return "Votre adresse e-mail n'est pas encore confirmée. Consultez votre boîte mail.";
  if (message.includes("already registered") || message.includes("already been registered"))
    return "Un compte existe déjà avec cette adresse e-mail.";
  if (
    message.includes("password") &&
    (message.includes("least") || message.includes("short") || message.includes("weak"))
  )
    return "Le mot de passe est trop court ou trop faible (6 caractères minimum).";
  if (message.includes("same") && message.includes("password"))
    return "Choisissez un mot de passe différent de l'ancien.";
  if (message.includes("rate limit") || message.includes("too many"))
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (message.includes("network") || message.includes("fetch"))
    return "Connexion impossible. Vérifiez votre réseau et réessayez.";
  return "Opération impossible pour le moment. Réessayez dans un instant.";
}

const titles: Record<Mode, string> = {
  signin: "Se connecter",
  signup: "Créer un compte",
  forgot: "Mot de passe oublié",
  reset: "Nouveau mot de passe",
};

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "reset"
      ? "reset"
      : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Le lien reçu par e-mail ouvre une session de récupération : on affiche alors le formulaire de nouveau mot de passe.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && mode !== "reset") navigate({ to: "/" });
  }, [user, mode, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName.trim() || null },
          },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre boîte mail si une confirmation est demandée.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        });
        if (error) throw error;
        // Message volontairement neutre : on ne révèle pas si l'adresse possède un compte.
        setResetSent(true);
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Mot de passe modifié. Vous êtes connecté.");
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Connexion Google impossible pour le moment.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch {
      toast.error("Connexion Google impossible pour le moment.");
    } finally {
      setGoogleLoading(false);
    }
  }

  const showEmail = mode !== "reset";
  const showPasswordField = mode !== "forgot";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-secondary/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            &larr; Retour à la carte
          </Link>
          <BrandMark className="size-8" />
        </div>
        <h1 className="mb-2 font-display text-2xl font-bold">{titles[mode]}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "Indiquez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe."
            : mode === "reset"
              ? "Choisissez votre nouveau mot de passe (6 caractères minimum)."
              : "Pour noter les ports, laisser un avis et signaler une erreur."}
        </p>

        {mode === "forgot" && resetSent ? (
          <div className="rounded-xl bg-secondary p-4 text-sm">
            Si un compte existe pour <strong>{email}</strong>, un e-mail vient d’être envoyé. Pensez
            à vérifier vos courriers indésirables.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="displayName">Nom affiché</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  placeholder="Prénom ou pseudo"
                  className="batogo-control"
                />
              </div>
            ) : null}
            {showEmail ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="batogo-control"
                />
              </div>
            ) : null}
            {showPasswordField ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">
                    {mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}
                  </Label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setResetSent(false);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="batogo-control pr-10"
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {mode === "signup" || mode === "reset" ? (
                  <span className="text-xs text-muted-foreground">6 caractères minimum.</span>
                ) : null}
              </div>
            ) : null}
            {mode === "signup" ? (
              <p className="text-xs text-muted-foreground">
                En créant un compte, vous acceptez que vos avis soient publiés après relecture. Voir
                la{" "}
                <Link
                  to="/confidentialite"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  politique de confidentialité
                </Link>
                .
              </p>
            ) : null}
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading
                ? "Patientez…"
                : mode === "signin"
                  ? "Se connecter"
                  : mode === "signup"
                    ? "Créer mon compte"
                    : mode === "forgot"
                      ? "Recevoir le lien"
                      : "Enregistrer le mot de passe"}
            </Button>
          </form>
        )}

        {mode === "signin" || mode === "signup" ? (
          <>
            <div className="relative mb-6 mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>
            <Button
              variant="outline"
              type="button"
              className="w-full"
              onClick={handleGoogle}
              disabled={googleLoading}
            >
              {googleLoading ? "Redirection vers Google…" : "Continuer avec Google"}
            </Button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setResetSent(false);
          }}
          className="mt-6 w-full text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
        >
          {mode === "signin"
            ? "Pas encore de compte ? Créer un compte"
            : mode === "signup"
              ? "Déjà inscrit ? Se connecter"
              : "Retour à la connexion"}
        </button>
      </div>
    </div>
  );
}
