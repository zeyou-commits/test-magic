import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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

function initials(name: string) {
  return name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!user) {
    return (
      <Button
        asChild
        size="sm"
        className="bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mon compte"
          className="rounded-full ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className={`${compact ? "size-6" : "size-9"} border border-border`}>
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={name} />
            ) : null}
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials(name) || "?"}
            </AvatarFallback>
          </Avatar>
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
        <DropdownMenuItem asChild>
          <Link to="/compte">Mon profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/compte" hash="contributions">
            Mes contributions
          </Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">Back-office</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
