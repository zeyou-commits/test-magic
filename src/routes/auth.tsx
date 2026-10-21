import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Star } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Connexion — Batogo" },
      { property: "og:title", content: "Connexion — Batogo" },
      {
        property: "og:description",
        content: "Connectez-vous à Batogo pour retrouver votre compte et vos contributions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Connectez-vous à Batogo pour noter les ports, laisser un avis et signaler une information inexacte.",
      },
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
  const { user } = useAuth();
  const requestedNext =
    typeof window === "undefined" ? "/" : new URLSearchParams(window.location.search).get("next");
  const next =
    requestedNext?.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\") &&
    !requestedNext.startsWith("/auth")
      ? requestedNext
      : "/";
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "reset"
      ? "reset"
      : typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("mode") === "signup"
        ? "signup"
        : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupSent, setSignupSent] = useState(false);
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
    if (user && mode !== "reset") window.location.replace(next);
  }, [user, mode, next]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!displayName.trim()) {
          toast.error("Indiquez un prénom ou un pseudo pour votre profil.");
          return;
        }
        if (password !== confirmPassword) {
          toast.error("Les deux mots de passe ne correspondent pas.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
            data: { display_name: displayName.trim() || null },
          },
        });
        if (error) throw error;
        setSignupSent(true);
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
        window.location.replace(next);
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
    } catch {
      toast.error("Connexion Google impossible pour le moment.");
    } finally {
      setGoogleLoading(false);
    }
  }

  const showEmail = mode !== "reset";
  const showPasswordField = mode !== "forgot";

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#f8f5ee] px-4 py-8 text-foreground sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-28 size-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-[#d7e9e7] blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl lg:grid-cols-[.9fr_1.1fr]">
        <div className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden bg-[#e9f0e9] p-10 lg:flex">
          <div className="relative z-10">
            <img
              src="/bledway-brand.png"
              alt="BledWay"
              className="h-12 w-auto object-contain object-left"
            />
          </div>
          <img
            src="/images/bledway-horizon-algerien.png"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-65"
          />
          <div className="relative z-10 rounded-3xl border border-white/70 bg-[#f8f5ee]/90 p-7 backdrop-blur">
            <span className="text-xs font-bold uppercase tracking-[.18em] text-primary">
              La mer nous rapproche
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight">
              Préparons la traversée ensemble.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Retrouvez votre voyage et partagez vos conseils avec celles et ceux qui prennent le
              large.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
              <Star size={17} /> Avis de voyageurs <span className="mx-2 text-border">·</span>{" "}
              <ShieldCheck size={17} /> Compte sécurisé
            </div>
          </div>
        </div>
        <div className="w-full px-6 py-7 sm:px-10 sm:py-10">
          <div className="mb-8 flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              &larr; Retour à la carte
            </Link>
            <img src="/pwa-icon-192.png" alt="" className="size-11 rounded-xl lg:hidden" />
          </div>
          {mode === "signin" || mode === "signup" ? (
            <div
              className="mb-7 grid grid-cols-2 rounded-xl bg-secondary p-1"
              aria-label="Connexion ou inscription"
            >
              <button
                type="button"
                aria-current={mode === "signin" ? "page" : undefined}
                onClick={() => {
                  setMode("signin");
                  setSignupSent(false);
                }}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === "signin" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                aria-current={mode === "signup" ? "page" : undefined}
                onClick={() => setMode("signup")}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === "signup" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Créer un compte
              </button>
            </div>
          ) : null}
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">{titles[mode]}</h1>
          <p className="mb-7 text-sm leading-relaxed text-muted-foreground">
            {mode === "forgot"
              ? "Indiquez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe."
              : mode === "reset"
                ? "Choisissez votre nouveau mot de passe (6 caractères minimum)."
                : mode === "signup"
                  ? "Un profil en quelques instants pour partager votre expérience de voyage."
                  : "Heureux de vous revoir. Reprenez là où vous en étiez."}
          </p>

          {mode === "signup" && signupSent ? (
            <div
              role="status"
              className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed"
            >
              <strong className="block text-base text-primary">Encore une étape !</strong>
              Consultez l’e-mail envoyé à <strong>{email}</strong> et confirmez votre adresse si
              demandé. Vous pourrez ensuite revenir à votre bateau.
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setSignupSent(false);
                }}
                className="mt-4 block font-semibold text-primary underline underline-offset-2"
              >
                J’ai confirmé mon adresse · Me connecter
              </button>
            </div>
          ) : mode === "forgot" && resetSent ? (
            <div className="rounded-xl bg-secondary p-4 text-sm">
              Si un compte existe pour <strong>{email}</strong>, un e-mail vient d’être envoyé.
              Pensez à vérifier vos courriers indésirables.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="displayName">Comment vous appeler ?</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="nickname"
                    placeholder="Prénom ou pseudo"
                    required
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
                    <span className="text-xs text-muted-foreground">
                      6 caractères minimum. Un mot de passe unique protège mieux votre compte.
                    </span>
                  ) : null}
                </div>
              ) : null}
              {mode === "signup" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    className="batogo-control"
                  />
                  {confirmPassword && confirmPassword !== password ? (
                    <span className="text-xs text-destructive">
                      Les mots de passe ne correspondent pas.
                    </span>
                  ) : null}
                </div>
              ) : null}
              {mode === "signup" ? (
                <p className="text-xs text-muted-foreground">
                  En créant un compte, vous acceptez que vos avis soient publiés après relecture.
                  Voir la{" "}
                  <Link
                    to="/confidentialite"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    politique de confidentialité
                  </Link>
                  .
                </p>
              ) : null}
              <Button
                type="submit"
                className="mt-2 h-12 w-full rounded-xl text-sm font-semibold"
                disabled={
                  loading ||
                  (mode === "signup" && Boolean(confirmPassword) && password !== confirmPassword)
                }
              >
                {loading
                  ? "Patientez…"
                  : mode === "signin"
                    ? "Se connecter"
                    : mode === "signup"
                      ? "Créer mon compte"
                      : mode === "forgot"
                        ? "Recevoir le lien"
                        : "Enregistrer le mot de passe"}
                {!loading ? <ArrowRight size={16} aria-hidden /> : null}
              </Button>
            </form>
          )}

          {(mode === "signin" || mode === "signup") && !signupSent ? (
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
                className="h-12 w-full rounded-xl"
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
          <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">
            Vos avis aident les voyageurs. Nous ne publions jamais votre adresse e-mail.
          </p>
        </div>
      </div>
    </div>
  );
}
