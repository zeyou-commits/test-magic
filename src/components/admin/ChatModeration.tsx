import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

type DmReport = {
  id: string;
  intro: string;
  reporter: string;
  reported: string;
  messages: { from: string; body: string }[];
};

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

type Word = { word: string; source: "equipe" | "import" | "agent" };
const SOURCE: Record<Word["source"], string> = {
  equipe: "ajouté par l’équipe",
  import: "importé",
  agent: "appris par la modération automatique",
};

/**
 * Termes d’un fichier CSV/TXT ou d’une liste collée : un terme par ligne, ou la première colonne
 * d’un CSV (séparateur virgule, point-virgule ou tabulation). Une ligne d’en-tête « mot », « terme »
 * ou « word » est ignorée.
 */
export function parseWordList(text: string): string[] {
  const out: string[] = [];
  const lines = text.replace(String.fromCharCode(65279), "").split(String.fromCharCode(10));
  for (const raw of lines) {
    let cell = raw.trim();
    if (!cell) continue;
    if (cell.startsWith("\"")) {
      const end = cell.indexOf("\"", 1);
      cell = end > 0 ? cell.slice(1, end) : cell.slice(1);
    } else {
      cell = cell.split(/[;,\t]/)[0] ?? "";
    }
    cell = cell.trim().toLowerCase();
    if (!cell || ["mot", "mots", "terme", "termes", "word", "words", "expression"].includes(cell)) continue;
    out.push(cell);
  }
  return [...new Set(out)];
}

/** Salons : ce que la modération automatique a masqué ou ce qui a été signalé, et les mots refusés. */
export function ChatModeration() {
  const client = useQueryClient();
  const [word, setWord] = useState("");
  const [bulk, setBulk] = useState("");
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
      const { data, error } = await db.from("bw_chat_words").select("word,source").order("word");
      if (error) return null;
      return data as Word[];
    },
    retry: false,
  });
  const dmReports = useQuery({
    queryKey: ["admin", "chat", "dm"],
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_dm_reported");
      if (error) return null;
      return data as DmReport[];
    },
    retry: false,
    refetchInterval: 60_000,
  });
  const resolveDm = useMutation({
    mutationFn: async (input: { id: string; sanction: boolean }) => {
      const { error } = await db.rpc("bw_dm_report_resolve", {
        p_thread: input.id,
        p_sanction: input.sanction,
      });
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "chat"] }),
    onError: (error: Error) => toast.error(error.message),
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
  const importWords = useMutation({
    mutationFn: async (list: string[]) => {
      if (!list.length) throw new Error("Aucun terme trouvé dans ce fichier.");
      const { data, error } = await db.rpc("bw_chat_words_import", { p_words: list });
      if (error) throw error;
      return data as { added: number; received: number };
    },
    onSuccess: (result) => {
      setBulk("");
      toast.success(
        `${result.added} terme${result.added > 1 ? "s" : ""} ajouté${result.added > 1 ? "s" : ""} sur ${result.received} (les doublons sont ignorés).`,
      );
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
      {dmReports.data?.length ? (
        <>
          <h3>Messages privés signalés</h3>
          <ul>
            {dmReports.data.map((report) => (
              <li key={report.id}>
                <span>
                  <small>
                    {report.reporter} signale {report.reported}
                  </small>
                  <b>{report.intro}</b>
                  {report.messages.map((message, index) => (
                    <small key={index}>
                      {message.from} : {message.body}
                    </small>
                  ))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveDm.isPending}
                  onClick={() => resolveDm.mutate({ id: report.id, sanction: false })}
                >
                  Classer
                </Button>
                <Button
                  size="sm"
                  disabled={resolveDm.isPending}
                  onClick={() => resolveDm.mutate({ id: report.id, sanction: true })}
                >
                  Bloquer l'écriture 24 h
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3>Mots et expressions refusés ({words.data?.length ?? 0})</h3>
      <p className="bw-chat-words__help">
        Refusés à l’envoi, quelle que soit l’écriture : majuscules, accents, lettres répétées ou
        séparées, chiffres à la place des lettres, écriture arabe. La modération automatique ajoute
        elle-même les termes qu’elle repère dans les messages qu’elle masque.
      </p>
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
      <details className="bw-chat-words__import">
        <summary>Importer une liste (CSV, TXT ou copier-coller)</summary>
        <p>Un terme par ligne, ou la première colonne d’un tableur enregistré en CSV.</p>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          aria-label="Choisir un fichier de termes"
          disabled={importWords.isPending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) importWords.mutate(parseWordList(await file.text()));
          }}
        />
        <textarea
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
          rows={5}
          placeholder={["va te faire voir", "fils de chien", "..."].join(String.fromCharCode(10))}
          aria-label="Coller une liste de termes"
        />
        <Button
          size="sm"
          disabled={!bulk.trim() || importWords.isPending}
          onClick={() => importWords.mutate(parseWordList(bulk))}
        >
          {importWords.isPending ? "Import…" : `Importer ${parseWordList(bulk).length || ""} terme(s)`}
        </Button>
      </details>
      <p className="bw-chat-words__list">
        {(words.data ?? []).map((item) => (
          <button
            key={item.word}
            type="button"
            data-source={item.source}
            title={`${SOURCE[item.source] ?? ""} · cliquer pour retirer`}
            onClick={() => removeWord.mutate(item.word)}
            aria-label={`Retirer ${item.word}`}
          >
            {item.source === "agent" ? "🤖 " : ""}
            {item.word} ×
          </button>
        ))}
      </p>
    </section>
  );
}
