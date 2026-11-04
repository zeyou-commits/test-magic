import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { IllustrationSlot } from "@/lib/illustrations/catalog";
import {
  cutIllustration,
  DEFAULT_FRAMING,
  frameIllustration,
  type CutIllustration,
  type Framing,
  type PreparedIllustration,
} from "@/lib/illustrations/prepare";

/**
 * Prépare l'image choisie : détourage une seule fois par fichier, puis mise au format à chaque
 * réglage du cadrage (rapide).
 */
export function useFramedIllustration(
  file: File | null,
  slot: IllustrationSlot,
  keepBackground: boolean,
) {
  const [cut, setCut] = useState<CutIllustration | null>(null);
  const [framing, setFraming] = useState<Framing>(DEFAULT_FRAMING);
  const [prepared, setPrepared] = useState<PreparedIllustration | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setCut(null);
    setPrepared(null);
    setProblem(null);
    if (!file) return;
    let stale = false;
    cutIllustration(file, slot, keepBackground)
      .then((result) => {
        if (!stale) setCut(result);
      })
      .catch((cause: Error) => {
        if (!stale) setProblem(cause.message);
      });
    return () => {
      stale = true;
    };
  }, [file, keepBackground, slot]);

  // Un nouveau fichier repart du cadrage automatique.
  useEffect(() => setFraming(DEFAULT_FRAMING), [file]);

  useEffect(() => {
    if (!cut) return;
    let stale = false;
    frameIllustration(cut, slot, framing)
      .then((result) => {
        if (stale) URL.revokeObjectURL(result.url);
        else
          setPrepared((previous) => {
            if (previous) URL.revokeObjectURL(previous.url);
            return result;
          });
      })
      .catch((cause: Error) => {
        if (!stale) setProblem(cause.message);
      });
    return () => {
      stale = true;
    };
  }, [cut, framing, slot]);

  return { prepared, problem, framing, setFraming, ready: Boolean(cut) };
}

/** Zoom et position du dessin dans son cadre. */
export function FramingControls({
  framing,
  onChange,
}: {
  framing: Framing;
  onChange: (framing: Framing) => void;
}) {
  const changed =
    framing.zoom !== DEFAULT_FRAMING.zoom ||
    framing.x !== DEFAULT_FRAMING.x ||
    framing.y !== DEFAULT_FRAMING.y;
  const slider = (
    label: string,
    key: keyof Framing,
    min: number,
    max: number,
    step: number,
    shown: string,
  ) => (
    <label className="grid grid-cols-[88px_1fr_44px] items-center gap-2 text-xs">
      <span className="font-medium">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={framing[key]}
        onChange={(event) => onChange({ ...framing, [key]: Number(event.target.value) })}
        className="accent-emerald-700"
      />
      <span className="text-right tabular-nums text-muted-foreground">{shown}</span>
    </label>
  );
  return (
    <fieldset className="grid gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Cadrage</legend>
      {slider("Zoom", "zoom", 0.5, 2.5, 0.05, `${Math.round(framing.zoom * 100)} %`)}
      {slider("Gauche / droite", "x", -0.4, 0.4, 0.01, `${Math.round(framing.x * 100)}`)}
      {slider("Haut / bas", "y", -0.4, 0.4, 0.01, `${Math.round(framing.y * 100)}`)}
      {changed ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 justify-self-start text-xs font-medium text-emerald-800 hover:underline"
          onClick={() => onChange(DEFAULT_FRAMING)}
        >
          <RotateCcw className="size-3.5" /> Cadrage automatique
        </button>
      ) : null}
    </fieldset>
  );
}
