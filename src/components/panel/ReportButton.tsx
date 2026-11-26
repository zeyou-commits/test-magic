import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";
import { tr } from "@/lib/i18n";

const reasons = [
  { value: "wrong_schedule", get label() { return tr("ui.reportButton.horaireInexact"); } },
  { value: "outdated_info", get label() { return tr("ui.reportButton.informationObsolete"); } },
  { value: "missing_info", get label() { return tr("ui.reportButton.informationManquante"); } },
  { value: "vessel_immobilized", get label() { return tr("ui.reportButton.navireImmobilise"); } },
  { value: "incident_feedback", get label() { return tr("ui.reportButton.alerteNavireInexacteOuDepassee"); } },
  { value: "inappropriate", get label() { return tr("ui.reportButton.contenuInapproprie"); } },
  { value: "other", get label() { return tr("ui.reportButton.autre"); } },
];

export function ReportButton({
  targetType,
  targetId,
  label = tr("ui.reportButton.signalerUneErreur"),
  initialDetails = "",
  initialReason = "wrong_schedule",
  variant = "button",
  shown,
}: {
  /** Ce que le voyageur a sous les yeux (horaire, navire…), transmis à l'équipe avec le signalement. */
  shown?: Record<string, string | number | null>;
  targetType: "port" | "route" | "departure" | "review" | "schedule" | "vessel" | "company";
  targetId: string;
  label?: string;
  initialDetails?: string;
  initialReason?: string;
  /** « link » : lien discret en pied de fiche. */
  variant?: "button" | "link";
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(initialReason);
  const [details, setDetails] = useState(initialDetails);

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connectez-vous pour envoyer un signalement.");
      // Contexte pour l'équipe : la page et ce qui était affiché au moment du signalement.
      const context =
        typeof window === "undefined"
          ? null
          : {
              page: `${window.location.pathname}${window.location.search}`.slice(0, 300),
              ...(shown ? { shown } : {}),
            };
      const { error } = await (
        supabase as unknown as import("@supabase/supabase-js").SupabaseClient
      )
        .from("reports")
        .insert({
          target_type: targetType,
          target_id: targetId,
          reason,
          message: details.trim() || null,
          reporter_id: user.id,
          context,
        });

      if (error)
        throw new Error("Le signalement n'a pas pu être envoyé. Réessayez dans quelques instants.");
    },

    onSuccess: () => {
      setOpen(false);
      setDetails("");
      toast.success(tr("ui.reportButton.merciVotreSignalementAEte"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setDetails(initialDetails); setReason(initialReason); } }}>
      <DialogTrigger asChild>
        {variant === "link" ? (
          <button type="button" className="bw-report-link">
            <Flag size={13} aria-hidden /> {label}
          </button>
        ) : (
          <Button variant="outline" size="sm">
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("ui.reportButton.signalerUneErreur")}</DialogTitle>
          <DialogDescription>
            {tr("ui.reportButton.decrivezCeQuiNeCorrespond")}
          </DialogDescription>
        </DialogHeader>
        {!user ? (
          <div className="grid gap-3 rounded-xl bg-secondary p-4 text-sm">
            <p>
              {tr("ui.reportButton.pourEviterLesAbusIl")}
            </p>
            <Button asChild>
              <Link to="/auth">{tr("ui.reportButton.seConnecterOuCreerUn")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label={tr("ui.reportButton.motifDuSignalement")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={tr("ui.reportButton.detailsFacultatif")}
              rows={4}
              aria-label={tr("ui.reportButton.detailsDuSignalement")}
            />
          </div>
        )}
        {user ? (
          <DialogFooter>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? tr("ui.reportButton.envoi") : tr("ui.reportButton.envoyer")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
