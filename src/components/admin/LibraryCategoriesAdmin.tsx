import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CabasImg } from "@/components/CabasImg";
import { avatarsQuery } from "@/lib/community/avatars";
import {
  libraryCategoriesKey,
  libraryCategoriesQuery,
  normalizeSearch,
  type LibraryCategory,
} from "@/lib/community/library";
import { AdminDrawer } from "./AdminDrawer";

// Tables et fonction du script « bibliotheque_categories », absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const cleanLabel = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * Admin → Emojis et avatars → Catégories : le rangement de la bibliothèque. Une catégorie ne
 * restreint rien : elle aide les voyageurs à trouver une image (profil, humeur, salon).
 */
export function LibraryCategoriesAdmin() {
  const client = useQueryClient();
  const categoriesData = useQuery(libraryCategoriesQuery);
  const avatars = useQuery(avatarsQuery);
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<LibraryCategory | null>(null);
  const [deleting, setDeleting] = useState<LibraryCategory | null>(null);

  const categories = categoriesData.data?.categories ?? [];
  const links = categoriesData.data?.links ?? [];
  const rows = avatars.data?.rows ?? [];
  const countOf = (id: string) => links.filter((link) => link.category_id === id).length;
  const unsorted = rows.filter((row) => !links.some((link) => link.item_id === row.id)).length;
  const refresh = () => void client.invalidateQueries({ queryKey: libraryCategoriesKey });

  const create = useMutation({
    mutationFn: async () => {
      const label = cleanLabel(newLabel);
      if (!label || label.length > 40) throw new Error("Nom de 1 à 40 caractères.");
      const sort = Math.max(0, ...categories.map((category) => category.sort)) + 10;
      const { error } = await supabase.from("bw_library_categories").insert({ label, sort });
      if (error)
        throw new Error(
          error.code === "23505" ? "Une catégorie porte déjà ce nom." : error.message,
        );
    },
    onSuccess: () => {
      setNewLabel("");
      refresh();
      toast.success("Catégorie créée : ajoutez-y des images.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Monter / descendre : on échange l'ordre avec la voisine.
  const move = useMutation({
    mutationFn: async ({ index, delta }: { index: number; delta: number }) => {
      const a = categories[index];
      const b = categories[index + delta];
      if (!a || !b) return;
      const sortA = a.sort === b.sort ? b.sort + delta : b.sort;
      for (const [id, sort] of [
        [a.id, sortA],
        [b.id, a.sort],
      ] as const) {
        const { error } = await supabase
          .from("bw_library_categories")
          .update({ sort, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  if (categoriesData.data && !categoriesData.data.managed)
    return (
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>Catégories</strong> : exécutez le script <code>bibliotheque_categories</code> dans
        Supabase pour créer, renommer ou supprimer des catégories et y ranger les images.
      </section>
    );

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold">Catégories</h3>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Input
            value={newLabel}
            maxLength={40}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Nouvelle catégorie"
            aria-label="Nom de la nouvelle catégorie"
            className="max-w-56"
          />
          <Button type="submit" disabled={create.isPending || !cleanLabel(newLabel)}>
            <FolderPlus className="size-4" /> Créer
          </Button>
        </form>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Les catégories servent seulement à ranger : chaque voyageur peut choisir n’importe quelle
        image comme avatar, comme humeur ou dans un salon. Une image peut être dans plusieurs
        catégories.
      </p>
      <ul className="mt-3 divide-y rounded-xl border bg-white">
        {categories.map((category, index) => (
          <li key={category.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`Monter ${category.label}`}
                disabled={index === 0 || move.isPending}
                onClick={() => move.mutate({ index, delta: -1 })}
                className="text-muted-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Descendre ${category.label}`}
                disabled={index === categories.length - 1 || move.isPending}
                onClick={() => move.mutate({ index, delta: 1 })}
                className="text-muted-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
            </div>
            <strong className="text-sm">{category.label}</strong>
            <span className="text-xs text-muted-foreground">
              {countOf(category.id)} image{countOf(category.id) > 1 ? "s" : ""}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setEditing(category)}>
              <Pencil className="size-3.5" /> Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Supprimer ${category.label}`}
              onClick={() => setDeleting(category)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
        <li className="px-3 py-2 text-xs text-muted-foreground">
          Sans catégorie : {unsorted} image{unsorted > 1 ? "s" : ""} (toujours proposée
          {unsorted > 1 ? "s" : ""} aux voyageurs, dans « Sans catégorie »).
        </li>
      </ul>
      {editing ? (
        <CategoryEditor
          key={editing.id}
          category={editing}
          taken={categories.filter((c) => c.id !== editing.id).map((c) => c.label)}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {deleting ? (
        <CategoryDelete
          key={deleting.id}
          category={deleting}
          count={countOf(deleting.id)}
          others={categories.filter((c) => c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDone={refresh}
        />
      ) : null}
    </section>
  );
}

/** Renommer une catégorie et choisir ses images (cocher = ajouter, décocher = retirer). */
function CategoryEditor({
  category,
  taken,
  onClose,
  onSaved,
}: {
  category: LibraryCategory;
  taken: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const categoriesData = useQuery(libraryCategoriesQuery);
  const rows = useQuery(avatarsQuery).data?.rows ?? [];
  const initial = useMemo(
    () =>
      new Set(
        (categoriesData.data?.links ?? [])
          .filter((link) => link.category_id === category.id)
          .map((link) => link.item_id),
      ),
    [categoriesData.data, category.id],
  );
  const [label, setLabel] = useState(category.label);
  const [chosen, setChosen] = useState<Set<string>>(initial);
  const [search, setSearch] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const query = normalizeSearch(search);
  const visible = rows.filter(
    (row) =>
      (!onlyChosen || chosen.has(row.id)) &&
      (!query || normalizeSearch(`${row.label} ${row.id}`).includes(query)),
  );

  const save = useMutation({
    mutationFn: async () => {
      const text = cleanLabel(label);
      if (!text || text.length > 40) throw new Error("Nom de 1 à 40 caractères.");
      if (taken.some((other) => normalizeSearch(other) === normalizeSearch(text)))
        throw new Error("Une catégorie porte déjà ce nom.");
      if (text !== category.label) {
        const { error } = await supabase
          .from("bw_library_categories")
          .update({ label: text, updated_at: new Date().toISOString() })
          .eq("id", category.id);
        if (error) throw new Error(error.message);
      }
      const added = [...chosen].filter((id) => !initial.has(id));
      const removed = [...initial].filter((id) => !chosen.has(id));
      if (added.length) {
        const sortOf = new Map(rows.map((row) => [row.id, row.sort]));
        const { error } = await supabase.from("bw_library_category_items").upsert(
          added.map((item_id) => ({
            category_id: category.id,
            item_id,
            sort: sortOf.get(item_id) ?? 100,
          })),
          { onConflict: "category_id,item_id", ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
      }
      if (removed.length) {
        const { error } = await supabase
          .from("bw_library_category_items")
          .delete()
          .eq("category_id", category.id)
          .in("item_id", removed);
        if (error) throw new Error(error.message);
      }
      return { added: added.length, removed: removed.length };
    },
    onSuccess: ({ added, removed }) => {
      onSaved();
      toast.success(
        added || removed
          ? `Catégorie enregistrée : ${added} ajoutée${added > 1 ? "s" : ""}, ${removed} retirée${removed > 1 ? "s" : ""}.`
          : "Catégorie enregistrée.",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={category.label}
      description={`${chosen.size} image${chosen.size > 1 ? "s" : ""} dans cette catégorie. Retirer une image de la catégorie ne la supprime pas de la bibliothèque.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Nom
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chercher une image"
            aria-label="Chercher une image"
            className="max-w-56"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={onlyChosen}
              onChange={(event) => setOnlyChosen(event.target.checked)}
            />
            Seulement celles de la catégorie
          </label>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
          {visible.map((row) => (
            <li key={row.id}>
              <label
                className={`relative grid cursor-pointer justify-items-center gap-1 rounded-xl border p-2 text-center text-[11px] ${chosen.has(row.id) ? "border-emerald-700 bg-emerald-50" : "bg-white"} ${row.active ? "" : "opacity-55"}`}
              >
                <input
                  type="checkbox"
                  className="absolute left-1.5 top-1.5"
                  checked={chosen.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={row.label}
                />
                <CabasImg
                  src={row.image}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  className="size-12 object-contain"
                />
                <span className="w-full truncate font-medium">{row.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {!visible.length ? (
          <p className="text-sm text-muted-foreground">Aucune image ne correspond.</p>
        ) : null}
      </div>
    </AdminDrawer>
  );
}

/** Supprimer une catégorie : ses images vont dans une autre catégorie ou restent sans catégorie. */
function CategoryDelete({
  category,
  count,
  others,
  onClose,
  onDone,
}: {
  category: LibraryCategory;
  count: number;
  others: LibraryCategory[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bw_delete_library_category", {
        p_id: category.id,
        p_move_to: target || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      onDone();
      const destination = others.find((other) => other.id === target)?.label;
      toast.success(
        count && destination
          ? `Catégorie supprimée : ses images sont dans « ${destination} ».`
          : "Catégorie supprimée. Aucune image n'a été supprimée.",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={`Supprimer « ${category.label} »`}
      description="Les images ne sont jamais supprimées avec leur catégorie : les voyageurs peuvent toujours les choisir."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Supprimer la catégorie
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-sm">
        {count ? (
          <>
            <p>
              Cette catégorie contient {count} image{count > 1 ? "s" : ""}. Que deviennent-
              {count > 1 ? "elles" : "elle"} ?
            </p>
            <label className="grid gap-1.5 font-medium">
              Les ranger dans
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="h-9 rounded-md border bg-white px-2 text-sm"
              >
                <option value="">
                  Aucune autre catégorie (elles restent dans leurs autres catégories, sinon dans «
                  Sans catégorie »)
                </option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <p>Cette catégorie est vide.</p>
        )}
      </div>
    </AdminDrawer>
  );
}
