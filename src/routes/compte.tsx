import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte — FerryDZ" },
      {
        name: "description",
        content:
          "Gérez votre profil FerryDZ : nom affiché, photo, avis publiés et signalements envoyés.",
      },
      { property: "og:title", content: "Mon compte — FerryDZ" },
      {
        property: "og:description",
        content: "Profil, avis et signalements de votre compte FerryDZ.",
      },
      { name: "robots", content: "noindex" },
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

const reportStatusLabels: Record<string, string> = {
  new: "Reçu",
  in_progress: "En cours",
  resolved: "Traité",
  rejected: "Écarté",
};

function AccountPage() {
  const { user, profile, isAdmin, loading, refreshProfile, signOut } = useAuth();

  if (loading) {
    return <Centered>Chargement…</Centered>;
  }

  if (!user) {
    return (
      <Centered>
        <p>Connectez-vous pour accéder à votre compte.</p>
        <Button asChild className="mt-3">
          <Link to="/auth">Se connecter</Link>
        </Button>
      </Centered>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Retour à la carte
        </Link>
        <div className="flex gap-2">
          {isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Back-office</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-semibold">Mon compte</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>

      <ProfileCard
        userId={user.id}
        displayName={profile?.display_name ?? ""}
        avatarUrl={profile?.avatar_url ?? ""}
        onSaved={refreshProfile}
      />

      <section id="contributions" className="mt-8 scroll-mt-6">
        <h2 className="text-lg font-semibold">Mes contributions</h2>
        <MyReviews userId={user.id} />
        <MyReports userId={user.id} />
      </section>
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

function ProfileCard({
  userId,
  displayName,
  avatarUrl,
  onSaved,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState(avatarUrl);

  useEffect(() => {
    setName(displayName);
    setAvatar(avatarUrl);
  }, [displayName, avatarUrl]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: name.trim() || null,
          avatar_url: avatar.trim() || null,
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onSaved();
      toast.success("Profil mis à jour.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar className="size-14 border border-border">
          {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {(name || "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="display-name">Nom affiché</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Amine"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="avatar-url">Lien de la photo</Label>
            <Input
              id="avatar-url"
              value={avatar}
              onChange={(event) => setAvatar(event.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </Button>
      </div>
    </Card>
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
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
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
                {report.reason}
                <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  {reportStatusLabels[report.status] ?? report.status}
                </span>
              </p>
              {report.message ? (
                <p className="mt-1 text-sm text-muted-foreground">{report.message}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(report.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
