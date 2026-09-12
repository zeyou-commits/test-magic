import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
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

const reasons = [
  { value: "wrong_schedule", label: "Horaire inexact" },
  { value: "outdated_info", label: "Information obsolète" },
  { value: "missing_info", label: "Information manquante" },
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "other", label: "Autre" },
];

export function ReportButton({
  targetType,
  targetId,
  label = "Signaler une erreur",
}: {
  targetType: "port" | "route" | "departure" | "review" | "schedule";
  targetId: string;
  label?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]!.value);
  const [details, setDetails] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reports").insert({
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim() || null,
        reporter_id: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setOpen(false);
      setDetails("");
      toast.success("Merci, votre signalement a été transmis.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signaler une erreur</DialogTitle>
          <DialogDescription>
            Décrivez ce qui ne correspond pas à la réalité, nous vérifierons.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
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
          />
        </div>
        <DialogFooter>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Envoi…" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
