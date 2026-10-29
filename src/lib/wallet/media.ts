import { supabase } from "@/integrations/supabase/client";

export const WALLET_MEDIA_BUCKET = "bledway-banknotes";
export type WalletMediaSlot = "front" | "variant";
export type WalletMediaRow = {
  value: number;
  slot: WalletMediaSlot;
  storage_path: string;
  credit_label: string;
  credit_url: string | null;
  updated_at: string;
};

export function walletMediaUrl(path: string) {
  return supabase.storage.from(WALLET_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
