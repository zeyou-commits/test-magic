import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { communityKey, moodsQuery, type MoodRow } from "@/lib/community/travellers";
import { cabasImages } from "@/lib/ferry/presence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDrawer, AdminListToolbar, matches } from "./AdminDrawer";

// Table des humeurs, absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const moments = [
  { id: "avant", label: "Avant le départ" },
  { id: "en_route", label: "En route" },
  { id: "port", label: "Au port" },
  { id: "onboard", label: "À bord" },
  { id: "arrived", label: "Arrivé" },
  { id: "toujours", label: "Tout le temps" },
] as const;
const momentLabel = (id: string) => moments.find((moment) => moment.id === id)?.label ?? id;
const moodImages = cabasImages.filter((src) => src.includes("/humeurs/"));

/** Code technique tiré du libellé : minuscules, sans accents ni espaces. */
function codeFrom(label: string, taken: string[]) {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "humeur";
  let code = base.length >= 2 ? base : `${base}_x`;
  for (let n = 2; taken.includes(code); n++) code = `${base}_${n}`;
  return code;
}

/** Catalogue des humeurs proposées aux voyageurs (bulle sur leur cabas, 24 h). */
export function MoodsAdmin() {
  const client = useQueryClient();
  const moods = useQuery(moodsQuery);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MoodRow | "new" | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: communityKey });
  const reorder = useMutation({
    mutationFn: async (rows: { code: string; sort: number }[]) => {
      for (const row of rows) {
        const { error } = await supabase
          .from("bw_moods")
          .update({ sort: row.sort })
          .eq("code", row.code);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  if (moods.data === null)
    return (
      <div className="bw-admin-surface p-5 text-sm">
        <p className="font-semibold">Humeurs : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Exécutez le script <code>supabase/migrations/20261105120000_communaute_profils.sql</code>{" "}
          dans Supabase. 24 humeurs y sont proposées pour commencer.
        </p>
      </div>
    );
  const all = moods.data ?? [];
  const list = all.filter((row) => matches(search, row.label, row.code));
  const move = (index: number, step: -1 | 1) => {
    const next = [...all];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    reorder.mutate(
      next
        .map((row, i) => ({ code: row.code, sort: (i + 1) * 10, before: row.sort }))
        .filter((row) => row.sort !== row.before),
    );
  };
  return (
    <div className="bw-admin-surface p-4">
      <p className="text-xs text-muted-foreground">
        La petite bulle que les voyageurs posent sur leur cabas pendant 24 h. Les humeurs du moment
        du voyage (au port, à bord…) leur sont proposées en premier.
      </p>
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Chercher une humeur"
        count={list.length}
        total={all.length}
        onCreate={() => setEditing("new")}
        createLabel="Nouvelle humeur"
      />
      <ul className="bw-admin-list mt-3">
        {list.map((row) => {
          const index = all.indexOf(row);
          return (
            <li key={row.code} data-muted={!row.active || undefined}>
              <button type="button" className="bw-admin-list__main" onClick={() => setEditing(row)}>
                <img src={row.image} alt="" width={40} height={40} className="rounded-full" />
                <span className="min-w-0">
                  <strong>
                    {row.emoji ? `${row.emoji} ` : ""}
                    {row.label}
                    {row.active ? null : (
                      <EyeOff
                        className="ml-1 inline size-3.5 text-muted-foreground"
                        aria-label="Masquée"
                      />
                    )}
                  </strong>
                  <small>
                    {row.moments.map(momentLabel).join(" · ") || "Sans moment particulier"}
                  </small>
                </span>
              </button>
              {search ? null : (
                <span className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Monter"
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Descendre"
                    disabled={index === all.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {editing ? (
        <MoodEditor
          key={editing === "new" ? "new" : editing.code}
          row={editing === "new" ? null : editing}
          taken={all.map((row) => row.code)}
          nextSort={(all.at(-1)?.sort ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function MoodEditor({
  row,
  taken,
  nextSort,
  onClose,
  onSaved,
}: {
  row: MoodRow | null;
  taken: string[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [emoji, setEmoji] = useState(row?.emoji ?? "");
  const [image, setImage] = useState(row?.image ?? moodImages[0] ?? "");
  const [chosen, setChosen] = useState<string[]>(row?.moments ?? ["toujours"]);
  const [active, setActive] = useState(row?.active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const text = label.trim();
      if (text.length < 2 || text.length > 40) throw new Error("Libellé de 2 à 40 caractères.");
      const values = {
        label: text,
        emoji: emoji.trim(),
        image,
        moments: chosen,
        active,
        updated_at: new Date().toISOString(),
      };
      const { error } = row
        ? await supabase.from("bw_moods").update(values).eq("code", row.code)
        : await supabase
            .from("bw_moods")
            .insert({ ...values, code: codeFrom(text, taken), sort: nextSort });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      onSaved();
      toast.success(row ? "Humeur mise à jour." : "Humeur ajoutée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_moods").delete().eq("code", row!.code);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      onSaved();
      toast.success("Humeur supprimée. Les voyageurs qui l’avaient choisie n’en ont plus.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={row ? `Humeur « ${row.label} »` : "Nouvelle humeur"}
      description="Elle s’affiche en bulle sur le cabas du voyageur, avec son illustration, pendant 24 h."
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
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <img src={image} alt="" width={56} height={56} className="rounded-full bg-white" />
          <span className="bw-tavatar__mood" data-label>
            <img src={image} alt="" width={18} height={18} />
            <span>
              {emoji ? `${emoji} ` : ""}
              {label || "Aperçu de la bulle"}
            </span>
          </span>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Libellé (40 caractères)
          <Input
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="En mode zen"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Émoji (facultatif)
          <Input
            value={emoji}
            maxLength={8}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🇩🇿"
            className="w-28"
          />
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          Moments où la proposer en premier
          <div className="flex flex-wrap gap-2">
            {moments.map((moment) => (
              <label key={moment.id} className="bw-admin-chip-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(moment.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked
                        ? [...chosen, moment.id]
                        : chosen.filter((item) => item !== moment.id),
                    )
                  }
                />
                {moment.label}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Proposée aux voyageurs
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          Illustration
          <div className="bw-cabas-picker" role="radiogroup" aria-label="Illustration">
            {moodImages.map((src) => (
              <button
                key={src}
                type="button"
                role="radio"
                aria-checked={image === src}
                onClick={() => setImage(src)}
                title={src
                  .split("/")
                  .pop()
                  ?.replace(/\.webp$/, "")
                  .replace(/^\d+_/, "")
                  .replace(/_/g, " ")}
              >
                <img src={src} alt="" width={52} height={52} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </AdminDrawer>
  );
}
