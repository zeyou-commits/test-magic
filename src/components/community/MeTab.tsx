import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  Eye,
  Heart,
  LogOut,
  Plus,
  Shield,
  Smile,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip, tripEnd } from "@/lib/ferry/myTrip";
import { myTripStatusQuery } from "@/lib/ferry/presence";
import {
  communityKey,
  moodsFor,
  moodsQuery,
  myTravellerQuery,
  openTravellerProfile,
  setMood,
} from "@/lib/community/travellers";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MoodBubble } from "./MoodBubble";
import { MoodPicker } from "./MoodPicker";
import { TravellerAvatar } from "./TravellerAvatar";

/** Le moment du voyage, pour proposer les bonnes humeurs : étape choisie, sinon d'après l'heure. */
function useMoment() {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const step = useQuery(myTripStatusQuery(trip?.departure.id ?? "", user?.id)).data ?? null;
  if (!trip) return null;
  if (step) return step;
  const now = Date.now();
  const start = Date.parse(trip.departure.departure_at);
  if (now < start - 36 * 3_600_000) return null;
  if (now < start) return "avant";
  return now < tripEnd(trip.departure) ? "onboard" : "arrived";
}

/**
 * Onglet « Moi » de la barre du bas (mobile) : mon cabas avec la bulle de mon humeur.
 * Un toucher ouvre le choix rapide de l'humeur et mon espace.
 */
export function MeTab({ className }: { className: string }) {
  const { user } = useAuth();
  const me = useQuery(myTravellerQuery(user?.id)).data;
  const [open, setOpen] = useState(false);
  if (!user || !me)
    return (
      <Link to={user ? "/compte" : "/auth"} className={className}>
        <span className="bw-me-tab__ghost" aria-hidden>
          <UserRound className="size-4" />
        </span>
        <span>{user ? "Mon espace" : "Connexion"}</span>
      </Link>
    );
  return (
    <>
      <span className="bw-me-tab__wrap">
      <button
        type="button"
        className={`${className} bw-me-tab`}
        onClick={() => setOpen(true)}
        aria-label={`Mon profil${me.mood ? ` · humeur : ${me.mood.label}` : " · ajouter une humeur"}`}
      >
        {/* L'avatar reste toujours le même ; l'humeur vit dans sa bulle (badge picto sur l'avatar). */}
        {me.mood ? null : (
          <span className="bw-me-tab__bubble" data-empty aria-hidden>
            <Plus size={11} />
          </span>
        )}
        <TravellerAvatar card={me} size={30} mood={false} static />
        <span>Moi</span>
      </button>
      <MoodBubble mood={me.mood} placement="above" />
      </span>
      <MeSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function MeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useQuery(myTravellerQuery(user?.id)).data;
  const moods = useQuery(moodsQuery).data ?? [];
  const moment = useMoment();
  const [all, setAll] = useState(false);
  const quick = moodsFor(moods, moment).slice(0, 6);
  const save = useMutation({
    mutationFn: (code: string | null) => setMood(code),
    onSuccess: (_, code) => {
      void client.invalidateQueries({ queryKey: communityKey });
      toast.success(code ? "Humeur partagée pour 24 h." : "Humeur retirée.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!me) return null;
  const close = () => onOpenChange(false);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="bw-me-sheet">
          <SheetHeader className="bw-me-sheet__head">
            <TravellerAvatar card={me} size={56} moodLabel static />
            <div>
              <SheetTitle>{me.pseudo}</SheetTitle>
              <SheetDescription>
                {me.mood ? "Votre humeur est visible pendant 24 h." : "Quelle est votre humeur ?"}
              </SheetDescription>
            </div>
          </SheetHeader>
          <div className="bw-me-sheet__moods">
            {quick.map((mood) => (
              <button
                key={mood.code}
                type="button"
                aria-pressed={me.mood?.code === mood.code}
                disabled={save.isPending}
                onClick={() => save.mutate(me.mood?.code === mood.code ? null : mood.code)}
              >
                <img src={mood.image} alt="" width={36} height={36} loading="lazy" />
                <span>
                  {mood.emoji ? `${mood.emoji} ` : ""}
                  {mood.label}
                </span>
              </button>
            ))}
          </div>
          <div className="bw-me-sheet__row">
            <button type="button" onClick={() => setAll(true)}>
              <Smile size={15} aria-hidden /> Toutes les humeurs
            </button>
            {me.mood ? (
              <button type="button" disabled={save.isPending} onClick={() => save.mutate(null)}>
                <X size={15} aria-hidden /> Retirer
              </button>
            ) : null}
          </div>
          <nav className="bw-me-sheet__links" aria-label="Mon espace">
            <Link to="/compte" hash="profil" onClick={close}>
              <UserRound size={16} aria-hidden /> Mon profil voyageur{" "}
              <ChevronRight size={15} aria-hidden />
            </Link>
            <Link to="/compte" onClick={close}>
              <Heart size={16} aria-hidden /> Mes voyages <ChevronRight size={15} aria-hidden />
            </Link>
            <Link to="/ma-bezass" onClick={close}>
              <Wallet size={16} aria-hidden /> Ma bezass <ChevronRight size={15} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => {
                close();
                openTravellerProfile(me.handle);
              }}
            >
              <Eye size={16} aria-hidden /> Mon profil public <ChevronRight size={15} aria-hidden />
            </button>
            <Link to="/compte" hash="notifications" onClick={close}>
              <Bell size={16} aria-hidden /> Mes notifications{" "}
              <ChevronRight size={15} aria-hidden />
            </Link>
            {roles.length ? (
              <Link to="/admin" onClick={close}>
                <Shield size={16} aria-hidden /> Back-office <ChevronRight size={15} aria-hidden />
              </Link>
            ) : null}
            {/* Le menu du compte n'est plus dans l'en-tête sur mobile : la déconnexion est ici. */}
            <button
              type="button"
              className="bw-me-sheet__logout"
              onClick={async () => {
                close();
                client.clear();
                await signOut();
                void navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut size={16} aria-hidden /> Se déconnecter
            </button>
          </nav>
        </SheetContent>
      </Sheet>
      <MoodPicker
        open={all}
        onOpenChange={setAll}
        moment={moment}
        current={me.mood?.code ?? null}
      />
    </>
  );
}
