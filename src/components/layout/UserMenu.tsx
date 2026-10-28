import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MoodPicker } from "@/components/community/MoodPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
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
import { avatarColors, myTravellerQuery, personaImage } from "@/lib/community/travellers";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const traveller = useQuery(myTravellerQuery(user?.id)).data;
  const [moodOpen, setMoodOpen] = useState(false);

  if (!user) {
    if (iconOnly) {
      return (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary"
          title="Se connecter"
        >
          <Link to="/auth" aria-label="Se connecter">
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
        <Link to="/auth">Se connecter</Link>
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              traveller?.mood ? `Mon compte · humeur : ${traveller.mood.label}` : "Mon compte"
            }
            className="relative rounded-full ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className={`${compact ? "size-8" : "size-9"} border border-border`}>
              {/* Mon cabas (profil voyageur) ; sans profil, les initiales. */}
              {traveller ? (
                <AvatarImage
                  src={personaImage(traveller.avatar)}
                  alt={traveller.pseudo}
                  style={{ background: avatarColors[traveller.color] }}
                  className="object-contain p-0.5"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initials(name) || "?"}
              </AvatarFallback>
            </Avatar>
            {traveller?.mood ? (
              <span className="bw-usermenu-mood" title={traveller.mood.label} aria-hidden>
                <img src={traveller.mood.image} alt="" width={14} height={14} />
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
                  <img
                    src={traveller.mood.image}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-full"
                  />
                  Mon humeur : {traveller.mood.label}
                </>
              ) : (
                "Mon humeur : en choisir une"
              )}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link to="/compte">Mon espace voyageur</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="voyages">
              Mes bateaux et traversées suivis
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="notifications">
              Mes notifications
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="profil">
              Mon profil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/compte" hash="contributions">
              Mes contributions
            </Link>
          </DropdownMenuItem>
          {roles.length ? (
            <DropdownMenuItem asChild>
              <Link to="/admin">Back-office</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleSignOut()}>Se déconnecter</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {traveller ? (
        <MoodPicker
          open={moodOpen}
          onOpenChange={setMoodOpen}
          moment={null}
          current={traveller.mood?.code ?? null}
        />
      ) : null}
    </>
  );
}
