import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { tr } from "@/lib/i18n";
import {
  submitStop,
  type BledRoute,
  type StopFeature,
  type StopKind,
} from "@/lib/routesDuBled/data";
import { FeatureIcon, KindIcon, featureLabel, kindLabel } from "./StopVisuals";

const KINDS: StopKind[] = [
  "aire",
  "carburant",
  "manger",
  "priere",
  "dormir",
  "garage",
  "billets",
  "autre",
];
const FEATURES: StopFeature[] = [
  "h24",
  "parking_sur",
  "halal",
  "priere",
  "ablutions",
  "douches",
  "billets",
  "dormir",
  "manger",
  "dab",
];

export type Draft = {
  route: string;
  kind: StopKind;
  name: string;
  place: string;
  features: StopFeature[];
  direction: "aller" | "retour" | "both";
  note: string;
  coords: { lat: number; lon: number } | null;
};

export const emptyDraft = (route: string): Draft => ({
  route,
  kind: "aire",
  name: "",
  place: "",
  features: [],
  direction: "both",
  note: "",
  coords: null,
});

/** « Ajouter une halte » : la proposition part en vérification, elle n'est publiée qu'après l'accord de l'équipe. */
export function AddStopDialog({
  open,
  onOpenChange,
  routes,
  draft,
  setDraft,
  onPickOnMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routes: BledRoute[];
  draft: Draft;
  setDraft: (d: Draft) => void;
  onPickOnMap: () => void;
}) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  const toggle = (f: StopFeature) =>
    set(
      "features",
      draft.features.includes(f) ? draft.features.filter((x) => x !== f) : [...draft.features, f],
    );
  const ready = draft.name.trim().length >= 2 && draft.place.trim().length >= 2;

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.error(tr("ui.pageRoutesDuBled.positionIndisponible"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set("coords", {
          lat: +pos.coords.latitude.toFixed(5),
          lon: +pos.coords.longitude.toFixed(5),
        });
      },
      () => {
        setLocating(false);
        toast.error(tr("ui.pageRoutesDuBled.positionRefusee"));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const send = async () => {
    if (!ready) return;
    setSending(true);
    try {
      await submitStop({
        route: draft.route,
        kind: draft.kind,
        name: draft.name.trim(),
        place: draft.place.trim(),
        lat: draft.coords?.lat ?? null,
        lon: draft.coords?.lon ?? null,
        features: draft.features,
        direction: draft.direction,
        note: draft.note.trim(),
      });
      toast.success(tr("ui.pageRoutesDuBled.merciProposition"));
      setDraft(emptyDraft(draft.route));
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rdb-dialog max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {tr("ui.pageRoutesDuBled.ajouterUneHalte")}
          </DialogTitle>
          <DialogDescription>{tr("ui.pageRoutesDuBled.ajouterIntro")}</DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="grid gap-3 rounded-2xl border border-border p-4 text-sm">
            <p>{tr("ui.pageRoutesDuBled.connexionRequise")}</p>
            <Button asChild>
              <Link to="/auth" search={{ next: "/routes-du-bled" } as never}>
                {tr("ui.pageRoutesDuBled.seConnecter")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champRoute")}
              <select
                id="rdb-route"
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal"
                value={draft.route}
                onChange={(e) => set("route", e.target.value)}
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-semibold">
                {tr("ui.pageRoutesDuBled.champType")}
              </legend>
              <div className="rdb-kinds">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="rdb-kind"
                    aria-pressed={draft.kind === k}
                    data-kind={k}
                    onClick={() => set("kind", k)}
                  >
                    <KindIcon kind={k} />
                    <span>{kindLabel(k)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champNom")}
              <Input
                id="rdb-name"
                maxLength={80}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={tr("ui.pageRoutesDuBled.champNomExemple")}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champLieu")}
              <Input
                id="rdb-place"
                maxLength={120}
                value={draft.place}
                onChange={(e) => set("place", e.target.value)}
                placeholder={tr("ui.pageRoutesDuBled.champLieuExemple")}
              />
            </label>

            <div className="grid gap-2">
              <p className="text-sm font-semibold">{tr("ui.pageRoutesDuBled.champPosition")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onPickOnMap}>
                  <Crosshair className="size-4" aria-hidden />
                  {tr("ui.pageRoutesDuBled.placerSurLaCarte")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={locate}
                  disabled={locating}
                >
                  <LocateFixed className="size-4" aria-hidden />
                  {tr("ui.pageRoutesDuBled.jeSuisSurPlace")}
                </Button>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {draft.coords
                  ? tr("ui.pageRoutesDuBled.positionPlacee", {
                      lat: draft.coords.lat,
                      lon: draft.coords.lon,
                    })
                  : tr("ui.pageRoutesDuBled.positionFacultative")}
              </p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-semibold">
                {tr("ui.pageRoutesDuBled.champEquipements")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="rdb-chip"
                    aria-pressed={draft.features.includes(f)}
                    onClick={() => toggle(f)}
                  >
                    <FeatureIcon feature={f} />
                    {featureLabel(f)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-semibold">
                {tr("ui.pageRoutesDuBled.champSens")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["both", "aller", "retour"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="rdb-chip"
                    aria-pressed={draft.direction === d}
                    onClick={() => set("direction", d)}
                  >
                    {d === "both"
                      ? tr("ui.pageRoutesDuBled.sensLesDeux")
                      : d === "aller"
                        ? tr("ui.pageRoutesDuBled.sensAller")
                        : tr("ui.pageRoutesDuBled.sensRetour")}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champNote")}
              <Textarea
                id="rdb-note"
                maxLength={500}
                rows={3}
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder={tr("ui.pageRoutesDuBled.champNoteExemple")}
              />
            </label>

            <Button onClick={send} disabled={!ready || sending} className="min-h-11">
              {sending
                ? tr("ui.pageRoutesDuBled.envoi")
                : tr("ui.pageRoutesDuBled.envoyerProposition")}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              {tr("ui.pageRoutesDuBled.verificationAvantPublication")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
