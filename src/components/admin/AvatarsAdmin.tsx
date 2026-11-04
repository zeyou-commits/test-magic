import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CabasImg } from "@/components/CabasImg";
import {
  avatarKinds,
  avatarsKey,
  avatarsQuery,
  type AvatarKind,
  type AvatarRow,
} from "@/lib/community/avatars";
import { communityKey } from "@/lib/community/travellers";
import type { IllustrationSlot } from "@/lib/illustrations/catalog";
import type { PreparedIllustration } from "@/lib/illustrations/prepare";
import { illustrationFileUrl, ILLUSTRATIONS_BUCKET } from "@/lib/illustrations/store";
import { AdminDrawer, matches } from "./AdminDrawer";
import { FramingControls, useFramedIllustration } from "./FramingControls";

// Table et fonctions du script « avatars_admin », absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
const USAGE_KEY = ["admin", "avatar-usage"];

/** Même format que les personnages : détouré, centré, 384 px. */
const AVATAR_FORMAT: IllustrationSlot = {
  src: "",
  file: "avatar",
  name: "Avatar",
  category: "persos",
  size: 384,
  margin: 0.025,
  shownAt: [22, 40, 56, 84],
};

/** « Tata Houria » devient « tata_houria » ; un suffixe évite les doublons. */
function newId(label: string, taken: Set<string>) {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 34) || "avatar";
  let id = base.length < 2 ? `avatar_${base}` : base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`;
  return id;
}

async function uploadAvatar(id: string, prepared: PreparedIllustration) {
  const ext = prepared.blob.type === "image/png" ? "png" : "webp";
  const path = `avatars-ajoutes/${id}-${crypto.randomUUID()}.${ext}`;
  const upload = await supabase.storage
    .from(ILLUSTRATIONS_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.blob.type, cacheControl: "31536000" });
  if (upload.error) throw new Error(upload.error.message);
  return { path, url: illustrationFileUrl(path) };
}

/**
 * Admin → Illustrations → Avatars : la liste proposée aux voyageurs. Ajouter (image détourée),
 * renommer, retirer du choix ou supprimer. Les images du site se remplacent dans la liste
 * « Illustrations » juste en dessous.
 */
export function AvatarsAdmin() {
  const client = useQueryClient();
  const list = useQuery(avatarsQuery);
  const usage = useQuery({
    queryKey: USAGE_KEY,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_avatar_usage");
      if (error) throw new Error(error.message);
      return data as Record<string, number>;
    },
  });
  const [kind, setKind] = useState<AvatarKind | "tous">("tous");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AvatarRow | "new" | null>(null);

  const rows = list.data?.rows ?? [];
  const refresh = () => {
    void client.invalidateQueries({ queryKey: avatarsKey });
    void client.invalidateQueries({ queryKey: USAGE_KEY });
    void client.invalidateQueries({ queryKey: communityKey });
  };
  const visible = rows.filter(
    (row) => (kind === "tous" || row.kind === kind) && matches(search, row.label, row.id),
  );

  if (list.data && !list.data.managed)
    return (
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>Avatars</strong> : exécutez le script <code>avatars_admin</code> dans Supabase pour
        ajouter, renommer ou supprimer des avatars, et proposer les humeurs aux voyageurs.
      </section>
    );

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold">Avatars proposés aux voyageurs</h3>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Chercher un avatar"
          className="max-w-56"
        />
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Ajouter un avatar
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Type d'avatar">
        {(["tous", ...Object.keys(avatarKinds)] as (AvatarKind | "tous")[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === id ? "border-emerald-700 bg-emerald-700 text-white" : "bg-white"}`}
          >
            {id === "tous" ? "Tous" : avatarKinds[id]} (
            {id === "tous" ? rows.length : rows.filter((row) => row.kind === id).length})
          </button>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
        {visible.map((row) => {
          const used = usage.data?.[row.id] ?? 0;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setEditing(row)}
                className={`w-full overflow-hidden rounded-xl border bg-white p-2 text-left hover:border-emerald-700 ${row.active ? "" : "opacity-55"}`}
              >
                <CabasImg
                  src={row.image}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  className="mx-auto size-14 object-contain"
                />
                <strong className="mt-1 block truncate text-xs">{row.label}</strong>
                <small className="block text-[11px] text-muted-foreground">
                  {row.active ? `${used} voyageur${used > 1 ? "s" : ""}` : "Retiré du choix"}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      {!visible.length && list.data ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucun avatar ne correspond.</p>
      ) : null}
      {editing ? (
        <AvatarEditor
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          used={editing === "new" ? 0 : (usage.data?.[editing.id] ?? 0)}
          taken={new Set(rows.map((row) => row.id))}
          nextSort={
            Math.max(0, ...rows.filter((row) => row.kind !== "mood").map((row) => row.sort)) + 10
          }
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </section>
  );
}

function AvatarEditor({
  row,
  used,
  taken,
  nextSort,
  onClose,
  onSaved,
}: {
  row: AvatarRow | null;
  used: number;
  taken: Set<string>;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [kind, setKind] = useState<AvatarKind>(row?.kind ?? "other");
  const [active, setActive] = useState(row?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [keepBackground, setKeepBackground] = useState(false);
  // Détourage une fois, puis cadrage (zoom, position) réglable.
  const { prepared, problem, framing, setFraming, ready } = useFramedIllustration(
    file,
    AVATAR_FORMAT,
    keepBackground,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Les images du site (/cabas/…) se remplacent dans « Illustrations », pas ici.
  const uploaded = !row || row.image.startsWith("https://");

  const save = useMutation({
    mutationFn: async () => {
      const text = label.trim().replace(/\s+/g, " ");
      if (!text || text.length > 40) throw new Error("Nom de 1 à 40 caractères.");
      if (!row) {
        if (!prepared) throw new Error("Choisissez une image.");
        const id = newId(text, taken);
        const image = await uploadAvatar(id, prepared);
        const { error } = await supabase.from("bw_avatars").insert({
          id,
          label: text,
          kind,
          image: image.url,
          storage_path: image.path,
          sort: nextSort,
          active,
        });
        if (error) {
          await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([image.path]);
          throw new Error(error.message);
        }
        return;
      }
      const image = prepared && uploaded ? await uploadAvatar(row.id, prepared) : null;
      const { error } = await supabase
        .from("bw_avatars")
        .update({
          label: text,
          kind: row.kind === "mood" ? "mood" : kind,
          active,
          updated_at: new Date().toISOString(),
          ...(image ? { image: image.url, storage_path: image.path } : {}),
        })
        .eq("id", row.id);
      if (error) {
        if (image) await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([image.path]);
        throw new Error(error.message);
      }
      if (image && row.storage_path) {
        await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([row.storage_path]);
      }
    },
    onSuccess: () => {
      onSaved();
      toast.success(row ? "Avatar enregistré." : "Avatar ajouté : il est proposé aux voyageurs.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!row) return 0;
      const { data, error } = await supabase.rpc("bw_delete_avatar", { p_id: row.id });
      if (error) throw new Error(error.message);
      if (row.storage_path) {
        await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([row.storage_path]);
      }
      return data as number;
    },
    onSuccess: (moved) => {
      onSaved();
      toast.success(
        moved
          ? `Avatar supprimé. ${moved} voyageur${moved > 1 ? "s ont" : " a"} reçu le premier personnage.`
          : "Avatar supprimé.",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = prepared?.url ?? row?.image ?? null;
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={row ? row.label : "Nouvel avatar"}
      description={
        row
          ? `${avatarKinds[row.kind]} · ${used} voyageur${used > 1 ? "s l'utilisent" : " l'utilise"}`
          : "Il sera proposé aux voyageurs dans « Mon profil ». Image détourée et centrée automatiquement."
      }
      footer={
        <>
          {row ? (
            confirmDelete ? (
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Confirmer la suppression
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Supprimer
              </Button>
            )
          ) : null}
          <span className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={save.isPending || (Boolean(file) && !prepared)}
            onClick={() => save.mutate()}
          >
            {row ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {confirmDelete && row ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
          >
            {used
              ? `${used} voyageur${used > 1 ? "s utilisent" : " utilise"} cet avatar : ${used > 1 ? "ils recevront" : "il recevra"} le premier personnage de la liste.`
              : "Personne n'utilise cet avatar."}{" "}
            {row.image.startsWith("/cabas/")
              ? "L'image reste dans le site. Pour le garder sans le proposer, décochez plutôt « Proposé aux voyageurs »."
              : "Son image sera effacée."}
          </p>
        ) : null}
        {preview ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border">
            {["bg-white", "bg-[#141c24]"].map((background) => (
              <div key={background} className={`grid place-items-center p-3 ${background}`}>
                {prepared ? (
                  <img src={preview} alt="" width={84} height={84} />
                ) : (
                  <CabasImg src={preview} alt="" width={84} height={84} />
                )}
              </div>
            ))}
          </div>
        ) : null}
        {prepared?.alerts.map((alert) => (
          <p key={alert} className="text-xs text-amber-800">
            {alert}
          </p>
        ))}
        {problem ? (
          <p className="text-sm text-red-700" role="alert">
            {problem}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          Nom
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {row?.kind !== "mood" ? (
          <label className="grid gap-1.5 text-sm font-medium">
            Rangé dans
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AvatarKind)}
              className="h-9 rounded-md border bg-white px-2 text-sm"
            >
              <option value="persona">Personnages</option>
              <option value="other">Ajoutés par l'équipe</option>
            </select>
          </label>
        ) : null}
        {uploaded ? (
          <>
            <label className="grid gap-1.5 text-sm font-medium">
              {row ? "Nouvelle image" : "Image"}
              <input
                type="file"
                accept="image/*"
                className="rounded-lg border bg-white p-2 text-sm"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepBackground}
                onChange={(event) => setKeepBackground(event.target.checked)}
              />
              Garder le fond de l'image
            </label>
            {file && ready ? <FramingControls framing={framing} onChange={setFraming} /> : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Image du site : elle se remplace dans la liste « Illustrations » ci-dessous.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Proposé aux voyageurs
        </label>
        {!active && used ? (
          <p className="text-xs text-muted-foreground">
            Ceux qui l'ont déjà le gardent ; il n'est simplement plus proposé.
          </p>
        ) : null}
      </div>
    </AdminDrawer>
  );
}
