import { BrandPicture } from "@/components/layout/SiteLayout";
import { MyEntityReviews } from "@/components/account/MyEntityReviews";
import { useEffect, useState } from "react";
import { myTravellerQuery } from "@/lib/community/travellers";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { EditableAvatar, focusAvatarPicker } from "@/components/community/EditableAvatar";
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
import { NotificationInbox } from "@/components/account/NotificationInbox";
import { MyTickets } from "@/components/tickets/MyTickets";
import { Bell, Heart, MessageSquare, UserRound, LogOut, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tr } from "@/lib/i18n";
import { VigieProgress } from "@/components/community/VigieBadge";

export const Route = createFileRoute("/compte")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: tr("ui.pageCompte.monEspaceVoyageurBledway") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          tr("ui.pageCompte.gerezVotreProfilBledwayNom"),
      },
      { property: "og:title", content: tr("ui.pageCompte.monCompteBledway") },
      {
        property: "og:description",
        content: tr("ui.pageCompte.profilAvisEtSignalementsDe"),
      },
    ],
  }),
  component: AccountPage,
});

const reviewStatusLabels: Record<string, string> = {
  get pending() { return tr("ui.pageCompte.enAttenteDeModeration"); },
  get approved() { return tr("ui.pageCompte.valide"); },
  get published() { return tr("ui.pageCompte.publie"); },
  get rejected() { return tr("ui.pageCompte.refuse"); },
  get hidden() { return tr("ui.pageCompte.masque"); },
  get deleted() { return tr("ui.pageCompte.supprime"); },
};

const reportReasonLabels: Record<string, string> = {
  get wrong_schedule() { return tr("ui.pageCompte.horaireInexact"); },
  get outdated_info() { return tr("ui.pageCompte.informationObsolete"); },
  get missing_info() { return tr("ui.pageCompte.informationManquante"); },
  get inappropriate() { return tr("ui.pageCompte.contenuInapproprie"); },
  get other() { return tr("ui.pageCompte.autre"); },
};

const reportStatusLabels: Record<string, string> = {
  get new() { return tr("ui.pageCompte.recu"); },
  get in_progress() { return tr("ui.pageCompte.enCours"); },
  get resolved() { return tr("ui.pageCompte.traite"); },
  get rejected() { return tr("ui.pageCompte.ecarte"); },
};

