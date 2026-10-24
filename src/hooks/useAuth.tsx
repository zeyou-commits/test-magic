import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** Rôles d'équipe (admin, editor, moderator). */
  roles: string[];
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  roles: [],
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesOwner, setRolesOwner] = useState<string | null>(null);
  const isAdmin = roles.includes("admin");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data ?? null);
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!userId) {
      setRoles([]);
      setRolesOwner(null);
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (active) {
          setRoles((data ?? []).map((r) => r.role).filter((r) => r !== "user"));
          setRolesOwner(userId);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        isAdmin,
        roles,
        loading: loading || Boolean(userId && rolesOwner !== userId),
        refreshProfile: loadProfile,
        signOut: async () => {
          if (session?.user && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
            try {
              const registration = await navigator.serviceWorker.getRegistration("/sw.js");
              const subscription = await registration?.pushManager.getSubscription();
              if (subscription) {
                await supabase.from("bw_push_subscriptions").delete().eq("user_id", session.user.id).eq("endpoint", subscription.endpoint);
                await subscription.unsubscribe();
              }
            } catch { /* la déconnexion doit rester possible */ }
          }
          await supabase.auth.signOut();
          queryClient.clear();
          setProfile(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
