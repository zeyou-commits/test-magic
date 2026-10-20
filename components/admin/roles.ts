import { Crown, PenLine, ShieldCheck } from "lucide-react";
import type { TeamRole } from "@/lib/admin/team.functions";

export const ROLE_INFO: Record<
  TeamRole,
  { label: string; description: string; icon: typeof Crown }
> = {
  admin: {
    label: "Administrateur",
    description: "Accès complet : équipe et droits, imports, données.",
    icon: Crown,
  },
  editor: {
    label: "Éditeur",
    description: "Départs, calendriers, ports, lignes et navires.",
    icon: PenLine,
  },
  moderator: {
    label: "Modérateur",
    description: "Avis des voyageurs et signalements.",
    icon: ShieldCheck,
  },
};
