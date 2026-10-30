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

const reasons = [
  { value: "wrong_schedule", label: "Horaire inexact" },
  { value: "outdated_info", label: "Information obsolète" },
  { value: "missing_info", label: "Information manquante" },
  { value: "vessel_immobilized", label: "Navire immobilisé" },
  { value: "incident_feedback", label: "Alerte navire inexacte ou dépassée" },
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "other", label: "Autre" },
];

export function ReportButton({
  targetType,
  targetId,
  label = "Signaler une erreur",
  initialDetails = "",
  initialReason = "wrong_schedule",
  variant = "button",
}: {
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
      const { error } = await supabase.from("reports").insert({
        target_type: targetType,
        target_id: targetId,
        reason,
        message: details.trim() || null,
        reporter_id: user.id,
      });

      if (error)
        throw new Error("Le signalement n'a pas pu être envoyé. Réessayez dans quelques instants.");
    },

    onSuccess: () => {
      setOpen(false);
      setDetails("");
      toast.success("Merci, votre signalement a été transmis.");
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
          <DialogTitle>Signaler une erreur</DialogTitle>
          <DialogDescription>
            Décrivez ce qui ne correspond pas à la réalité, nous vérifierons.
          </DialogDescription>
        </DialogHeader>
        {!user ? (
          <div className="grid gap-3 rounded-xl bg-secondary p-4 text-sm">
            <p>
              Pour éviter les abus, il faut être connecté pour envoyer un signalement. C’est gratuit
              et rapide.
            </p>
            <Button asChild>
              <Link to="/auth">Se connecter ou créer un compte</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Motif du signalement">
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
              placeholder="Détails (facultatif)"
              rows={4}
              aria-label="Détails du signalement"
            />
          </div>
        )}
        {user ? (
          <DialogFooter>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
