import { adminRequest } from "./request";

export type ManagedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};
export type UsersPage = {
  total: number;
  members: ManagedUser[];
  audit: {
    actor_id: string | null;
    target_id: string | null;
    action: string;
    created_at: string;
  }[];
};
export async function userAdminAction<T>(input: Record<string, unknown>): Promise<T> {
  return adminRequest<T>("/api/admin-users", input);
}
