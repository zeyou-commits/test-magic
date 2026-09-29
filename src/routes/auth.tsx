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

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — Batogo" }, { name: "description", content: "Connectez-vous à Batogo pour noter les ports, laisser un avis et signaler une information inexacte." }] }),
  component: AuthPage,
});

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (message.includes("email not confirmed")) return "Votre adresse e-mail n'est pas encore confirmée. Consultez votre boîte mail.";
  if (message.includes("already registered") || message.includes("already been registered")) return "Un compte existe déjà avec cette adresse e-mail.";
  if (message.includes("password") && (message.includes("least") || message.includes("short") || message.includes("weak"))) return "Le mot de passe est trop court ou trop faible (6 caractères minimum).";
  if (message.includes("rate limit") || message.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (message.includes("network") || message.includes("fetch")) return "Connexion impossible. Vérifiez votre réseau et réessayez.";
  return "Connexion impossible pour le moment. Réessayez dans un instant.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: displayName.trim() || null } } });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre boîte mail si une confirmation est demandée.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) { toast.error(authErrorMessage(error)); } finally { setLoading(false); }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Connexion Google impossible pour le moment."); return; }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <Link to="/" className="mb-6 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground">&larr; Retour à la carte</Link>
        <h1 className="mb-2 font-display text-2xl font-bold">{mode === "signin" ? "Se connecter" : "Créer un compte"}</h1>
        <p className="mb-6 text-sm text-muted-foreground">Pour noter les ports, laisser un avis et signaler une erreur.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Nom affiché</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" placeholder="Amine" className="batogo-control" />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="batogo-control" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><Label htmlFor="password">Mot de passe</Label></div>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="batogo-control pr-10" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {mode === "signup" ? <span className="text-xs text-muted-foreground">6 caractères minimum.</span> : null}
          </div>
          <Button type="submit" className="mt-2 w-full" disabled={loading}>
            {loading ? (mode === "signin" ? "Connexion…" : "Création du compte…") : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>

        <div className="relative mb-6 mt-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t"></div></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
        </div>

        <Button variant="outline" type="button" className="w-full" onClick={handleGoogle}>Continuer avec Google</Button>
        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-6 w-full text-sm font-medium text-muted-foreground hover:text-primary hover:underline">
          {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
