import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, ChevronDown, Crosshair, LocateFixed, MapPin, X } from "lucide-react";
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
import { preparePhoto, submitPhoto, type PreparedPhoto } from "@/lib/photos/photos";
import {
  submitStop,
  type BledRoute,
  type StopFeature,
  type StopKind,
} from "@/lib/routesDuBled/data";
import { VILLES, nomVille } from "@/lib/routesDuBled/villes";
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
const MAX_PHOTOS = 3;

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

/** « Près de Valence » (60 km au plus) ou « vers Valence » (150 km) : pour remplir le lieu tout seul. */
function presDe(c: { lat: number; lon: number }) {
  let best: string | null = null;
  let d2 = Infinity;
  for (const [n, [lo, la]] of Object.entries(VILLES)) {
    const dx = (lo - c.lon) * Math.cos((la * Math.PI) / 180);
    const dy = la - c.lat;
    const d = dx * dx + dy * dy;
    if (d < d2) {
      d2 = d;
      best = n;
    }
  }
  const km = Math.sqrt(d2) * 111;
  if (!best || km > 150) return "";
  return tr(km < 60 ? "ui.pageRoutesDuBled.presDe" : "ui.pageRoutesDuBled.versVille", {
    ville: nomVille(best),
  });
}

/**
 * « Ajouter un endroit » en deux temps : quoi et son nom (le reste est déduit du point touché), puis,
 * si on veut, photos et détails. Tout part en vérification : rien n'est publié sans l'accord de l'équipe.
 */
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
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [sending, setSending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [reglages, setReglages] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  const toggle = (f: StopFeature) =>
    set(
      "features",
      draft.features.includes(f) ? draft.features.filter((x) => x !== f) : [...draft.features, f],
    );

  // Le lieu se remplit tout seul depuis le point placé ; le voyageur peut le corriger.
  const auto = draft.coords ? presDe(draft.coords) : "";
  const place = draft.place.trim() || auto;
  const route = routes.find((r) => r.id === draft.route);
  const nameOk = draft.name.trim().length >= 2;
  const ready = nameOk && place.length >= 2;

  // On rouvre le formulaire : il reprend à la première étape.
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

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

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPreparing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next: PreparedPhoto[] = [];
      for (const f of Array.from(files).slice(0, room)) next.push(await preparePhoto(f));
      setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removePhoto = (i: number) =>
    setPhotos((p) => {
      URL.revokeObjectURL(p[i]!.url);
      return p.filter((_, j) => j !== i);
    });

  const send = async () => {
    if (!ready || !user) return;
    setSending(true);
    try {
      const id = await submitStop({
        route: draft.route,
        kind: draft.kind,
        name: draft.name.trim(),
        place,
        lat: draft.coords?.lat ?? null,
        lon: draft.coords?.lon ?? null,
        features: draft.features,
        direction: draft.direction,
        note: draft.note.trim(),
      });
      // Les photos suivent la halte ; une photo refusée par le serveur ne fait pas perdre la halte.
      let rates = 0;
      for (const ph of photos) {
        try {
          await submitPhoto("route_stop", id, user.id, ph);
        } catch {
          rates++;
        }
      }
      if (rates) toast.warning(tr("ui.pageRoutesDuBled.photoNonJointe"));
      toast.success(
        tr(
          draft.coords
            ? "ui.pageRoutesDuBled.merciPropositionCarnet"
            : "ui.pageRoutesDuBled.merciProposition",
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ["routes-du-bled", "mine"] });
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
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
            {step === 1
              ? tr("ui.pageRoutesDuBled.quAvezVousTrouve")
              : tr("ui.pageRoutesDuBled.detailsFacultatifs")}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? tr("ui.pageRoutesDuBled.etapeSur", { n: 1 })
              : tr("ui.pageRoutesDuBled.etapeSur", { n: 2 })}
          </DialogDescription>
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
        ) : step === 1 ? (
          <div className="rdb-dialog__body">
            <div className="rdb-kinds rdb-kinds--big" role="radiogroup">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  className="rdb-kind"
                  aria-checked={draft.kind === k}
                  aria-pressed={draft.kind === k}
                  data-kind={k}
                  onClick={() => set("kind", k)}
                >
                  <KindIcon kind={k} />
                  <span>{kindLabel(k)}</span>
                </button>
              ))}
            </div>

            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champNom")}
              <Input
                id="rdb-name"
                maxLength={80}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={tr("ui.pageRoutesDuBled.champNomExemple")}
                className="h-12 text-base"
              />
            </label>

            <div className="rdb-where">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span>
                {draft.coords
                  ? [auto || tr("ui.pageRoutesDuBled.pointPlace"), route?.name]
                      .filter(Boolean)
                      .join(" · ")
                  : tr("ui.pageRoutesDuBled.positionFacultative")}
              </span>
              <span className="rdb-where__btns">
                <button type="button" onClick={onPickOnMap}>
                  <Crosshair className="size-4" aria-hidden />
                  {draft.coords
                    ? tr("ui.pageRoutesDuBled.deplacer")
                    : tr("ui.pageRoutesDuBled.placerSurLaCarte")}
                </button>
                {!draft.coords ? (
                  <button type="button" onClick={locate} disabled={locating}>
                    <LocateFixed className="size-4" aria-hidden />
                    {tr("ui.pageRoutesDuBled.jeSuisSurPlace")}
                  </button>
                ) : null}
              </span>
            </div>

            <div className="rdb-dialog__foot">
              <Button onClick={() => setStep(2)} disabled={!nameOk} className="min-h-12 w-full">
                {tr("ui.pageRoutesDuBled.continuer")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rdb-dialog__body">
            <div className="grid gap-2">
              <p className="text-sm font-semibold">{tr("ui.pageRoutesDuBled.champPhotos")}</p>
              <div className="rdb-shots">
                {photos.map((p, i) => (
                  <div key={p.url} className="rdb-shot">
                    <img src={p.url} alt="" />
                    <button
                      type="button"
                      aria-label={tr("ui.pageRoutesDuBled.retirerPhoto")}
                      onClick={() => removePhoto(i)}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <button
                    type="button"
                    className="rdb-shot rdb-shot--add"
                    onClick={() => fileRef.current?.click()}
                    disabled={preparing}
                  >
                    <Camera className="size-6" aria-hidden />
                    <span>
                      {preparing
                        ? tr("ui.pageRoutesDuBled.preparationPhoto")
                        : tr("ui.pageRoutesDuBled.ajouterPhoto")}
                    </span>
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void addFiles(e.target.files)}
              />
              <p className="text-xs text-muted-foreground">
                {tr("ui.pageRoutesDuBled.photosVerif")}
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

            <label className="grid gap-1.5 text-sm font-semibold">
              {tr("ui.pageRoutesDuBled.champNote")}
              <Textarea
                id="rdb-note"
                maxLength={500}
                rows={2}
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder={tr("ui.pageRoutesDuBled.champNoteExemple")}
              />
            </label>

            {/* Sans point placé, le lieu doit être écrit : on l'ouvre d'office. */}
            <div className="rdb-plus">
              <button
                type="button"
                aria-expanded={reglages || !place}
                onClick={() => setReglages(!reglages)}
              >
                {tr("ui.pageRoutesDuBled.plusReglages")}
                <ChevronDown className="size-4" aria-hidden />
              </button>
              {reglages || !place ? (
                <div className="grid gap-4 pt-3">
                  <label className="grid gap-1.5 text-sm font-semibold">
                    {tr("ui.pageRoutesDuBled.champLieu")}
                    <Input
                      id="rdb-place"
                      maxLength={120}
                      value={draft.place}
                      onChange={(e) => set("place", e.target.value)}
                      placeholder={auto || tr("ui.pageRoutesDuBled.champLieuExemple")}
                    />
                  </label>
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
                </div>
              ) : null}
            </div>

            <div className="rdb-dialog__foot rdb-dialog__foot--2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="min-h-12"
                aria-label={tr("ui.pageRoutesDuBled.retour")}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <Button onClick={send} disabled={!ready || sending || preparing} className="min-h-12">
                {sending
                  ? tr("ui.pageRoutesDuBled.envoi")
                  : tr("ui.pageRoutesDuBled.envoyerProposition")}
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {tr("ui.pageRoutesDuBled.verificationAvantPublication")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
