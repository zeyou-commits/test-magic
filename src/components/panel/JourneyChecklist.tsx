import { useEffect, useState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import { getBoardingMilestones } from "@/lib/ferry/boarding";
import type { Port } from "@/lib/ferry/types";

const items = [
  { id: "tickets", label: "Billets et confirmation de réservation" },
  { id: "identity", label: "Passeports, titres et documents d’entrée" },
  { id: "vehicle", label: "Carte grise, assurance et documents du véhicule" },
  { id: "luggage", label: "Bagages, médicaments et essentiels à bord" },
];

export function JourneyChecklist({ departureId, departureAt, port, compact = false }: { departureId: string; departureAt: string; port: Pick<Port, "name" | "country_code">; /** Fiche « Votre traversée » : repère horaire déjà affiché, liste resserrée. */ compact?: boolean }) {
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    try { setChecked(JSON.parse(localStorage.getItem(`bw-checklist:${departureId}`) ?? "[]")); }
    catch { setChecked([]); }
  }, [departureId]);
  const milestones = getBoardingMilestones(departureAt, port, { hasVehicle: true });
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
  return <section className="my-4 rounded-2xl border border-primary/20 bg-[#f2f8f4] p-4"><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" aria-hidden /><h3 className="font-semibold">Préparer ma traversée</h3></div>{milestones && <div className="mt-3 rounded-xl bg-white p-3"><strong className="text-sm">À {port.name} vers {milestones.callLabel}</strong><p className="mt-0.5 text-xs text-muted-foreground">Repère : 4 h avant le départ, heure locale du port. Confirmez l’heure limite d’enregistrement auprès de la compagnie.</p></div>}<div className="mt-3 grid gap-1.5">{items.map((item) => <label key={item.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs hover:bg-white"><input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} className="sr-only" /><span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-md border ${checked.includes(item.id) ? "border-primary bg-primary text-white" : "border-border bg-white"}`}>{checked.includes(item.id) && <Check className="size-3.5" />}</span><span className={checked.includes(item.id) ? "text-muted-foreground line-through" : ""}>{item.label}</span></label>)}</div></section>;
}
