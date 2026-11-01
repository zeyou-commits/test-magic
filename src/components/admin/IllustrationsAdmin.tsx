import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { communityKey, moodsQuery } from "@/lib/community/travellers";
import { tripStepsQuery } from "@/lib/ferry/presence";
import {
  categories,
  illustrationSlots,
  slotForFileName,
  type IllustrationCategory,
  type IllustrationSlot,
} from "@/lib/illustrations/catalog";
import { prepareIllustration, type PreparedIllustration } from "@/lib/illustrations/prepare";
import {
  fetchIllustrations,
  illustrationFileUrl,
  ILLUSTRATIONS_BUCKET,
  type IllustrationRow,
} from "@/lib/illustrations/store";
import { AdminDrawer, matches } from "./AdminDrawer";

// Table et stockage absents des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const QUERY_KEY = ["admin", "illustrations"];
const SLOT_BY_SRC = new Map(illustrationSlots.map((slot) => [slot.src, slot]));

type ImportRow = {
  id: string;
  file: File;
  src: string | null;
  keepBackground: boolean;
  prepared: PreparedIllustration | null;
  error: string | null;
};

/** Envoie l'image puis retire l'ancienne : un nom de fichier neuf évite tout cache périmé. */
async function saveImage(
  slot: IllustrationSlot,
  prepared: PreparedIllustration,
  current: IllustrationRow | undefined,
  userId: string | undefined,
) {
  const ext = prepared.blob.type === "image/png" ? "png" : "webp";
  const path = `${slot.category}/${slot.file}-${crypto.randomUUID()}.${ext}`;
  const upload = await supabase.storage
    .from(ILLUSTRATIONS_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.blob.type, cacheControl: "31536000" });
  if (upload.error) throw new Error(upload.error.message);
  const saved = await supabase.from("bw_illustrations").upsert({
    src: slot.src,
    storage_path: path,
    label: current?.label ?? null,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  });
  if (saved.error) {
    await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([path]);
    throw new Error(saved.error.message);
  }
  if (current?.storage_path) {
    await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([current.storage_path]);
  }
}

