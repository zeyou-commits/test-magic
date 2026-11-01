import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

type Item = {
  id: string;
  body: string;
  room_kind: "crossing" | "port";
  created_at: string;
  hidden_at: string | null;
  hidden_reason: string | null;
  reports: number;
  author: { pseudo: string };
};

/** Salons : ce que la modération automatique a masqué ou ce qui a été signalé, et les mots refusés. */
export function ChatModeration() {
  const client = useQueryClient();
  const [word, setWord] = useState("");
  const items = useQuery({
    queryKey: ["admin", "chat", "moderation"],
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_chat_moderation");
      if (error) return null;
      return data as Item[];
    },
    retry: false,
    refetchInterval: 60_000,
  });
  const words = useQuery({
    queryKey: ["admin", "chat", "words"],
    queryFn: async () => {
      const { data, error } = await db.from("bw_chat_words").select("word").order("word");
      if (error) return null;
      return (data as { word: string }[]).map((row) => row.word);
    },
    retry: false,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["admin", "chat"] });
  const setHidden = useMutation({
    mutationFn: async (input: { id: string; hidden: boolean }) => {
      const { error } = await db.rpc("bw_chat_set_hidden", {
        p_message: input.id,
        p_hidden: input.hidden,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const addWord = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("bw_chat_words").insert({ word: word.trim().toLowerCase() });
      if (error) throw error;
    },
    onSuccess: () => {
      setWord("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeWord = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await db.from("bw_chat_words").delete().eq("word", value);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  // Module pas encore activé en base : rien à afficher.
  if (items.data === null) return null;
  return (
    <section className="bw-watch__sources" aria-label="Modération des salons">
      <h3>Salons : messages masqués ou signalés</h3>
      {items.data?.length ? (
        <ul>
          {items.data.map((item) => (
            <li key={item.id}>
              <span>
                <b>{item.author.pseudo}</b> : {item.body}
                <small>
                  {item.hidden_at ? `Masqué · ${item.hidden_reason ?? "Modération"}` : "Visible"}
                  {item.reports ? ` · ${item.reports} signalement(s)` : ""}
                </small>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={setHidden.isPending}
                onClick={() => setHidden.mutate({ id: item.id, hidden: !item.hidden_at })}
              >
                {item.hidden_at ? "Rétablir" : "Masquer"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Rien à vérifier.</p>
      )}
      <h3>Mots refusés</h3>
      <form
        className="bw-chat-words"
        onSubmit={(event) => {
          event.preventDefault();
          if (word.trim()) addWord.mutate();
        }}
      >
        <input
          value={word}
          onChange={(event) => setWord(event.target.value)}
          placeholder="Ajouter un mot"
          aria-label="Ajouter un mot refusé"
        />
        <Button size="sm" type="submit" disabled={!word.trim() || addWord.isPending}>
          Ajouter
        </Button>
      </form>
      <p className="bw-chat-words__list">
        {(words.data ?? []).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => removeWord.mutate(value)}
            aria-label={`Retirer ${value}`}
          >
            {value} ×
          </button>
        ))}
      </p>
    </section>
  );
}
