import { CabasImg } from "@/components/CabasImg";
import { useAuthNext } from "@/lib/authReturn";
import { Link, useNavigate } from "@tanstack/react-router";
import { openVoyage } from "@/lib/ferry/voyageTrip";
import { useState } from "react";
import { MoodBubble } from "@/components/community/MoodBubble";
import { MoodPicker } from "@/components/community/MoodPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Route as RouteIcon, UserRound, Wallet } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNoticeCount } from "@/components/panel/FlashCenter";
import { avatarColors, moodIcon, myTravellerQuery } from "@/lib/community/travellers";
import { useAvatarImage } from "@/lib/community/avatars";
import { useIllustrationUrl } from "@/lib/illustrations/store";
import { tr } from "@/lib/i18n";

function initials(name: string) {
  return name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { user, profile, roles, signOut } = useAuth();
  const authNext = useAuthNext();
  const unread = useUnreadNoticeCount(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const traveller = useQuery(myTravellerQuery(user?.id)).data;
  // Mon avatar, dans sa version remplacée par l'équipe s'il y a lieu.
  const avatarSrc = useIllustrationUrl(useAvatarImage(traveller?.avatar ?? "lina"));
  const [moodOpen, setMoodOpen] = useState(false);

  if (!user) {
    if (iconOnly) {
      return (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary"
          title={tr("ui.userMenu.seConnecter")}
        >
          <Link to="/auth" search={{ next: authNext } as never} aria-label={tr("ui.userMenu.seConnecter")}>
            <UserRound className="size-5" />
          </Link>
        </Button>
      );
    }
    return (
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="bw-account-link font-semibold text-foreground hover:bg-secondary"
      >
        <Link to="/auth" search={{ next: authNext } as never}>{tr("ui.userMenu.seConnecter")}</Link>
      </Button>
    );
  }

  const name = profile?.display_name?.trim() || user.email?.split("@")[0] || "Mon compte";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <span className="relative inline-flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              traveller?.mood ? `Mon compte · humeur : ${traveller.mood.label}` : tr("ui.userMenu.monCompte")
            }
            className="bw-usermenu-trigger relative flex items-center gap-2 rounded-full ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className={`${compact ? "size-8" : "size-9"} border border-border`}>
              {/* Mon cabas (profil voyageur) ; sans profil, les initiales. */}
              {traveller ? (
                <AvatarImage
                  src={avatarSrc}
                  alt={traveller.pseudo}
                  style={{ background: avatarColors[traveller.color] }}
                  className="object-contain p-0.5"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initials(name) || "?"}
              </AvatarFallback>
            </Avatar>
            {unread ? (
              <span className="bw-usermenu-badge" aria-hidden>
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {traveller ? (
            <DropdownMenuItem onSelect={() => setMoodOpen(true)}>
              {traveller.mood ? (
                <>
                  <CabasImg
                    src={moodIcon(traveller.mood.code) ?? traveller.mood.image}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-full"
                  />
                  {tr("ui.userMenu.monHumeur")}{traveller.mood.label}
                </>
              ) : (
                tr("ui.userMenu.monHumeurEnChoisirUne")
              )}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link to="/compte">{tr("ui.userMenu.monEspaceVoyageur")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/" search={{ voyage: 1 } as never} onClick={openVoyage}>
              <RouteIcon size={16} aria-hidden />{tr("ui.userMenu.monVoyage")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/mes-dinars">
              <Wallet size={16} aria-hidden />{tr("ui.userMenu.mesDinars")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="voyages">
              {tr("ui.userMenu.mesNaviresEtTraverseesSuivis")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="notifications">
              {tr("ui.userMenu.mesNotifications")}
              {unread ? <span className="bw-usermenu-count">{unread}</span> : null}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="profil">
              {tr("ui.userMenu.monProfil")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="contributions">
              {tr("ui.userMenu.mesContributions")}
            </Link>
          </DropdownMenuItem>
          {roles.length ? (
            <DropdownMenuItem asChild>
              <Link to="/admin">{tr("ui.userMenu.backOffice")}</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleSignOut()}>{tr("ui.userMenu.seDeconnecter")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Bulle d'humeur sous l'avatar, réduite en badge après quelques secondes. */}
      {traveller ? <MoodBubble mood={traveller.mood} placement="below" /> : null}
      {traveller ? (
        <MoodPicker
          open={moodOpen}
          onOpenChange={setMoodOpen}
          moment={null}
          current={traveller.mood?.code ?? null}
          currentImage={traveller.mood?.image ?? null}
        />
      ) : null}
    </span>
  );
}
