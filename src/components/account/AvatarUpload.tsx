import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AvatarUpload({
  userId,
  onUploaded,
}: {
  userId: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choisissez une photo JPG, PNG ou WebP de moins de 2 Mo.");
      return;
    }
    setBusy(true);
    setError("");
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const result = await supabase.storage
      .from("bledway-avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) setError("Import impossible. Vérifiez la connexion et réessayez.");
    else onUploaded(supabase.storage.from("bledway-avatars").getPublicUrl(path).data.publicUrl);
    setBusy(false);
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="bw-action-secondary"
      >
        <Camera className="size-4" />
        {busy ? "Import en cours…" : "Choisir une photo"}
      </button>
      <input
        ref={inputRef}
        aria-label="Choisir une photo de profil"
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Photo publique · JPG, PNG ou WebP · 2 Mo max. Enregistrez ensuite votre profil.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
