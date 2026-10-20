import type { ReactNode } from "react";
import { primaryLink } from "@/components/editorial/Editorial";
export const inputClass =
  "mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
export function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 1_000_000_000,
  step = "any",
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: string;
  optional?: boolean;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
      {optional ? <span className="font-normal text-muted-foreground"> · facultatif</span> : null}
      <input
        id={id}
        name={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}
export function CalculatorForm({
  children,
  onCalculate,
  onEdit,
  example,
}: {
  children: ReactNode;
  onCalculate: () => void;
  onEdit: () => void;
  example: () => void;
}) {
  return (
    <form
      className="space-y-6"
      onChange={onEdit}
      onSubmit={(e) => {
        e.preventDefault();
        onCalculate();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-4">
        <button className={primaryLink} type="submit">
          Calculer avec mes données
        </button>
        <button
          type="button"
          onClick={example}
          className="min-h-11 text-sm font-semibold text-primary underline underline-offset-4"
        >
          Remplir un exemple fictif
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Calcul dans votre navigateur. Aucun envoi des champs par cet outil. L'exemple sert
        uniquement à montrer le fonctionnement.
      </p>
    </form>
  );
}
export function ResultPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5 leading-relaxed"
    >
      {children}
    </div>
  );
}
export function InvalidResult() {
  return (
    <ResultPanel>
      <p>
        Vérifiez les champs : les montants doivent être positifs ou nuls et le nombre de personnes
        doit être un entier compris entre 1 et 99.
      </p>
    </ResultPanel>
  );
}