function AccountPage() {
  const { user, profile, isAdmin, loading, refreshProfile, signOut } = useAuth();
  const [section, setSection] = useState("voyages");
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      // « #avatar » : l'onglet du profil, ouvert sur le choix de l'avatar (toucher son avatar ailleurs).
      if (hash === "avatar") {
        setSection("profil");
        window.history.replaceState(null, "", "/compte#profil");
        focusAvatarPicker();
        return;
      }
      setSection(["profil", "notifications", "contributions"].includes(hash) ? hash : "voyages");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (loading) {
    return <Centered>{tr("ui.pageCompte.chargement")}</Centered>;
  }

  if (!user) {
    return (
      <Centered>
        <p>{tr("ui.pageCompte.connectezVousPourAccederA")}</p>
        <Button asChild className="mt-3">
          <a href="/auth?next=%2Fcompte">{tr("ui.pageCompte.seConnecter")}</a>
        </Button>
      </Centered>
    );
  }

  return (
    <div className="bw-account-page">
      <header className="bw-account-header"><Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-primary"><ArrowLeft className="size-4"/>{tr("ui.pageCompte.retourALaCarte")}</Link><BrandPicture alt={tr("ui.pageCompte.bledway")} className="bw-brand-small h-9 w-auto"/><button type="button" onClick={() => void signOut()} aria-label={tr("ui.pageCompte.seDeconnecter")} className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"><LogOut className="size-4"/></button></header>
      <div className="bw-account-welcome"><EditableAvatar onEdit={() => { setSection("profil"); window.history.replaceState(null, "", "/compte#profil"); focusAvatarPicker(); }}><MyCabas fallback={(profile?.display_name || user.email || "V").slice(0, 1).toUpperCase()} /></EditableAvatar><div className="min-w-0"><span className="bw-account-kicker">{tr("ui.pageCompte.monEspaceVoyageur")}</span><h1>{tr("ui.pageCompte.bonjour")}{profile?.display_name ? ` ${profile.display_name.split(" ")[0]}` : ""}.</h1><p>{tr("ui.pageCompte.lesRetrouvaillesSePreparentIci")}</p></div></div>
      <Tabs value={section} onValueChange={(value) => { setSection(value); window.history.replaceState(null, "", `/compte${value === "voyages" ? "" : `#${value}`}`); }}>
        <TabsList className="bw-account-tabs" aria-label={tr("ui.pageCompte.monEspaceVoyageur")}>
          <TabsTrigger value="voyages"><Heart className="size-4"/>{tr("ui.pageCompte.mesVoyages")}</TabsTrigger><TabsTrigger value="notifications"><Bell className="size-4"/>{tr("ui.pageCompte.notifications")}</TabsTrigger><TabsTrigger value="profil"><UserRound className="size-4"/>{tr("ui.pageCompte.monProfil")}</TabsTrigger><TabsTrigger value="contributions"><MessageSquare className="size-4"/>{tr("ui.pageCompte.contributions")}</TabsTrigger>
        </TabsList>
        <TabsContent value="voyages"><MyTickets /><FollowCenter userId={user.id}/></TabsContent>
        <TabsContent value="notifications"><NotificationInbox userId={user.id}/><NotificationSettings userId={user.id}/></TabsContent>
        <TabsContent value="profil"><section className="bw-account-section"><h2 className="font-display text-xl font-semibold">{tr("ui.pageCompte.votreProfilVoyageur")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("ui.pageCompte.votreCabasVotrePseudoEt")}</p><MyTravellerEditor /><div className="mt-5 border-t border-border pt-4"><p className="text-xs text-muted-foreground">{tr("ui.pageCompte.adresseDeConnexionJamaisVisible")}</p><p className="mt-1 break-all text-sm font-medium">{user.email}</p><a href={`mailto:contact@bledway.com?subject=${encodeURIComponent("Suppression de mon compte BledWay")}&body=${encodeURIComponent(`Bonjour,\n\nJe demande la suppression complète de mon compte BledWay (${user.email}) et des données qui y sont rattachées.\n\nMerci.`)}`} className="mt-4 inline-flex text-xs font-semibold text-destructive underline">{tr("ui.pageCompte.supprimerMonCompte")}</a><p className="mt-1 text-xs text-muted-foreground">{tr("ui.pageCompte.ouvreUnEMailPrerempli")}<Link to="/confidentialite" hash="suppression-compte" className="underline">{tr("ui.pageCompte.enSavoirPlus")}</Link></p></div>{isAdmin && <Link to="/admin" className="mt-6 inline-flex text-xs font-semibold text-primary underline">{tr("ui.pageCompte.ouvrirLEspaceEquipe")}</Link>}</section></TabsContent>
        <TabsContent value="contributions"><section className="bw-account-section"><h2 className="font-display text-xl font-semibold">{tr("ui.pageCompte.mesContributions")}</h2><MyEntityReviews userId={user.id}/><MyReviews userId={user.id}/><MyReports userId={user.id}/></section></TabsContent>
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
      toast.success(tr("ui.pageCompte.avisSupprime"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <Card>
      <h3 className="text-sm font-semibold">{tr("ui.pageCompte.mesAvis")}</h3>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">{tr("ui.pageCompte.chargement")}</p>
      ) : reviews.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("ui.pageCompte.vousNAvezPasEncore")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {portName(review.port_id)}
                  <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                    {reviewStatusLabels[review.status] ?? review.status}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.comment ?? tr("ui.pageCompte.sansCommentaire")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(review.created_at)}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(review.id)}>
                {tr("ui.pageCompte.supprimer")}
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
        .select("id, target_type, reason, message, status, created_at, reply_text, reply_sent, replied_at")
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      // Colonnes de réponse du script du 27/11/2026, absentes des types générés.
      return data as unknown as {
        id: string;
        target_type: string;
        reason: string;
        message: string | null;
        status: string;
        created_at: string;
        reply_text: string | null;
        reply_sent: boolean | null;
        replied_at: string | null;
      }[];
    },
  });

  return (
    <Card>
      <h3 className="text-sm font-semibold">{tr("ui.pageCompte.mesSignalements")}</h3>
      <VigieProgress userId={userId} />
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">{tr("ui.pageCompte.chargement")}</p>
      ) : reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{tr("ui.pageCompte.aucunSignalementEnvoye")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {reports.map((report) => (
            <li key={report.id} className="py-3">
              <p className="text-sm font-medium">
                {reportReasonLabels[report.reason] ?? report.reason}
                <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                  {reportStatusLabels[report.status] ?? report.status}
                </span>
              </p>
              {report.message ? (
                <p className="mt-1 text-sm text-muted-foreground">{report.message}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(report.created_at)}</p>
              {report.reply_sent && report.reply_text ? (
                <div className="bw-report-reply" dir="auto">
                  <p className="text-xs font-semibold">{tr("ui.pageCompte.reponseEquipe")}</p>
                  <p className="text-sm">{report.reply_text}</p>
                  {report.replied_at ? (
                    <p className="text-xs text-muted-foreground">{formatDate(report.replied_at)}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
