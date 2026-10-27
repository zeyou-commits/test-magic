import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, Check, EyeOff, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  catalogQuery,
  communityKey,
  signalTablesKey,
  signalTablesQuery,
  type OptionRow,
  type ServiceRow,
  type SituationRow,
} from "@/lib/ferry/community";
import { NamedIcon, iconRegistry } from "@/components/panel/SituationIcon";
import { cabasImages, tripStepsQuery, type TripStepRow } from "@/lib/ferry/presence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDrawer, AdminListToolbar, matches } from "./AdminDrawer";

// Tables du catalogue, absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const SCRIPT = "20261031120000_signalements_catalogue_admin.sql";
const palette = [
  "#dc4c1d",
  "#c2410c",
  "#e0a100",
  "#2e9d6a",
  "#0f766e",
  "#0c8599",
  "#2563eb",
  "#6741d9",
  "#9333ea",
  "#d6336c",
  "#475569",
];
const lifetimes = [30, 45, 60, 90, 120, 180, 240, 360, 720];
const lifetimeText = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;

/** Code technique tiré du libellé : minuscules, sans accents ni espaces. */
function codeFrom(label: string, separator = "") {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^${separator || "_"}+|${separator || "_"}+$`, "g"), "")
    .slice(0, 28);
  return /^[a-z]/.test(base) ? base : `x${base}`;
}
function uniqueCode(base: string, taken: string[], separator = "") {
  let code = base;
  for (let n = 2; taken.includes(code); n += 1) code = `${base}${separator}${n}`;
  return code;
}
const friendly = (message: string) =>
  /masquez/.test(message)
    ? message
    : /duplicate|unique/.test(message)
      ? "Ce code existe déjà."
      : /row-level|permission|42501/.test(message)
        ? "Droits insuffisants : rôle admin ou éditeur requis."
        : "L’enregistrement n’a pas abouti. Réessayez.";

/** Choix d'un picto dans le registre commun (site et admin). */
function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <div className="bw-icon-picker" role="radiogroup" aria-label="Picto">
      {Object.entries(iconRegistry).map(([name, item]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          title={item.label}
          aria-label={item.label}
          onClick={() => onChange(name)}
        >
          <NamedIcon name={name} size={18} />
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Couleur">
      {palette.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className="grid size-7 place-items-center rounded-full ring-offset-2 aria-checked:ring-2 aria-checked:ring-foreground"
          style={{ background: color }}
        >
          {value === color ? <Check className="size-4 text-white" aria-hidden /> : null}
        </button>
      ))}
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Autre couleur"
        className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
      />
    </div>
  );
}

const Badge = ({ color, icon, size = 36 }: { color: string; icon: string; size?: number }) => (
  <span
    className="bw-situation-badge"
    style={{ "--situation-color": color, width: size, height: size } as CSSProperties}
    aria-hidden
  >
    <NamedIcon name={icon} size={Math.round(size / 2)} />
  </span>
);

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {text}
      {children}
    </label>
  );
}

/**
 * Catalogue des signalements voyageurs : situations (port, bateau), leurs choix et les
 * services du port. Ce qui est masqué n'est plus proposé mais reste lisible sur les anciens signalements.
 */
export function SignalsAdmin() {
  const client = useQueryClient();
  const version = useQuery(catalogQuery).data ?? 0;
  const tables = useQuery({ ...signalTablesQuery, enabled: version >= 4 });
  const [view, setView] = useState<"situations" | "services" | "steps">("situations");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SituationRow | "new" | null>(null);
  const [service, setService] = useState<ServiceRow | "new" | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: signalTablesKey });
    void client.invalidateQueries({ queryKey: communityKey });
  };

  const reorder = useMutation({
    mutationFn: async (input: { table: string; rows: { code: string; sort: number }[] }) => {
      for (const row of input.rows) {
        const { error } = await supabase.from(input.table).update({ sort: row.sort }).eq("code", row.code);
        if (error) throw new Error(friendly(error.message));
      }
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const move = <T extends { code: string; sort: number }>(table: string, list: T[], index: number, step: -1 | 1) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    const rows = next
      .map((row, i) => ({ code: row.code, sort: (i + 1) * 10, before: row.sort }))
      .filter((row) => row.sort !== row.before);
    reorder.mutate({ table, rows });
  };

  if (version < 4 || tables.data === null)
    return (
      <div className="bw-admin-surface mt-4 p-5 text-sm">
        <p className="font-semibold">Catalogue géré en base : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Exécutez le script <code>supabase/migrations/{SCRIPT}</code> dans Supabase (SQL Editor). Il
          reprend le catalogue actuel ; vous pourrez ensuite ajouter, modifier ou masquer les
          situations, leurs choix et les services du port ici.
        </p>
      </div>
    );
  if (!tables.data)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {tables.isError ? (tables.error as Error).message : "Chargement du catalogue…"}
      </p>
    );
  const data = tables.data;
  const situations = data.situations.filter((row) => matches(search, row.label, row.code));
  const services = data.services.filter((row) => matches(search, row.label, row.code));

  return (
    <div className="mt-4 space-y-4">
      <div className="bw-admin-segment" role="tablist" aria-label="Catalogue">
        {(
          [
            ["situations", `Situations (${data.situations.length})`],
            ["services", `Services du port (${data.services.length})`],
            ["steps", "Étapes Ma traversée"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === "steps" ? (
        <TripStepsAdmin />
      ) : view === "situations" ? (
        <div className="bw-admin-surface p-4">
          <AdminListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Chercher une situation"
            count={situations.length}
            total={data.situations.length}
            onCreate={() => setEditing("new")}
            createLabel="Nouvelle situation"
          />
          {(["port", "vessel"] as const).map((kind) => {
            const group = situations.filter((row) => row.target_kind === kind);
            const all = data.situations.filter((row) => row.target_kind === kind);
            if (!group.length) return null;
            return (
              <section key={kind} className="mt-4">
                <h3 className="bw-admin-group-title">{kind === "port" ? "Au port" : "Le bateau"}</h3>
                <ul className="bw-admin-list">
                  {group.map((row) => {
                    const options = data.options.filter((option) => option.situation === row.code);
                    const index = all.findIndex((item) => item.code === row.code);
                    return (
                      <li key={row.code} data-muted={!row.active || undefined}>
                        <button type="button" className="bw-admin-list__main" onClick={() => setEditing(row)}>
                          <Badge color={row.color} icon={row.icon} />
                          <span className="min-w-0">
                            <strong>{row.label}</strong>
                            <small>
                              {row.code === "service"
                                ? `${data.services.filter((item) => item.active).length} services`
                                : `${options.filter((option) => option.active).length} choix`}{" "}
                              · visible {lifetimeText(row.lifetime_minutes)}
                              {row.required ? " · précision obligatoire" : ""}
                            </small>
                          </span>
                          {!row.active ? <span className="bw-admin-chip">Masquée</span> : null}
                        </button>
                        <span className="bw-admin-list__order">
                          <button
                            type="button"
                            aria-label={`Monter ${row.label}`}
                            disabled={index <= 0 || reorder.isPending || Boolean(search)}
                            onClick={() => move("bw_signal_situations", all, index, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Descendre ${row.label}`}
                            disabled={index >= all.length - 1 || reorder.isPending || Boolean(search)}
                            onClick={() => move("bw_signal_situations", all, index, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <p className="mt-4 text-xs text-muted-foreground">
            L’ordre est celui des tuiles « Que voyez-vous ? ». Une situation masquée n’est plus proposée,
            mais les signalements déjà faits restent lisibles.
          </p>
        </div>
      ) : (
        <div className="bw-admin-surface p-4">
          <AdminListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Chercher un service"
            count={services.length}
            total={data.services.length}
            onCreate={() => setService("new")}
            createLabel="Nouveau service"
          />
          <ul className="bw-admin-list mt-4">
            {services.map((row) => {
              const index = data.services.findIndex((item) => item.code === row.code);
              return (
                <li key={row.code} data-muted={!row.active || undefined}>
                  <button type="button" className="bw-admin-list__main" onClick={() => setService(row)}>
                    <Badge color="#0f766e" icon={row.icon} />
                    <span className="min-w-0">
                      <strong>{row.label}</strong>
                      <small>
                        {row.open_label} / {row.closed_label}
                      </small>
                    </span>
                    {!row.active ? <span className="bw-admin-chip">Masqué</span> : null}
                  </button>
                  <span className="bw-admin-list__order">
                    <button
                      type="button"
                      aria-label={`Monter ${row.label}`}
                      disabled={index <= 0 || reorder.isPending || Boolean(search)}
                      onClick={() => move("bw_signal_services", data.services, index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Descendre ${row.label}`}
                      disabled={index >= data.services.length - 1 || reorder.isPending || Boolean(search)}
                      onClick={() => move("bw_signal_services", data.services, index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing ? (
        <SituationEditor
          key={editing === "new" ? "new" : editing.code}
          row={editing === "new" ? null : editing}
          options={editing === "new" ? [] : data.options.filter((option) => option.situation === editing.code)}
          takenCodes={data.situations.map((item) => item.code)}
          nextSort={(data.situations.at(-1)?.sort ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {service ? (
        <ServiceEditor
          key={service === "new" ? "new" : service.code}
          row={service === "new" ? null : service}
          takenCodes={data.services.map((item) => item.code)}
          nextSort={(data.services.at(-1)?.sort ?? 0) + 10}
          onClose={() => setService(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function SituationEditor({
  row,
  options,
  takenCodes,
  nextSort,
  onClose,
  onSaved,
}: {
  row: SituationRow | null;
  options: OptionRow[];
  takenCodes: string[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    label: row?.label ?? "",
    target_kind: row?.target_kind ?? ("port" as "port" | "vessel"),
    color: row?.color ?? "#0f766e",
    icon: row?.icon ?? "flag",
    lifetime_minutes: row?.lifetime_minutes ?? 120,
    question: row?.question ?? "",
    required: row?.required ?? false,
    active: row?.active ?? true,
  });
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      const label = draft.label.trim();
      if (label.length < 2) throw new Error("Indiquez un libellé.");
      const values = { ...draft, label, question: draft.question.trim() };
      const { error } = row
        ? await supabase.from("bw_signal_situations").update(values).eq("code", row.code)
        : await supabase.from("bw_signal_situations").insert({
            ...values,
            code: uniqueCode(codeFrom(label), takenCodes),
            sort: nextSort,
          });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      toast.success(row ? "Situation mise à jour." : "Situation ajoutée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_signal_situations").delete().eq("code", row!.code);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      toast.success("Situation supprimée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={row ? row.label : "Nouvelle situation"}
      description={row ? "Libellé, apparence, durée et choix proposés aux voyageurs." : "Elle apparaîtra comme une tuile dans « Que voyez-vous ? »."}
      footer={
        <>
          {row && !row.builtin ? (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Supprimer « ${row.label} » ? Si elle a déjà servi, masquez-la plutôt.`)) remove.mutate();
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Supprimer
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <Badge color={draft.color} icon={draft.icon} size={44} />
          <span className="text-sm font-semibold">{draft.label || "Aperçu de la tuile"}</span>
        </div>
        <Label text="Libellé">
          <Input value={draft.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} />
        </Label>
        {!row ? (
          <Label text="Concerne">
            <select
              value={draft.target_kind}
              onChange={(e) => set({ target_kind: e.target.value as "port" | "vessel" })}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="port">Le port</option>
              <option value="vessel">Le bateau</option>
            </select>
          </Label>
        ) : null}
        <Label text="Couleur">
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
        </Label>
        <div className="grid gap-1.5 text-sm font-medium">
          Picto
          <IconPicker value={draft.icon} onChange={(icon) => set({ icon })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Visible pendant">
            <select
              value={draft.lifetime_minutes}
              onChange={(e) => set({ lifetime_minutes: Number(e.target.value) })}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {lifetimes.map((value) => (
                <option key={value} value={value}>
                  {lifetimeText(value)}
                </option>
              ))}
            </select>
          </Label>
          <Label text="Question au-dessus des choix">
            <Input value={draft.question} maxLength={80} placeholder="Ex. Comment avance la file ?" onChange={(e) => set({ question: e.target.value })} />
          </Label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.required} onChange={(e) => set({ required: e.target.checked })} />
          Une précision doit être choisie
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!draft.active} onChange={(e) => set({ active: !e.target.checked })} />
          <EyeOff className="size-4 text-muted-foreground" aria-hidden />
          Masquer (plus proposée aux voyageurs)
        </label>
        {row && row.code !== "service" ? (
          <OptionsEditor situation={row.code} options={options} onSaved={onSaved} />
        ) : row?.code === "service" ? (
          <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Les choix de cette situation sont les services du port (onglet « Services du port »).
          </p>
        ) : (
          <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Enregistrez la situation, puis rouvrez-la pour ajouter ses choix.
          </p>
        )}
      </div>
    </AdminDrawer>
  );
}

/** Choix d'une situation : libellé, picto, « sur place » obligatoire, masquage, ordre. */
function OptionsEditor({
  situation,
  options,
  onSaved,
}: {
  situation: string;
  options: OptionRow[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const write = useMutation({
    mutationFn: async (input: { code?: string; values: Partial<OptionRow> }) => {
      const { error } = input.code
        ? await supabase.from("bw_signal_options").update(input.values).eq("code", input.code)
        : await supabase.from("bw_signal_options").insert(input.values);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      setEditing(null);
      setAdding(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("bw_signal_options").delete().eq("code", code);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: onSaved,
    onError: (error: Error) => toast.error(error.message),
  });
  const swap = (index: number, step: -1 | 1) => {
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    next.forEach((row, i) => {
      if (row.sort !== (i + 1) * 10) write.mutate({ code: row.code, values: { sort: (i + 1) * 10 } });
    });
  };
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Choix proposés</h3>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="size-4" aria-hidden /> Ajouter un choix
        </Button>
      </div>
      <ul className="bw-admin-list">
        {options.map((option, index) =>
          editing === option.code ? (
            <li key={option.code} className="block">
              <OptionForm
                initial={option}
                pending={write.isPending}
                onCancel={() => setEditing(null)}
                onSubmit={(values) => write.mutate({ code: option.code, values })}
              />
            </li>
          ) : (
            <li key={option.code} data-muted={!option.active || undefined}>
              <button type="button" className="bw-admin-list__main" onClick={() => setEditing(option.code)}>
                <span className="grid size-8 place-items-center rounded-full bg-muted text-foreground">
                  <NamedIcon name={option.icon} size={16} />
                </span>
                <span className="min-w-0">
                  <strong>{option.label}</strong>
                  <small>
                    {option.delay_minutes ? `durée ${option.delay_minutes} min` : option.code}
                    {option.on_site ? " · sur place obligatoire" : ""}
                  </small>
                </span>
                {option.on_site ? <MapPin className="size-4 text-amber-600" aria-label="Sur place obligatoire" /> : null}
                {!option.active ? <span className="bw-admin-chip">Masqué</span> : null}
              </button>
              <span className="bw-admin-list__order">
                <button type="button" aria-label={`Monter ${option.label}`} disabled={index === 0} onClick={() => swap(index, -1)}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" aria-label={`Descendre ${option.label}`} disabled={index === options.length - 1} onClick={() => swap(index, 1)}>
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${option.label}`}
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${option.label} » ? S’il a déjà servi, masquez-le plutôt.`)) remove.mutate(option.code);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ),
        )}
        {!options.length && !adding ? <li className="p-3 text-xs text-muted-foreground">Aucun choix : la situation s’envoie telle quelle.</li> : null}
      </ul>
      {adding ? (
        <OptionForm
          pending={write.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(values) =>
            write.mutate({
              values: {
                ...values,
                situation,
                code: uniqueCode(`${situation}_${codeFrom(values.label ?? "", "_")}`, options.map((o) => o.code), "_"),
                sort: (options.at(-1)?.sort ?? 0) + 10,
              },
            })
          }
        />
      ) : null}
    </section>
  );
}

function OptionForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial?: OptionRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: Partial<OptionRow>) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "circle");
  const [onSite, setOnSite] = useState(initial?.on_site ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  return (
    <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <Label text="Libellé du choix">
        <Input value={label} maxLength={60} autoFocus onChange={(e) => setLabel(e.target.value)} />
      </Label>
      <div className="grid gap-1.5 text-sm font-medium">
        Picto
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onSite} onChange={(e) => setOnSite(e.target.checked)} />
        Signalement important : il faut être sur place (et une 2e confirmation pour la carte)
      </label>
      {initial ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} />
          Masquer ce choix
        </label>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          size="sm"
          disabled={pending || label.trim().length < 2}
          onClick={() => onSubmit({ label: label.trim(), icon, on_site: onSite, active })}
        >
          {initial ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}

function ServiceEditor({
  row,
  takenCodes,
  nextSort,
  onClose,
  onSaved,
}: {
  row: ServiceRow | null;
  takenCodes: string[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    label: row?.label ?? "",
    open_label: row?.open_label ?? "ouvert",
    closed_label: row?.closed_label ?? "fermé",
    icon: row?.icon ?? "store",
    active: row?.active ?? true,
  });
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      const values = {
        ...draft,
        label: draft.label.trim(),
        open_label: draft.open_label.trim(),
        closed_label: draft.closed_label.trim(),
      };
      if (values.label.length < 2) throw new Error("Indiquez un libellé.");
      const { error } = row
        ? await supabase.from("bw_signal_services").update(values).eq("code", row.code)
        : await supabase.from("bw_signal_services").insert({ ...values, code: uniqueCode(codeFrom(values.label), takenCodes), sort: nextSort });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      toast.success(row ? "Service mis à jour." : "Service ajouté.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bw_signal_services").delete().eq("code", row!.code);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      toast.success("Service supprimé.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={row ? row.label : "Nouveau service"}
      description="Proposé dans « Services du port », avec un état ouvert ou fermé."
      footer={
        <>
          {row ? (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Supprimer « ${row.label} » ? S’il a déjà servi, masquez-le plutôt.`)) remove.mutate();
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Supprimer
            </Button>
          ) : null}
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
        <Label text="Libellé">
          <Input value={draft.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} />
        </Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="État « ouvert »">
            <Input value={draft.open_label} maxLength={30} onChange={(e) => set({ open_label: e.target.value })} />
          </Label>
          <Label text="État « fermé »">
            <Input value={draft.closed_label} maxLength={30} onChange={(e) => set({ closed_label: e.target.value })} />
          </Label>
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          Picto
          <IconPicker value={draft.icon} onChange={(icon) => set({ icon })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!draft.active} onChange={(e) => set({ active: !e.target.checked })} />
          Masquer (plus proposé aux voyageurs)
        </label>
      </div>
    </AdminDrawer>
  );
}

/** Les 4 étapes de « Ma traversée » : libellés et cabas modifiables, codes fixes. */
function TripStepsAdmin() {
  const client = useQueryClient();
  const steps = useQuery(tripStepsQuery);
  const [open, setOpen] = useState<TripStepRow | null>(null);
  if (steps.data === null)
    return (
      <div className="bw-admin-surface p-5 text-sm">
        <p className="font-semibold">Étapes modifiables : à activer</p>
        <p className="mt-1 text-muted-foreground">
          Exécutez le script <code>supabase/migrations/20261102120000_ma_traversee_suivi.sql</code>{" "}
          dans Supabase. Les étapes actuelles y sont reprises.
        </p>
      </div>
    );
  return (
    <div className="bw-admin-surface p-4">
      <p className="text-xs text-muted-foreground">
        Les 4 étapes proposées aux voyageurs dans « Ma traversée ». Leur ordre et leur rôle ne
        changent pas ; vous modifiez les libellés et le cabas affiché.
      </p>
      <ul className="bw-admin-list mt-3">
        {(steps.data ?? []).map((row) => (
          <li key={row.code}>
            <button type="button" className="bw-admin-list__main" onClick={() => setOpen(row)}>
              <img src={row.image} alt="" width={44} height={44} className="rounded-full" />
              <span className="min-w-0">
                <strong>{row.short_label}</strong>
                <small>{row.label}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <TripStepEditor
          key={open.code}
          row={open}
          onClose={() => setOpen(null)}
          onSaved={() => void client.invalidateQueries({ queryKey: ["bw-trip-steps"] })}
        />
      ) : null}
    </div>
  );
}

function TripStepEditor({ row, onClose, onSaved }: { row: TripStepRow; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(row.label);
  const [short, setShort] = useState(row.short_label);
  const [image, setImage] = useState(row.image);
  const save = useMutation({
    mutationFn: async () => {
      if (label.trim().length < 2 || short.trim().length < 2) throw new Error("Libellés trop courts.");
      const { error } = await supabase
        .from("bw_trip_steps")
        .update({ label: label.trim(), short_label: short.trim(), image })
        .eq("code", row.code);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: () => {
      onSaved();
      toast.success("Étape mise à jour.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={`Étape « ${row.short_label} »`}
      description="Le libellé court s’affiche sous le cabas ; le libellé long dans les explications."
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
      <div className="grid gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <img src={image} alt="" width={64} height={64} />
          <span className="text-sm font-semibold">{short || "Aperçu"}</span>
        </div>
        <Label text="Libellé court (sous le cabas, 20 caractères)">
          <Input value={short} maxLength={20} onChange={(e) => setShort(e.target.value)} />
        </Label>
        <Label text="Libellé long">
          <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Label>
        <div className="grid gap-1.5 text-sm font-medium">
          Cabas affiché
          <div className="bw-cabas-picker" role="radiogroup" aria-label="Cabas">
            {cabasImages.map((src) => (
              <button
                key={src}
                type="button"
                role="radio"
                aria-checked={image === src}
                onClick={() => setImage(src)}
                title={src.split("/").pop()?.replace(/\.webp$/, "").replace(/^\d+_/, "").replace(/_/g, " ")}
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
