import { ClipboardCheck } from "lucide-react";
import { getBoardingMilestones } from "@/lib/ferry/boarding";

/** L'heure au port. Les choses à préparer sont dans le parcours (TripPreparation). */
export function JourneyChecklist({ departureAt, presentationMinutes, port }: { departureAt: string; presentationMinutes?: number | null | undefined; port: NonNullable<Parameters<typeof getBoardingMilestones>[1]> & { name: string } }) {
  const presentation = getBoardingMilestones(departureAt, port, { presentationMinutes });
  const onFoot = getBoardingMilestones(departureAt, port, { presentationMinutes, onFoot: true });
  return <section className="my-4 rounded-2xl border border-primary/20 bg-[#f2f8f4] p-4"><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" aria-hidden /><h3 className="font-semibold">L’heure au port</h3></div><p className="mt-2 text-xs text-muted-foreground">À {port.name} : véhicule {presentation?.callLabel ?? "heure à vérifier"}, à pied {onFoot?.callLabel ?? "heure à vérifier"} · {presentationMinutes != null ? "consigne renseignée" : "repère 4 h / 3 h"}. Vérifiez votre billet.</p></section>;
}
