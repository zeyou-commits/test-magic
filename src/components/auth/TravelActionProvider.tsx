import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Heart, LoaderCircle, Ship } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  clearTravelAction,
  pendingTravelAction,
  rememberTravelAction,
  saveTravelAction,
  travelActionLabel,
  type TravelAction,
} from "@/lib/notifications/actions";
import { pushCapability, registerPush } from "@/lib/notifications/push";
import { AccountAccessForm } from "./AccountAccessForm";
import { TravelActionContext as ActionContext } from "@/hooks/useTravelAction";

export function TravelActionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [action, setAction] = useState<TravelAction | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const savingRef = useRef(false);

  const complete = useCallback(
    async (intent: TravelAction, userId: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError("");
      try {
        await saveTravelAction(userId, intent);
        clearTravelAction();
        setSaved(true);
        await Promise.all(
          ["follow", "my-follows", "my-itinerary-watches"].map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        if (pushCapability() === "enabled") {
          try {
            const status = await registerPush(userId, false);
            if (status === "enabled") setPushMessage("Notifications activées sur cet appareil.");
          } catch {
            setPushMessage("Votre suivi est enregistré. Réessayez l’activation des notifications.");
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [queryClient],
  );

  // OAuth et confirmation d'e-mail reprennent l'intention sans relancer la recherche.
  useEffect(() => {
    if (!userId) return;
    const pending = pendingTravelAction();
    if (pending) {
      setAction(pending);
      setOpen(true);
      void complete(pending, userId);
    }
    // Un appareil déjà autorisé est réabonné après une nouvelle connexion.
    else if (pushCapability() === "enabled") void registerPush(userId, false).catch(() => {});
  }, [userId, complete]);

  const request = useCallback((intent: TravelAction) => {
    rememberTravelAction(intent);
    setAction(intent);
    setSaved(false);
    setAwaitingConfirmation(false);
    setError("");
    setPushMessage("");
    setOpen(true);
  }, []);

  async function activate() {
    if (!user || !action) return;
    // La demande native part pendant le geste utilisateur, avant l'écriture réseau.
    const push = registerPush(user.id).catch(() => "unavailable" as const);
    await complete(action, user.id);
    const result = await push;
    setPushMessage(
      result === "enabled"
        ? "Notifications activées sur cet appareil."
        : result === "denied"
          ? "Le suivi est actif. Autorisez les notifications dans les réglages du navigateur pour les recevoir ici."
          : "Retrouvez les notifications dans votre espace voyageur. Sur iPhone, ouvrez BledWay depuis l’écran d’accueil pour activer le push.",
    );
  }

  return (
    <ActionContext.Provider value={request}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (saving) return;
          setOpen(value);
          if (!value && !awaitingConfirmation) clearTravelAction();
        }}
      >
        <DialogContent className="bw-travel-dialog" onClick={(event) => event.stopPropagation()}>
          <div className="bw-travel-dialog-visual">
            <Ship className="size-8" aria-hidden />
            <span>Votre voyage, à portée de main</span>
          </div>
          <div className="bw-travel-dialog-body">
            <DialogTitle className="font-display text-2xl leading-tight">
              {saved
                ? "C’est enregistré !"
                : action?.type === "opening"
                  ? "Soyez prêt à réserver"
                  : "Gardez le cap sur votre voyage"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed">
              {saved
                ? "Retrouvez ce voyage et ses actualités dans votre espace personnel."
                : user
                  ? "Les prochaines informations seront regroupées dans votre espace voyageur."
                  : "Connectez-vous ou créez votre compte pour retrouver ce suivi et recevoir les informations utiles."}
            </DialogDescription>
            {action && (
              <div className="my-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
                <span className="mt-0.5 text-primary">
                  {action.type === "opening" ? (
                    <Bell className="size-5" />
                  ) : (
                    <Heart className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{travelActionLabel(action)}</p>
                  {action.type === "opening" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.origin} → {action.destination}
                    </p>
                  )}
                </div>
              </div>
            )}
            {!user ? (
              <AccountAccessForm onAwaitingConfirmation={() => setAwaitingConfirmation(true)} />
            ) : (
              <>
                {saved ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Check className="size-4" />{" "}
                      {action?.type === "opening"
                        ? "Alerte d’ouverture activée"
                        : "Ajouté à vos suivis"}
                    </p>
                    {!pushMessage && (
                      <button
                        type="button"
                        className="bw-action-primary w-full"
                        onClick={() => void activate()}
                      >
                        <Bell className="size-4" /> Activer les notifications sur cet appareil
                      </button>
                    )}
                    <a href="/compte" className="bw-action-secondary w-full">
                      Mon espace voyageur
                    </a>
                    <button
                      type="button"
                      className="w-full py-2 text-sm text-muted-foreground"
                      onClick={() => setOpen(false)}
                    >
                      Continuer à explorer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    className="bw-action-primary w-full"
                    onClick={() => void activate()}
                  >
                    {saving ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                    {saving
                      ? "Enregistrement…"
                      : action?.type === "opening"
                        ? "Activer mon alerte"
                        : "Suivre et recevoir les informations"}
                  </button>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
                <button
                  className="ml-2 underline"
                  onClick={() => {
                    if (action && user) void complete(action, user.id);
                  }}
                >
                  Réessayer
                </button>
              </p>
            )}
            {pushMessage && (
              <p role="status" className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {pushMessage}
              </p>
            )}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Rappels, préparatifs et actualités du bateau. Vos préférences restent modifiables à
              tout moment.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </ActionContext.Provider>
  );
}
