import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  chatStartersKey,
  chatStartersQuery,
  fillStarter,
  STARTER_MOMENTS,
  STARTER_WORDS,
  type Starter,
  type StarterMoment,
} from "@/lib/ferry/chatStarters";

// Table des amorces, absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

/** Exemple de traversée pour l'aperçu des phrases. */
const SAMPLE = {
  depart: "Marseille",
  arrivee: "Alger",
  navire: "Tariq Ibn Ziyad",
  compagnie: "Algérie Ferries",
  port: "Sète",
};

/** Les phrases proposées pour lancer la conversation, selon le moment du voyage. */
export function ChatStartersAdmin() {
  const starters = useQuery(chatStartersQuery);
  if (starters.data === null)
    return (
      <div className="bw-admin-surface mt-4 p-5 text-sm">
        <p className="font-semibold">Phrases d'amorce des salons : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Appliquez la migration <code>20261212160000_salons_amorces.sql</code>.
        </p>
      </div>
    );
  const all = starters.data ?? [];
  return (
    <div className="bw-admin-surface mt-4 p-4">
      <h3 className="text-sm font-bold">Phrases d'amorce des salons</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Les 3 premières phrases actives de chaque moment sont proposées sous le champ d'écriture.
        Mots à insérer :{" "}
        {STARTER_WORDS.map((word) => (
          <code key={word} className="mr-1">{`{${word}}`}</code>
        ))}
        . Une phrase dont un mot est inconnu pour la traversée n'est pas proposée.
      </p>
      <div className="mt-3 grid gap-4">
        {STARTER_MOMENTS.map((moment) => (
          <MomentBlock
            key={moment.id}
            moment={moment.id}
            label={moment.label}
            rows={all.filter((row) => row.moment === moment.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MomentBlock({
  moment,
  label,
  rows,
}: {
  moment: StarterMoment;
  label: string;
  rows: Starter[];
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const refresh = () => void client.invalidateQueries({ queryKey: chatStartersKey });
  const add = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (body.length < 2 || body.length > 90) throw new Error("Phrase de 2 à 90 caractères.");
      const { error } = await supabase.from("bw_chat_starters").insert({
        moment,
        body,
        sort: (rows.at(-1)?.sort ?? 0) + 10,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDraft("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="grid gap-2">
      <strong className="text-xs uppercase tracking-wide text-primary">{label}</strong>
      <ul className="grid gap-1.5">
        {rows.map((row) => (
          <StarterRow key={row.id} row={row} onSaved={refresh} />
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <Input
          value={draft}
          maxLength={90}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nouvelle phrase, par exemple : La file à {depart}, ça avance ?"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || add.isPending}
          aria-label="Ajouter"
        >
          <Plus className="size-4" />
        </Button>
      </form>
    </section>
  );
}

function StarterRow({ row, onSaved }: { row: Starter; onSaved: () => void }) {
  const [body, setBody] = useState(row.body);
  const save = useMutation({
    mutationFn: async (values: Partial<Starter>) => {
      const { error } = await supabase
        .from("bw_chat_starters")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: onSaved,
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_chat_starters").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: onSaved,
    onError: (error: Error) => toast.error(error.message),
  });
  const preview = fillStarter(body, SAMPLE);
  return (
    <li
      className="grid gap-1 rounded-lg border border-border p-2"
      data-muted={!row.active || undefined}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label="Proposée"
          checked={row.active}
          onChange={(e) => save.mutate({ active: e.target.checked })}
        />
        <Input
          value={body}
          maxLength={90}
          onChange={(e) => setBody(e.target.value)}
          className="h-8 text-sm"
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Enregistrer"
          disabled={body.trim() === row.body || body.trim().length < 2 || save.isPending}
          onClick={() => save.mutate({ body: body.trim() })}
        >
          <Check className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Supprimer"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <small className="pl-6 text-[11px] text-muted-foreground">
        Aperçu : {preview ?? "un mot entre accolades n'est pas reconnu"}
      </small>
    </li>
  );
}
