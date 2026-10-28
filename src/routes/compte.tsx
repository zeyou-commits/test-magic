import { useEffect, useState } from "react";
import { myTravellerQuery } from "@/lib/community/travellers";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { MyTravellerEditor } from "@/components/community/MyTravellerEditor";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portsQuery } from "@/lib/ferry/queries";
import { formatDate } from "@/lib/ferry/format";
import { FollowCenter } from "@/components/panel/FollowCenter";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { Bell, Heart, MessageSquare, UserRound, LogOut, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/compte")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Mon espace voyageur — BledWay" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Gérez votre profil BledWay : nom affiché, photo, avis publiés et signalements envoyés.",
      },
      { property: "og:title", content: "Mon compte — BledWay" },
      {
        property: "og:description",
        content: "Profil, avis et signalements de votre compte BledWay.",
      },
    ],
  }),
  component: AccountPage,
});

const reviewStatusLabels: Record<string, string> = {
  pending: "En attente de modération",
  approved: "Validé",
  published: "Publié",
  rejected: "Refusé",
  hidden: "Masqué",
  deleted: "Supprimé",
};

const reportReasonLabels: Record<string, string> = {
  wrong_schedule: "Horaire inexact",
  outdated_info: "Information obsolète",
  missing_info: "Information manquante",
  inappropriate: "Contenu inapproprié",
  other: "Autre",
};

const reportStatusLabels: Record<string, string> = {
  new: "Reçu",
  in_progress: "En cours",
  resolved: "Traité",
  rejected: "Écarté",
};

function AccountPage() {
  const { user, profile, isAdmin, loading, refreshProfile, signOut } = useAuth();
  const [section, setSection] = useState("voyages");
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      setSection(["profil", "notifications", "contributions"].includes(hash) ? hash : "voyages");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (loading) {
    return <Centered>Chargement…</Centered>;
  }

  if (!user) {
    return (
      <Centered>
        <p>Connectez-vous pour accéder à votre compte.</p>
        <Button asChild className="mt-3">
          <a href="/auth?next=%2Fcompte">Se connecter</a>
        </Button>
      </Centered>
    );
  }

  return (
    <div className="bw-account-page">
      <header className="bw-account-header"><Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-primary"><ArrowLeft className="size-4"/>Retour à la carte</Link><img src="/bledway-brand.png" alt="BledWay" className="h-9 w-auto"/><button type="button" onClick={() => void signOut()} aria-label="Se déconnecter" className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"><LogOut className="size-4"/></button></header>
      <div className="bw-account-welcome"><MyCabas fallback={(profile?.display_name || user.email || "V").slice(0, 1).toUpperCase()} /><div className="min-w-0"><span className="bw-account-kicker">Mon espace voyageur</span><h1>Bonjour{profile?.display_name ? ` ${profile.display_name.split(" ")[0]}` : ""}.</h1><p>Les retrouvailles se préparent ici.</p></div></div>
      <Tabs value={section} onValueChange={(value) => { setSection(value); window.history.replaceState(null, "", `/compte${value === "voyages" ? "" : `#${value}`}`); }}>
        <TabsList className="bw-account-tabs" aria-label="Mon espace voyageur">
          <TabsTrigger value="voyages"><Heart className="size-4"/>Mes voyages</TabsTrigger><TabsTrigger value="notifications"><Bell className="size-4"/>Notifications</TabsTrigger><TabsTrigger value="profil"><UserRound className="size-4"/>Mon profil</TabsTrigger><TabsTrigger value="contributions"><MessageSquare className="size-4"/>Contributions</TabsTrigger>
        </TabsList>
        <TabsContent value="voyages"><FollowCenter userId={user.id}/></TabsContent>
        <TabsContent value="notifications"><NotificationSettings userId={user.id}/></TabsContent>
        <TabsContent value="profil"><section className="bw-account-section"><h2 className="font-display text-xl font-semibold">Votre profil voyageur</h2><p className="mt-1 text-sm text-muted-foreground">Votre cabas, votre pseudo et votre humeur accompagnent vos contributions.</p><MyTravellerEditor /><div className="mt-5 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Adresse de connexion (jamais visible des autres voyageurs)</p><p className="mt-1 break-all text-sm font-medium">{user.email}</p></div>{isAdmin && <Link to="/admin" className="mt-6 inline-flex text-xs font-semibold text-primary underline">Ouvrir l’espace équipe</Link>}</section></TabsContent>
        <TabsContent value="contributions"><section className="bw-account-section"><h2 className="font-display text-xl font-semibold">Mes contributions</h2><MyReviews userId={user.id}/><MyReports userId={user.id}/></section></TabsContent>
      </Tabs>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center text-sm text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-xl border border-border bg-card p-4">{children}</div>;
}

/** Mon cabas en tête de l'espace voyageur (initiale tant que le profil n'est pas prêt). */
function MyCabas({ fallback }: { fallback: string }) {
  const { user } = useAuth();
  const me = useQuery(myTravellerQuery(user?.id)).data;
  return me ? (
    <TravellerAvatar card={me} size={64} static />
  ) : (
    <Avatar className="size-16 border-4 border-white shadow-sm">
      <AvatarFallback className="bg-primary text-xl font-semibold text-white">{fallback}</AvatarFallback>
    </Avatar>
  );
}

function MyReviews({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["my", "reviews", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("port_reviews")
        .select("id, port_id, comment, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("port_reviews").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my", "reviews", userId] });
      queryClient.invalidateQueries({ queryKey: ["port_reviews"] });
      toast.success("Avis supprimé.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <Card>
      <h3 className="text-sm font-semibold">Mes avis</h3>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
      ) : reviews.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Vous n'avez pas encore laissé d'avis sur un port.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {portName(review.port_id)}
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {reviewStatusLabels[review.status] ?? review.status}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.comment ?? "(sans commentaire)"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(review.created_at)}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(review.id)}>
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MyReports({ userId }: { userId: string }) {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["my", "reports", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, target_type, reason, message, status, created_at")
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  return (
    <Card>
      <h3 className="text-sm font-semibold">Mes signalements</h3>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
      ) : reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aucun signalement envoyé.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {reports.map((report) => (
            <li key={report.id} className="py-3">
              <p className="text-sm font-medium">
                {reportReasonLabels[report.reason] ?? report.reason}
                <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                  {reportStatusLabels[report.status] ?? report.status}
                </span>
              </p>
              {report.message ? (
                <p className="mt-1 text-sm text-muted-foreground">{report.message}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(report.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
