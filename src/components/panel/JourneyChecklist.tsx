import { useEffect, useState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import type { Port } from "@/lib/ferry/types";
import { getBoardingMilestones } from "@/lib/ferry/boarding";

const items = [
  { id: "tickets", label: "Billets et confirmation de réservation" },
  { id: "identity", label: "Passeports, titres et documents d’entrée" },
  { id: "vehicle", label: "Carte grise, assurance et documents du véhicule" },
  { id: "luggage", label: "Bagages, médicaments et essentiels à bord" },
];

export function JourneyChecklist({ departureId, departureAt, presentationMinutes, port, compact = false }: { departureId: string; departureAt: string; presentationMinutes?: number | null | undefined; port: Pick<Port, "name" | "country_code">; /** Fiche « Votre traversée » : repère horaire déjà affiché, liste resserrée. */ compact?: boolean }) {
  const [checked, setChecked] = useState<string[]>([]);
  const presentation = getBoardingMilestones(departureAt, port, { presentationMinutes });
  useEffect(() => {
    try { setChecked(JSON.parse(localStorage.getItem(`bw-checklist:${departureId}`) ?? "[]")); }
    catch { setChecked([]); }
  }, [departureId]);
  function toggle(id: string) {
    const next = checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id];
    setChecked(next);
    try { localStorage.setItem(`bw-checklist:${departureId}`, JSON.stringify(next)); } catch { /* stockage facultatif */ }
  }
  if (compact)
    return (
      <section className="bw-checklist" aria-label="Avant de partir">
        <h3>
          <ClipboardCheck size={15} aria-hidden /> Avant de partir
          <small>{checked.length}/{items.length}</small>
        </h3>
        <div>
          {items.map((item) => (
            <label key={item.id} data-done={checked.includes(item.id)}>
              <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} className="sr-only" />
              <span aria-hidden>{checked.includes(item.id) && <Check size={12} />}</span>
              {item.label}
            </label>
          ))}
        </div>
      </section>
    );
  return <section className="my-4 rounded-2xl border border-primary/20 bg-[#f2f8f4] p-4"><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" aria-hidden /><h3 className="font-semibold">Préparer ma traversée</h3></div><p className="mt-2 text-xs text-muted-foreground">À {port.name} : {presentation?.callLabel ?? "heure à vérifier"} · {presentationMinutes != null ? "consigne renseignée" : "repère de 4 h par défaut"}. Vérifiez votre billet.</p><div className="mt-3 grid gap-1.5">{items.map((item) => <label key={item.id} className="relative flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs hover:bg-white"><input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} className="sr-only" /><span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-md border ${checked.includes(item.id) ? "border-primary bg-primary text-white" : "border-border bg-white"}`}>{checked.includes(item.id) && <Check className="size-3.5" />}</span><span className={checked.includes(item.id) ? "text-muted-foreground line-through" : ""}>{item.label}</span></label>)}</div></section>;
}