/** La même image aux tailles réelles de l'app, sur fond clair puis sombre. */
function RealSizes({ src, slot }: { src: string; slot: IllustrationSlot }) {
  return (
    <div className="grid overflow-hidden rounded-xl border">
      {["bg-white", "bg-[#141c24]"].map((background) => (
        <div key={background} className={`flex min-h-24 items-center gap-3 p-3 ${background}`}>
          {[...slot.shownAt, 88].map((size) => (
            <img key={size} src={src} alt="" width={size} height={size} className="shrink-0" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function IllustrationsAdmin() {
  const { user } = useAuth();
  const client = useQueryClient();
  const list = useQuery({ queryKey: QUERY_KEY, queryFn: fetchIllustrations });
  const moods = useQuery(moodsQuery);
  const steps = useQuery(tripStepsQuery);
  const [category, setCategory] = useState<IllustrationCategory | "toutes">("toutes");
  const [state, setState] = useState<"toutes" | "remplacees" | "origine">("toutes");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<IllustrationSlot | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [dragging, setDragging] = useState(false);

  const rows = useMemo(() => new Map((list.data ?? []).map((row) => [row.src, row])), [list.data]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: QUERY_KEY });
    void client.invalidateQueries({ queryKey: communityKey });
    void client.invalidateQueries({ queryKey: tripStepsQuery.queryKey });
  };
  const nameOf = (slot: IllustrationSlot) => {
    const custom = rows.get(slot.src)?.label;
    if (custom) return custom;
    if (slot.category === "humeurs") {
      const mood = moods.data?.find((row) => row.image === slot.src);
      if (mood) return mood.label;
    }
    if (slot.category === "statuts") {
      const step = steps.data?.find((row) => row.image === slot.src);
      if (step) return step.label;
    }
    return slot.name;
  };

  const replaced = illustrationSlots.filter((slot) => rows.get(slot.src)?.storage_path).length;
  const visible = illustrationSlots.filter((slot) => {
    const isReplaced = Boolean(rows.get(slot.src)?.storage_path);
    return (
      (category === "toutes" || slot.category === category) &&
      (state === "toutes" || (state === "remplacees") === isReplaced) &&
      matches(search, nameOf(slot), slot.file)
    );
  });

  async function prepareRow(row: ImportRow) {
    const slot = row.src ? SLOT_BY_SRC.get(row.src) : null;
    if (!slot) return;
    let change: Partial<ImportRow>;
    try {
      change = {
        prepared: await prepareIllustration(row.file, slot, row.keepBackground),
        error: null,
      };
    } catch (cause) {
      change = {
        prepared: null,
        error: cause instanceof Error ? cause.message : "Image non traitée.",
      };
    }
    setImports((current) =>
      current.map((item) => (item.id === row.id ? { ...item, ...change } : item)),
    );
  }

  function addFiles(files: FileList | File[]) {
    const added = [...files]
      .filter((file) => file.type.startsWith("image/"))
      .map<ImportRow>((file) => ({
        id: crypto.randomUUID(),
        file,
        src: slotForFileName(file.name)?.src ?? null,
        keepBackground: false,
        prepared: null,
        error: null,
      }));
    setImports((current) => [...current, ...added]);
    // Une par une : le détourage occupe le navigateur.
    void added.reduce((previous, row) => previous.then(() => prepareRow(row)), Promise.resolve());
  }

  function changeRow(row: ImportRow, change: Partial<ImportRow>) {
    const next = { ...row, ...change, prepared: null, error: null };
    setImports((current) => current.map((item) => (item.id === row.id ? next : item)));
    void prepareRow(next);
  }

  const taken = new Set(imports.map((row) => row.src).filter(Boolean));
  const ready = imports.filter((row) => row.src && row.prepared);
  const saveAll = useMutation({
    mutationFn: async () => {
      let done = 0;
      const failed: string[] = [];
      for (const row of ready) {
        try {
          await saveImage(SLOT_BY_SRC.get(row.src!)!, row.prepared!, rows.get(row.src!), user?.id);
          setImports((current) => current.filter((item) => item.id !== row.id));
          done++;
        } catch {
          failed.push(row.file.name);
        }
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      refresh();
      if (done) toast.success(`${done} image${done > 1 ? "s" : ""} en ligne dans l'application.`);
      if (failed.length) toast.error(`Non enregistrées : ${failed.join(", ")}.`);
    },
  });

  if (list.error) {
    return (
      <div className="bw-admin-surface p-5 text-sm">
        <p className="font-semibold">Illustrations : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Exécutez le script <code>supabase/migrations/20261128100000_illustrations_admin.sql</code>{" "}
          dans Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="bw-admin-surface p-4">
      <p className="text-sm font-semibold">
        {replaced} remplacée{replaced > 1 ? "s" : ""} sur {illustrationSlots.length}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-emerald-700"
          style={{ width: `${(replaced * 100) / illustrationSlots.length}%` }}
        />
      </div>

      <label
        className={`mt-4 grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed p-6 text-center text-sm ${dragging ? "border-emerald-700 bg-emerald-50" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="size-5" aria-hidden />
        <strong>Glissez ici vos images, une ou plusieurs</strong>
        <span className="text-muted-foreground">
          Le fond blanc est enlevé automatiquement. Rien n'est publié avant votre validation.
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {imports.length ? (
        <section className="mt-4" aria-label="Images à valider">
          <ul className="grid gap-2">
            {imports.map((row) => {
              const slot = row.src ? SLOT_BY_SRC.get(row.src) : null;
              return (
                <li key={row.id} className="grid gap-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {row.prepared ? (
                      <span className="flex overflow-hidden rounded-lg border">
                        {["bg-white", "bg-[#141c24]"].map((background) => (
                          <span key={background} className={`p-1.5 ${background}`}>
                            <img src={row.prepared!.url} alt="" width={56} height={56} />
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="min-w-40 flex-1 text-sm">
                      <span className="block break-all font-medium">{row.file.name}</span>
                      <select
                        aria-label={`Image à remplacer par ${row.file.name}`}
                        value={row.src ?? ""}
                        onChange={(event) => changeRow(row, { src: event.target.value || null })}
                        className="mt-1 w-full max-w-72 rounded-lg border bg-white p-1.5"
                      >
                        <option value="">Choisir l'image à remplacer…</option>
                        {illustrationSlots.map((option) => (
                          <option
                            key={option.src}
                            value={option.src}
                            disabled={taken.has(option.src) && option.src !== row.src}
                          >
                            {categories[option.category].label} : {nameOf(option)}
                          </option>
                        ))}
                      </select>
                    </span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={row.keepBackground}
                        onChange={(event) =>
                          changeRow(row, { keepBackground: event.target.checked })
                        }
                      />
                      Garder le fond
                    </label>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Retirer ${row.file.name}`}
                      onClick={() =>
                        setImports((current) => current.filter((item) => item.id !== row.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {row.error ? (
                    <p className="text-sm text-red-700" role="alert">
                      {row.error}
                    </p>
                  ) : slot && !row.prepared ? (
                    <p className="text-xs text-muted-foreground">Traitement…</p>
                  ) : null}
                  {row.prepared?.alerts.map((alert) => (
                    <p key={alert} className="text-xs text-amber-800">
                      {alert}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-3"
            disabled={!ready.length || saveAll.isPending}
            onClick={() => saveAll.mutate()}
          >
            {saveAll.isPending
              ? "Enregistrement…"
              : `Publier ${ready.length} image${ready.length > 1 ? "s" : ""}`}
          </Button>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Chercher une illustration"
          className="max-w-64"
        />
        <select
          aria-label="Filtrer par état"
          value={state}
          onChange={(event) => setState(event.target.value as typeof state)}
          className="h-9 rounded-md border bg-white px-2 text-sm"
        >
          <option value="toutes">Toutes</option>
          <option value="origine">D'origine</option>
          <option value="remplacees">Remplacées</option>
        </select>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Catégorie">
        {(["toutes", ...Object.keys(categories)] as (IllustrationCategory | "toutes")[]).map(
          (id) => (
            <button
              key={id}
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${category === id ? "border-emerald-700 bg-emerald-700 text-white" : "bg-white"}`}
            >
              {id === "toutes" ? "Toutes" : categories[id].label} (
              {id === "toutes"
                ? illustrationSlots.length
                : illustrationSlots.filter((slot) => slot.category === id).length}
              )
            </button>
          ),
        )}
      </div>
      {category !== "toutes" ? (
        <p className="mt-2 text-xs text-muted-foreground">{categories[category].hint}</p>
      ) : null}

      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
        {visible.map((slot) => {
          const row = rows.get(slot.src);
          const url = row?.storage_path ? illustrationFileUrl(row.storage_path) : slot.src;
          return (
            <li key={slot.src}>
              <button
                type="button"
                onClick={() => setEditing(slot)}
                className="w-full overflow-hidden rounded-xl border bg-white text-left hover:border-emerald-700"
              >
                <span className="grid grid-cols-2">
                  {["bg-white", "bg-[#141c24]"].map((background) => (
                    <span key={background} className={`grid place-items-center p-2 ${background}`}>
                      <img src={url} alt="" width={48} height={48} loading="lazy" />
                    </span>
                  ))}
                </span>
                <span className="block border-t p-2">
                  <strong className="block truncate text-xs">{nameOf(slot)}</strong>
                  <small
                    className={row?.storage_path ? "text-emerald-700" : "text-muted-foreground"}
                  >
                    {row?.storage_path ? "Remplacée" : "D'origine"}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!visible.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Aucune illustration ne correspond.</p>
      ) : null}

      {editing ? (
        <IllustrationEditor
          key={editing.src}
          slot={editing}
          row={rows.get(editing.src)}
          name={nameOf(editing)}
          userId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function IllustrationEditor({
  slot,
  row,
  name,
  userId,
  onClose,
  onSaved,
}: {
  slot: IllustrationSlot;
  row: IllustrationRow | undefined;
  name: string;
  userId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(name);
  const [file, setFile] = useState<File | null>(null);
  const [keepBackground, setKeepBackground] = useState(false);
  const [prepared, setPrepared] = useState<PreparedIllustration | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let stale = false;
    setPrepared(null);
    setProblem(null);
    prepareIllustration(file, slot, keepBackground)
      .then((result) => {
        if (!stale) setPrepared(result);
      })
      .catch((cause: Error) => {
        if (!stale) setProblem(cause.message);
      });
    return () => {
      stale = true;
    };
  }, [file, keepBackground, slot]);

  const save = useMutation({
    mutationFn: async () => {
      const text = label.trim();
      if (!text || text.length > 40) throw new Error("Nom de 1 à 40 caractères.");
      if (prepared) await saveImage(slot, prepared, row, userId);
      if (text !== name) {
        const named = await supabase.from("bw_illustrations").upsert({
          src: slot.src,
          storage_path: prepared ? undefined : (row?.storage_path ?? null),
          label: text,
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        });
        if (named.error) throw new Error(named.error.message);
        // Le nom suit là où les voyageurs le lisent.
        const table = { humeurs: "bw_moods", statuts: "bw_trip_steps" } as Record<string, string>;
        if (table[slot.category]) {
          const linked = await supabase
            .from(table[slot.category]!)
            .update({ label: text })
            .eq("image", slot.src);
          if (linked.error) throw new Error(linked.error.message);
        }
      }
    },
    onSuccess: () => {
      onSaved();
      toast.success("Illustration enregistrée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async () => {
      // Le nom choisi reste : seule l'image revient.
      const { error } = await supabase
        .from("bw_illustrations")
        .update({ storage_path: null, updated_at: new Date().toISOString() })
        .eq("src", slot.src);
      if (error) throw new Error(error.message);
      if (row?.storage_path) {
        await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([row.storage_path]);
      }
    },
    onSuccess: () => {
      onSaved();
      toast.success("L'image d'origine est revenue.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const current = row?.storage_path ? illustrationFileUrl(row.storage_path) : slot.src;
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={name}
      description={categories[slot.category].hint}
      footer={
        <>
          {row?.storage_path ? (
            <Button variant="ghost" disabled={restore.isPending} onClick={() => restore.mutate()}>
              <RotateCcw className="size-4" /> Revenir à l'image d'origine
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={save.isPending || (Boolean(file) && !prepared)}
            onClick={() => save.mutate()}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <RealSizes src={prepared?.url ?? current} slot={slot} />
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
        <label className="grid gap-1.5 text-sm font-medium">
          Nouvelle image
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
        {row?.storage_path ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Image d'origine :
            <img src={slot.src} alt="" width={40} height={40} />
          </div>
        ) : null}
      </div>
    </AdminDrawer>
  );
}
