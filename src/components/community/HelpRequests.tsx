import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HeartHandshake, Siren } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Fonctions du script « contacts_incidents_entraide », pas encore dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

const NEEDS = {
  medical: "SOS médical",
  baby: "Couches, lait, bébé",
  water: "Eau",
  charger: "Chargeur",
  luggage: "Aide pour les bagages",
  elderly: "Aide pour une personne âgée",
} as const;
const POINTS = {
  checkin: "Point d'enregistrement",
  boarding_control: "Contrôle des cartes d'embarquement",
  port_entrance: "Entrée du port",
  vehicle_queue: "File des véhicules",
  ship_reception: "Réception du navire",
} as const;
type Need = keyof typeof NEEDS;
type Point = keyof typeof POINTS;

type HelpRequest = {
  id: string;
  need: Need;
  meeting_point: Point;
  created_at: string;
  mine: boolean;
  responders: number;
  responded: boolean;
  pseudo: string;
};

const helpListQuery = (departureId: string) => ({
  queryKey: ["help-requests", "departure", departureId],
  queryFn: async () => {
    const { data, error } = await db.rpc("bw_help_list", {
      p_kind: "departure",
      p_scope: departureId,
    });
    if (error) return [];
    return (data ?? []) as HelpRequest[];
  },
  refetchInterval: 60_000,
});

/**
 * Depuis un port : l'entraide passe toujours par une traversée du jour, que le voyageur choisit.
 * Sans départ aujourd'hui, la rubrique reste visible et dit quand elle s'ouvre.
 */
export function PortHelpRequests({
  crossings,
}: {
  crossings: { id: string; label: string; next: boolean }[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const counts = useQueries({ queries: crossings.map((item) => helpListQuery(item.id)) });
  const current = crossings.some((item) => item.id === picked)
    ? picked
    : (crossings.find((item) => item.next) ?? crossings[0])?.id;
  if (!current)
    return (
      <section
        className="rounded-xl border border-border bg-card p-3"
        aria-label="Entraide entre voyageurs"
      >
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">Entraide entre voyageurs</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Aucun départ aujourd'hui depuis ce port. L'entraide s'ouvre le jour d'une traversée.
        </p>
      </section>
    );
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs font-semibold">
        Votre traversée d'aujourd'hui
        <select
          value={current}
          onChange={(event) => setPicked(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 font-normal"
        >
          {crossings.map((item, index) => {
            const open = counts[index]?.data?.length ?? 0;
            return (
              <option key={item.id} value={item.id}>
                {item.label}
                {open ? ` · ${open} demande${open > 1 ? "s" : ""}` : ""}
              </option>
            );
          })}
        </select>
      </label>
      <HelpRequests key={current} kind="departure" scopeId={current} />
    </div>
  );
}

/**
 * Entraide entre voyageurs d'une même traversée : besoin et point de rendez-vous choisis dans une
 * liste, sans position ni message libre. Pas de réseau en mer : surtout à terre.
 */
export function HelpRequests({ scopeId }: { kind: "departure"; scopeId: string }) {
  const kind = "departure";
  const { user } = useAuth();
  const client = useQueryClient();
  const key = helpListQuery(scopeId).queryKey;
  const list = useQuery(helpListQuery(scopeId));
  const [need, setNeed] = useState<Need | null>(null);
  const [point, setPoint] = useState<Point>("boarding_control");
  const [formOpen, setFormOpen] = useState(false);
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  const call = useMutation({
    mutationFn: async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const { error } = await db.rpc(name, args);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const requests = list.data ?? [];

  return (
    <section
      className="rounded-xl border border-border bg-card p-3"
      aria-label="Entraide entre voyageurs"
    >
      <div className="flex items-center gap-2">
        <HeartHandshake className="size-4 text-primary" aria-hidden />
        <h3 className="flex-1 text-sm font-semibold">Entraide entre voyageurs</h3>
        {user && !formOpen ? (
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
            Demander de l'aide
          </Button>
        ) : null}
      </div>

      {requests.length ? (
        <ul className="mt-2 grid gap-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className={`rounded-lg border p-2 text-xs ${request.need === "medical" ? "border-red-300 bg-red-50" : "border-border"}`}
            >
              <p className="font-semibold">
                {NEEDS[request.need]} · {request.mine ? "votre demande" : request.pseudo}
              </p>
              <p className="mt-0.5">Rendez-vous : {POINTS[request.meeting_point]}</p>
              {request.need === "medical" ? <MedicalAdvice /> : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="flex-1 text-muted-foreground">
                  {request.responders
                    ? `${request.responders} personne(s) en route`
                    : "Personne n'a encore répondu"}
                </span>
                {request.mine ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      call.mutate({ name: "bw_help_close", args: { p_request: request.id } })
                    }
                  >
                    C'est réglé
                  </Button>
                ) : user && !request.responded ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      call.mutate({ name: "bw_help_respond", args: { p_request: request.id } })
                    }
                  >
                    J'y vais
                  </Button>
                ) : request.responded ? (
                  <span className="font-semibold text-primary">Vous avez répondu</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : !formOpen ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Couches, eau, chargeur, bagages : demandez aux voyageurs autour de vous.
          {user ? "" : " Connectez-vous pour demander ou proposer de l'aide."}
        </p>
      ) : null}

      {formOpen ? (
        <div className="mt-2 grid gap-2 border-t border-border pt-2">
          <p className="text-xs font-semibold">De quoi avez-vous besoin ?</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(NEEDS) as Need[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={need === item}
                onClick={() => setNeed(item)}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${
                  need === item
                    ? "border-foreground bg-foreground text-background"
                    : item === "medical"
                      ? "border-red-300 text-red-700"
                      : "border-border"
                }`}
              >
                {item === "medical" ? <Siren size={13} aria-hidden /> : null}
                {NEEDS[item]}
              </button>
            ))}
          </div>
          {need === "medical" ? <MedicalAdvice /> : null}
          <label className="grid gap-1 text-xs font-semibold">
            Point de rendez-vous
            <select
              value={point}
              onChange={(event) => setPoint(event.target.value as Point)}
              className="h-10 rounded-md border border-input bg-background px-2 font-normal"
            >
              {(Object.keys(POINTS) as Point[]).map((item) => (
                <option key={item} value={item}>
                  {POINTS[item]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground">
            Seuls votre pseudo, le besoin et ce point sont visibles, pendant 6 h au plus. Ne
            partagez pas de médicaments entre voyageurs.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!need || call.isPending}
              onClick={() => {
                call.mutate({
                  name: "bw_help_open",
                  args: { p_kind: kind, p_scope: scopeId, p_need: need, p_point: point },
                });
                setFormOpen(false);
                setNeed(null);
              }}
            >
              Envoyer
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MedicalAdvice() {
  return (
    <p className="mt-1 rounded-md bg-red-100 p-2 text-[11px] font-medium leading-relaxed text-red-900">
      Urgence : prévenez d'abord l'équipage à bord, le personnel du port à terre, ou appelez le 112
      (Europe), le 14 (Algérie). BledWay ne remplace pas les secours.
    </p>
  );
}
