import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  Check,
  ClipboardCheck,
  Heart,
  LoaderCircle,
  MessagesSquare,
  Navigation,
  Ship,
} from "lucide-react";
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
import { clearPendingChat, flushPendingChat, pendingChat } from "@/lib/ferry/chat";
import {
  isIos,
  isStandalone,
  pushCapability,
  registerPush,
  requestCatchUp,
} from "@/lib/notifications/push";
import { AccountAccessForm } from "./AccountAccessForm";
import { TripQuestion } from "./TripQuestion";
import { PushStatusLine } from "@/components/panel/PushStatusLine";
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
  const [draft, setDraft] = useState(false);
  const [chatNote, setChatNote] = useState("");
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
        // Le message écrit avant l'inscription part maintenant ; le suivi reste acquis s'il est refusé.
        try {
          if (await flushPendingChat()) setChatNote("Votre message est publié.");
        } catch (cause) {
          setChatNote(cause instanceof Error ? cause.message : "Message non envoyé.");
        }
        setSaved(true);
        await Promise.all(
          [
            "follow",
            "my-follows",
            "my-itinerary-watches",
            "my-trips",
            "my-journeys",
            "journey",
            "bw-chat",
          ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
        // Ce qui est déjà publié et toujours d'actualité pour ce suivi arrive tout de suite :
        // registerPush le demande une fois le téléphone abonné, sinon on le demande ici.
        let caughtUp = false;
        if (pushCapability() === "enabled") {
          try {
            const status = await registerPush(userId, false);
            caughtUp = status === "enabled";
            if (status === "enabled") setPushMessage("Notifications activées sur cet appareil.");
          } catch {
            setPushMessage("Votre suivi est enregistré. Réessayez l’activation des notifications.");
          }
        }
        if (!caughtUp) void requestCatchUp();
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
      setDraft(pendingChat() !== null);
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
    setDraft(pendingChat() !== null);
    setChatNote("");
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
          if (!value && !awaitingConfirmation) {
            clearTravelAction();
            clearPendingChat();
          }
        }}
      >
        <DialogContent className="bw-travel-dialog" onClick={(event) => event.stopPropagation()}>
          <div className="bw-travel-dialog-body">
            <DialogTitle className="font-display text-2xl leading-tight">
              {saved
                ? action?.type === "chat"
                  ? "C’est envoyé !"
                  : "C’est enregistré !"
                : draft
                  ? "Votre message est prêt"
                  : action?.type === "opening"
                    ? "Soyez prêt à réserver"
                    : "Gardez le cap sur votre voyage"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed">
              {!saved && draft
                ? user
                  ? "Confirmez que vous voyagez sur cette traversée : votre message part aussitôt."
                  : "Créez votre compte en quelques secondes : il part dès votre inscription, sans rien réécrire."
                : saved && action?.type === "chat"
                  ? "Vous serez prévenu dans la cloche si quelqu’un vous répond."
                  : saved
                    ? action?.type === "follow" && action.traveller
                      ? action.returnDepartureId
                        ? "Votre aller et votre retour sont suivis. Retrouvez les deux traversées dans votre espace voyageur."
                        : "Votre traversée est suivie. Vous pourrez ajouter votre retour depuis sa fiche."
                      : action?.type === "follow" && action.purpose === "curieux"
                        ? action.kind === "company"
                          ? "La compagnie est ajoutée à vos suivis : ses actualités vous seront signalées."
                          : "Le navire est ajouté à vos suivis, sans créer de voyage personnel."
                        : "Retrouvez ce voyage et ses actualités dans votre espace personnel."
                    : user
                      ? "Tout est gratuit et regroupé dans votre espace voyageur."
                      : "C’est gratuit, et ça vous accompagne de la route jusqu’au bled."}
            </DialogDescription>
            {action?.type === "follow" && action.traveller === undefined && !saved ? (
              <TripQuestion
                action={action}
                onAnswer={(next) => {
                  // La réponse est gardée si une connexion est demandée ensuite.
                  rememberTravelAction(next);
                  setAction(next);
                }}
                onDone={() => {
                  setOpen(false);
                  clearTravelAction();
                }}
              />
            ) : null}
            {action && !(action.type === "follow" && action.traveller === undefined && !saved) && (
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
                  {draft && !saved ? (
                    <p className="mt-1 text-xs text-muted-foreground">« {pendingChat()?.body} »</p>
                  ) : null}
                  {action.type === "opening" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.origin} → {action.destination}
                    </p>
                  )}
                </div>
              </div>
            )}
            {action?.type === "follow" &&
            action.traveller === undefined &&
            !saved ? null : !user ? (
              <AccountAccessForm
                onAwaitingConfirmation={() => setAwaitingConfirmation(true)}
                {...(draft ? { signupLabel: "Créer mon compte et envoyer" } : {})}
              />
            ) : (
              <>
                {saved ? (
                  <div className="space-y-3">
                    {chatNote ? (
                      <p role="status" className="text-sm font-semibold text-primary">
                        {chatNote}
                      </p>
                    ) : null}
                    {action?.type === "chat" ? null : (
                      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <Check className="size-4" />{" "}
                        {action?.type === "opening"
                          ? "Alerte d’ouverture activée"
                          : "Ajouté à vos suivis"}
                      </p>
                    )}
                    {/* État réel de ce téléphone : déjà actif, à activer, ou guide iPhone. */}
                    <PushStatusLine key={pushMessage} />
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
                      : draft
                        ? "Je voyage, envoyer mon message"
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
            {pushMessage && !saved && (
              <p role="status" className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {pushMessage}
              </p>
            )}
            {!saved && action?.type === "follow" && action.traveller !== undefined ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Changements de la traversée, bateau suivi en direct, salon des passagers
                {action.traveller ? " et préparatifs pas à pas" : ""}. Modifiable à tout moment.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </ActionContext.Provider>
  );
}

/**
 * Ce que cet appareil recevra vraiment, dit avant de valider le suivi : pas de promesse d'alerte
 * sur un téléphone qui ne peut pas la recevoir.
 */
function DeviceAlertState() {
  const [state, setState] = useState<"on" | "ask" | "blocked" | "ios" | "none" | null>(null);
  useEffect(() => {
    const capability = pushCapability();
    setState(
      isIos() && !isStandalone()
        ? "ios"
        : capability === "enabled"
          ? "on"
          : capability === "prompt"
            ? "ask"
            : capability === "denied"
              ? "blocked"
              : "none",
    );
  }, []);
  if (!state) return null;
  const text = {
    on: "Notifications activées sur cet appareil.",
    ask: "Notifications pas encore activées sur cet appareil : elles vous seront proposées en validant.",
    blocked:
      "Notifications bloquées sur cet appareil : vous retrouverez les changements dans la cloche et votre espace.",
    ios: "Sur iPhone, les notifications demandent d’ouvrir BledWay depuis l’écran d’accueil. En attendant, les changements arrivent dans la cloche.",
    none: "Ce navigateur ne reçoit pas de notifications : les changements arrivent dans la cloche et votre espace.",
  }[state];
  return (
    <small className="bw-travel-perks__device" data-state={state}>
      {text}
    </small>
  );
}
