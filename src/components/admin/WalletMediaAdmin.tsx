import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DENOMINATIONS } from "@/lib/wallet/wallet";
import { WALLET_MEDIA_BUCKET, walletMediaUrl, type WalletMediaRow, type WalletMediaSlot } from "@/lib/wallet/media";

const supabase = typedSupabase as unknown as SupabaseClient;
const notes = DENOMINATIONS.filter((item) => item.kind === "note");
const mimeExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function WalletMediaAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rows = [], error, isLoading } = useQuery({
    queryKey: ["admin", "wallet-media"],
    queryFn: async () => {
      const response = await supabase.from("bw_wallet_media").select("value,slot,storage_path,credit_label,credit_url,updated_at").order("value", { ascending: false });
      if (response.error) throw response.error;
      return response.data as WalletMediaRow[];
    },
  });
  const [value, setValue] = useState<number>(2000);
  const [slot, setSlot] = useState<WalletMediaSlot>("front");
  const [file, setFile] = useState<File | null>(null);
  const [creditLabel, setCreditLabel] = useState("");
  const [creditUrl, setCreditUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const current = rows.find((row) => row.value === value && row.slot === slot);
  const denomination = notes.find((item) => item.value === value);
  const officialImage = slot === "variant" && denomination && "variant" in denomination ? denomination.variant : denomination?.image;
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    setCreditLabel(current?.credit_label ?? "");
    setCreditUrl(current?.credit_url ?? "");
    setFile(null);
  }, [value, slot, current?.storage_path]);

  async function save() {
    if (!file || !user || busy) return;
    const ext = mimeExtensions[file.type];
    if (!ext || file.size > 3 * 1024 * 1024) { toast.error("Choisissez une image JPG, PNG ou WebP de 3 Mo maximum."); return; }
    if (!creditLabel.trim()) { toast.error("Indiquez le crédit de l’image."); return; }
    if (creditUrl.trim() && !/^https?:\/\//i.test(creditUrl.trim())) { toast.error("Le lien de crédit doit commencer par https://."); return; }
    setBusy(true);
    const path = `${value}/${slot}/${crypto.randomUUID()}.${ext}`;
    try {
      const upload = await supabase.storage.from(WALLET_MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "86400" });
      if (upload.error) throw upload.error;
      const saved = await supabase.from("bw_wallet_media").upsert({
        value, slot, storage_path: path, credit_label: creditLabel.trim(), credit_url: creditUrl.trim() || null,
        updated_at: new Date().toISOString(), updated_by: user.id,
      }, { onConflict: "value,slot" });
      if (saved.error) {
        await supabase.storage.from(WALLET_MEDIA_BUCKET).remove([path]);
        throw saved.error;
      }
      if (current?.storage_path && current.storage_path !== path) {
        await supabase.storage.from(WALLET_MEDIA_BUCKET).remove([current.storage_path]);
      }
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "wallet-media"] });
      toast.success("Visuel enregistré. Il apparaîtra dans Ma bezass après actualisation.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Impossible d’enregistrer l’image."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!current || busy) return;
    setBusy(true);
    try {
      const deleted = await supabase.from("bw_wallet_media").delete().eq("value", value).eq("slot", slot);
      if (deleted.error) throw deleted.error;
      await supabase.storage.from(WALLET_MEDIA_BUCKET).remove([current.storage_path]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "wallet-media"] });
      toast.success("Visuel retiré. Le lien officiel reprend le relais.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Impossible de retirer l’image."); }
    finally { setBusy(false); }
  }

  return <section className="bw-admin-surface mt-4 space-y-4 p-4 sm:p-6" aria-labelledby="wallet-media-title">
    <div><h2 id="wallet-media-title" className="text-xl font-bold">Images de Ma bezass</h2><p className="text-sm text-muted-foreground">Ajoutez une photo par valeur et, si besoin, une variante. Votre image prime sur le lien officiel. JPG, PNG ou WebP, 3 Mo maximum.</p></div>
    {error ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Gestion indisponible : appliquez la migration <code>20261108130000_bezass_media_admin.sql</code> dans Supabase.</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">{notes.map((note) => {
      const front = rows.find((row) => row.value === note.value && row.slot === "front");
      return <button key={note.value} type="button" onClick={() => { setValue(note.value); setSlot("front"); }} className={`rounded-xl border p-3 text-left ${value === note.value ? "border-emerald-600 bg-emerald-50" : "bg-white"}`} aria-pressed={value === note.value}>
        <strong className="block">{note.value.toLocaleString("fr-FR")} DA</strong><span className="text-xs text-muted-foreground">{front ? "Photo ajoutée" : "Lien officiel"}</span>
      </button>;
    })}</div>
    <div className="flex gap-2" role="group" aria-label="Face du billet"><button type="button" className={`rounded-lg border px-3 py-2 text-sm ${slot === "front" ? "bg-emerald-700 text-white" : "bg-white"}`} onClick={() => setSlot("front")}>Photo principale</button><button type="button" className={`rounded-lg border px-3 py-2 text-sm ${slot === "variant" ? "bg-emerald-700 text-white" : "bg-white"}`} onClick={() => setSlot("variant")}>Autre variante</button></div>
    <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
      <div className="grid min-h-40 place-items-center rounded-xl border bg-stone-50 p-3">{previewUrl || current || officialImage ? <img src={previewUrl || (current ? walletMediaUrl(current.storage_path) : officialImage) || ""} alt={`Aperçu du billet de ${value} dinars`} className="max-h-44 w-full object-contain" /> : <span className="text-sm text-muted-foreground">Aucun visuel</span>}</div>
      <div className="space-y-3">
        <label className="block text-sm font-semibold">Nouvelle image<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="block text-sm font-semibold">Crédit photo<input value={creditLabel} onChange={(event) => setCreditLabel(event.target.value)} placeholder="Ex. Banque d’Algérie" className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
        <label className="block text-sm font-semibold">Lien vers la source (facultatif)<input type="url" value={creditUrl} onChange={(event) => setCreditUrl(event.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={save} disabled={!file || busy || !!error} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><ImagePlus size={16} aria-hidden />{busy ? "Enregistrement…" : "Enregistrer l’image"}</button>{current ? <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 size={16} aria-hidden />Retirer</button> : null}</div>
      </div>
    </div>
    {isLoading ? <p className="text-sm text-muted-foreground">Chargement des visuels…</p> : null}
  </section>;
}
