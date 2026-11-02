import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { personas, type TravellerCard } from "@/lib/community/travellers";
import { chatDemoKey, chatDemoQuery, type DemoMessage } from "@/lib/ferry/chatDemo";
import { AdminDrawer, AdminListToolbar, matches } from "./AdminDrawer";

// Table des exemples, absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const card = (message: { pseudo: string; avatar: string }) =>
  ({
    handle: "exemple",
    pseudo: message.pseudo,
    avatar: message.avatar,
    color: "#2f7d5b",
    mood: null,
  }) as unknown as TravellerCard;

/** Les messages qui défilent à côté du bouton Salons, tant que les salons sont calmes. */
export function ChatDemoAdmin() {
  const client = useQueryClient();
  const demos = useQuery(chatDemoQuery);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DemoMessage | "new" | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: chatDemoKey });
  const reorder = useMutation({
    mutationFn: async (rows: { id: string; sort: number }[]) => {
      for (const row of rows) {
        const { error } = await supabase
          .from("bw_chat_demo_messages")
          .update({ sort: row.sort })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  if (demos.data === null)
    return (
      <div className="bw-admin-surface mt-4 p-5 text-sm">
        <p className="font-semibold">Messages d'exemple des salons : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Appliquez la migration <code>20261212130000_salons_exemples.sql</code>.
        </p>
      </div>
    );
  const all = demos.data ?? [];
  const list = all.filter((row) => matches(search, row.pseudo, row.label, row.body));
  const move = (index: number, step: -1 | 1) => {
    const next = [...all];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    reorder.mutate(
      next
        .map((row, i) => ({ id: row.id, sort: (i + 1) * 10, before: row.sort }))
        .filter((row) => row.sort !== row.before),
    );
  };
  return (
    <div className="bw-admin-surface mt-4 p-4">
      <h3 className="text-sm font-bold">Messages d'exemple des salons</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Ils défilent à côté du bouton Salons tant qu'il y a moins de 3 vrais messages dans les 2
        dernières heures. Les vrais messages passent toujours devant.
      </p>
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Chercher un message"
        count={list.length}
        total={all.length}
        onCreate={() => setEditing("new")}
        createLabel="Nouveau message"
      />
      <ul className="bw-admin-list mt-3">
        {list.map((row) => {
          const index = all.indexOf(row);
          return (
            <li key={row.id} data-muted={!row.active || undefined}>
              <button type="button" className="bw-admin-list__main" onClick={() => setEditing(row)}>
                <TravellerAvatar card={card(row)} size={36} mood={false} />
                <span className="min-w-0">
                  <strong>
                    {row.pseudo} · {row.label}
                    {row.active ? null : (
                      <EyeOff
                        className="ml-1 inline size-3.5 text-muted-foreground"
                        aria-label="En pause"
                      />
                    )}
                  </strong>
                  <small>{row.body}</small>
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
        <DemoEditor
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          nextSort={(all.at(-1)?.sort ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function DemoEditor({
  row,
  nextSort,
  onClose,
  onSaved,
}: {
  row: DemoMessage | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pseudo, setPseudo] = useState(row?.pseudo ?? "");
  const [label, setLabel] = useState(row?.label ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  const [avatar, setAvatar] = useState<string>(row?.avatar ?? personas[0]!.id);
  const [active, setActive] = useState(row?.active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const values = {
        pseudo: pseudo.trim(),
        label: label.trim(),
        body: body.trim(),
        avatar,
        active,
        updated_at: new Date().toISOString(),
      };
      if (values.pseudo.length < 2) throw new Error("Prénom de 2 caractères au moins.");
      if (values.label.length < 2) throw new Error("Indiquez la traversée ou le port.");
      if (values.body.length < 2 || values.body.length > 140)
        throw new Error("Message de 2 à 140 caractères.");
      const { error } = row
        ? await supabase.from("bw_chat_demo_messages").update(values).eq("id", row.id)
        : await supabase.from("bw_chat_demo_messages").insert({ ...values, sort: nextSort });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      onSaved();
      toast.success(row ? "Message mis à jour." : "Message ajouté.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_chat_demo_messages").delete().eq("id", row!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      onSaved();
      toast.success("Message supprimé.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={row ? `Message de ${row.pseudo}` : "Nouveau message d'exemple"}
      description="Il défile à côté du bouton Salons, avec l'avatar et le prénom choisis."
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
          <TravellerAvatar card={card({ pseudo: pseudo || "?", avatar })} size={40} mood={false} />
          <span className="min-w-0 text-sm">
            <b className="block text-xs text-primary">
              {pseudo || "Prénom"} · {label || "Traversée"}
            </b>
            {body || "Aperçu du message"}
          </span>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Prénom (30 caractères)
          <Input value={pseudo} maxLength={30} onChange={(e) => setPseudo(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Traversée ou port affiché
          <Input
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Marseille → Alger, ou Port de Sète"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Message (140 caractères)
          <textarea
            value={body}
            maxLength={140}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Affiché dans l'aperçu
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          Avatar
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
            {personas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                role="radio"
                aria-checked={avatar === persona.id}
                title={persona.name}
                onClick={() => setAvatar(persona.id)}
                className={`rounded-full p-0.5 ${avatar === persona.id ? "ring-2 ring-primary" : ""}`}
              >
                <TravellerAvatar
                  card={card({ pseudo: persona.name, avatar: persona.id })}
                  size={40}
                  mood={false}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </AdminDrawer>
  );
}
