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
import {
  libraryCategoriesKey,
  libraryCategoriesQuery,
  UNSORTED,
  UNSORTED_LABEL,
  type LibraryCategory,
} from "@/lib/community/library";
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
 * Admin → Emojis et avatars → Bibliothèque : toutes les images proposées aux voyageurs, comme
 * avatar, comme humeur et dans les salons. Ajouter (image détourée), renommer, ranger dans des
 * catégories, retirer du choix ou supprimer. Les images du site se remplacent dans « Illustrations ».
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
  const categoriesData = useQuery(libraryCategoriesQuery);
  const [kind, setKind] = useState<string>("tous");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AvatarRow | "new" | null>(null);

  const rows = list.data?.rows ?? [];
  const sorted = categoriesData.data?.managed ?? false;
  const categories = categoriesData.data?.categories ?? [];
  const links = categoriesData.data?.links ?? [];
  const linked = new Set(links.map((link) => link.item_id));
  // Filtres : catégories (script du 08/11/2026), sinon les anciens types.
  const filters: { id: string; label: string; has: (row: AvatarRow) => boolean }[] = sorted
    ? [
        ...categories.map((category) => ({
          id: category.id,
          label: category.label,
          has: (row: AvatarRow) =>
            links.some((link) => link.category_id === category.id && link.item_id === row.id),
        })),
        { id: UNSORTED, label: UNSORTED_LABEL, has: (row: AvatarRow) => !linked.has(row.id) },
      ]
    : (Object.keys(avatarKinds) as AvatarKind[]).map((id) => ({
        id,
        label: avatarKinds[id],
        has: (row: AvatarRow) => row.kind === id,
      }));
  const filter = filters.find((item) => item.id === kind);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: avatarsKey });
    void client.invalidateQueries({ queryKey: libraryCategoriesKey });
    void client.invalidateQueries({ queryKey: USAGE_KEY });
    void client.invalidateQueries({ queryKey: communityKey });
  };
  const visible = rows.filter(
    (row) => (!filter || filter.has(row)) && matches(search, row.label, row.id),
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
        <h3 className="mr-auto text-base font-semibold">
          Bibliothèque : avatars, humeurs et émoticônes des salons
        </h3>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Chercher une image"
          className="max-w-56"
        />
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Ajouter une image
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Chaque image active se choisit partout : avatar du profil, humeur, salons.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Catégorie">
        {[{ id: "tous", label: "Toutes", has: () => true }, ...filters].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            onClick={() => setKind(item.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === item.id ? "border-emerald-700 bg-emerald-700 text-white" : "bg-white"}`}
          >
            {item.label} ({rows.filter(item.has).length})
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
        <p className="mt-3 text-sm text-muted-foreground">Aucune image ne correspond.</p>
      ) : null}
      {editing ? (
        <AvatarEditor
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          used={editing === "new" ? 0 : (usage.data?.[editing.id] ?? 0)}
          taken={new Set(rows.map((row) => row.id))}
          categories={sorted ? categories : null}
          initialCategories={
            editing === "new"
              ? sorted && kind !== "tous" && kind !== UNSORTED
                ? [kind]
                : []
              : links.filter((link) => link.item_id === editing.id).map((link) => link.category_id)
          }
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
  categories,
  initialCategories,
  nextSort,
  onClose,
  onSaved,
}: {
  row: AvatarRow | null;
  used: number;
  taken: Set<string>;
  /** Catégories de la bibliothèque (null sans le script du 08/11/2026). */
  categories: LibraryCategory[] | null;
  initialCategories: string[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [kind, setKind] = useState<AvatarKind>(row?.kind ?? "other");
  const [active, setActive] = useState(row?.active ?? true);
  const [chosen, setChosen] = useState<string[]>(initialCategories);
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

  // Catégories cochées : ajoute les nouvelles, retire les décochées (l'image reste dans la bibliothèque).
  const saveCategories = async (id: string) => {
    if (!categories) return;
    const added = chosen.filter((category) => !initialCategories.includes(category));
    const removed = initialCategories.filter((category) => !chosen.includes(category));
    if (added.length) {
      const { error } = await supabase.from("bw_library_category_items").upsert(
        added.map((category_id) => ({ category_id, item_id: id, sort: row?.sort ?? nextSort })),
        { onConflict: "category_id,item_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    }
    if (removed.length) {
      const { error } = await supabase
        .from("bw_library_category_items")
        .delete()
        .eq("item_id", id)
        .in("category_id", removed);
      if (error) throw new Error(error.message);
    }
  };
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
        await saveCategories(id);
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
      await saveCategories(row.id);
    },
    onSuccess: () => {
      onSaved();
      toast.success(
        row ? "Image enregistrée." : "Image ajoutée : elle est proposée aux voyageurs.",
      );
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
          ? `Image supprimée. ${moved} voyageur${moved > 1 ? "s ont" : " a"} reçu le premier personnage comme avatar.`
          : "Image supprimée.",
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
      title={row ? row.label : "Nouvelle image"}
      description={
        row
          ? `${used} voyageur${used > 1 ? "s l'utilisent" : " l'utilise"} comme avatar`
          : "Elle sera proposée aux voyageurs : avatar, humeur et salons. Image détourée et centrée automatiquement."
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
              ? `${used} voyageur${used > 1 ? "s utilisent" : " utilise"} cette image comme avatar : ${used > 1 ? "ils recevront" : "il recevra"} le premier personnage de la liste.`
              : "Personne ne l'utilise comme avatar."}{" "}
            Une humeur faite avec cette image disparaît aussi.{" "}
            {row.image.startsWith("/cabas/")
              ? "L'image reste dans le site. Pour la garder sans la proposer, décochez plutôt « Proposée aux voyageurs »."
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
        {categories ? (
          <fieldset className="grid gap-1.5 text-sm">
            <legend className="mb-1 font-medium">Catégories (pour ranger, sans restreindre)</legend>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => {
                const on = chosen.includes(category.id);
                return (
                  <label
                    key={category.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-emerald-700 bg-emerald-50" : "bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setChosen((current) =>
                          on
                            ? current.filter((id) => id !== category.id)
                            : [...current, category.id],
                        )
                      }
                    />
                    {category.label}
                  </label>
                );
              })}
            </div>
            {!chosen.length ? (
              <small className="text-xs text-muted-foreground">
                Sans catégorie : elle reste proposée, dans « Sans catégorie ».
              </small>
            ) : null}
          </fieldset>
        ) : row?.kind !== "mood" ? (
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
          Proposée aux voyageurs
        </label>
        {!active && used ? (
          <p className="text-xs text-muted-foreground">
            Ceux qui l'ont déjà la gardent ; elle n'est simplement plus proposée.
          </p>
        ) : null}
      </div>
    </AdminDrawer>
  );
}
