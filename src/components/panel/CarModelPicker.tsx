import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Ruler, Search, X } from "lucide-react";
import { searchCarModels } from "@/lib/directferries/functions";
import { loadFromAccessories, type CarModel } from "@/lib/directferries/quote";
import { useDirectFerriesEnabled } from "./LiveFare";
import type { TripProfileValue } from "./TripProfile";

const metres = (cm: number | null) =>
  cm == null ? "?" : `${(cm / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/**
 * « Ma voiture exacte » : le modèle pris dans le catalogue Direct Ferries donne la vraie longueur
 * et la vraie hauteur ; le voyageur ajoute ce qu'il charge sur le toit ou à l'arrière.
 * Facultatif, et absent tant que le partenaire n'est pas branché.
 */
export function CarModelPicker({
  value,
  onChange,
}: {
  value: TripProfileValue;
  onChange: (value: TripProfileValue) => void;
}) {
  const enabled = useDirectFerriesEnabled();
  const search = useServerFn(searchCarModels);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ["directferries", "cars", query.toLowerCase()],
    queryFn: () => search({ data: { query } }),
    enabled: enabled && open && query.length >= 2,
    staleTime: 3600_000,
  });

  if (!enabled) return null;
  const car = value.car ?? null;
  const load = loadFromAccessories(value.accessories, value.load);
  const setLoad = (key: "extraHeight" | "extraLength", raw: string) => {
    const cm = Math.max(0, Math.min(key === "extraHeight" ? 300 : 800, Math.round(Number(raw) || 0)));
    onChange({ ...value, load: { ...load, [key]: cm } });
  };
  const choose = (model: CarModel) => {
    onChange({ ...value, car: model });
    setOpen(false);
    setText("");
  };

  if (car)
    return (
      <div className="space-y-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {car.make} {car.model}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Longueur {metres(car.length)} · hauteur {metres(car.height)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, car: null, load: null })}
            aria-label="Retirer ce modèle"
            className="grid size-8 place-items-center rounded-full border border-border hover:bg-muted"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Ajouté sur le toit (cm)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={300}
              value={load.extraHeight}
              onChange={(event) => setLoad("extraHeight", event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-sm font-semibold text-foreground"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Ajouté à l'arrière (cm)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={800}
              value={load.extraLength}
              onChange={(event) => setLoad("extraLength", event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-sm font-semibold text-foreground"
            />
          </label>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Ruler className="size-3.5 shrink-0" aria-hidden />
          Chargée : {metres(car.length == null ? null : car.length + load.extraLength)} de long,{" "}
          {metres(car.height == null ? null : car.height + load.extraHeight)} de haut. Mesurez
          galerie et bagages compris : la compagnie contrôle au port.
        </p>
      </div>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-left text-xs hover:bg-muted"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          <span className="block font-semibold">Préciser ma voiture (facultatif)</span>
          <span className="block text-[11px] text-muted-foreground">
            Marque et modèle, pour un prix au plus juste
          </span>
        </span>
      </button>
    );

  const models = results.data?.models ?? [];
  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-background p-2">
      <label className="flex items-center gap-2 rounded-lg bg-card px-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Marque puis modèle</span>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex. : Peugeot 308, Dacia Duster"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer la recherche">
          <X className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </label>
      {results.isFetching ? (
        <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Recherche…
        </p>
      ) : query.length >= 2 && !models.length ? (
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          Aucun modèle trouvé. Commencez par la marque, puis le modèle.
        </p>
      ) : null}
      {models.length ? (
        <ul className="max-h-56 overflow-y-auto" role="listbox" aria-label="Modèles trouvés">
          {models.map((model) => (
            <li key={`${model.makeModelId}-${model.model}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(model)}
                className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0 truncate font-semibold">
                  {model.make} {model.model}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {metres(model.length)} × {metres(model.height)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
