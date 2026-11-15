import { useCallback, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tr } from "@/lib/i18n";

/**
 * Protège une saisie en cours : tant que `dirty` est vrai, fermer la fenêtre, changer de page
 * ou fermer l'onglet demande d'abord « Abandonner ? ». Seuls les changements de page comptent :
 * les filtres et la fiche ouverte (paramètres d'URL) restent libres.
 */
export function useDraftGuard(dirty: boolean): {
  guardClose: (close: () => void) => void;
  guardDialog: ReactNode;
} {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const leaving = useRef(false);

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirtyRef.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  const asking = pendingClose !== null || blocker.status === "blocked";
  const askingRef = useRef(asking);
  askingRef.current = asking;

  const guardClose = useCallback((close: () => void) => {
    if (!dirtyRef.current) return close();
    // Un clic dans la question elle-même ne doit pas la reposer.
    if (askingRef.current) return;
    setPendingClose(() => close);
  }, []);

  const stay = () => {
    setPendingClose(null);
    if (blocker.status === "blocked") blocker.reset();
  };
  const leave = () => {
    leaving.current = true;
    const close = pendingClose;
    setPendingClose(null);
    if (blocker.status === "blocked") blocker.proceed();
    else close?.();
    window.setTimeout(() => {
      leaving.current = false;
    }, 0);
  };

  const guardDialog = (
    <AlertDialog
      open={asking}
      onOpenChange={(open) => {
        if (!open && !leaving.current) stay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("ui.draftGuard.titre")}</AlertDialogTitle>
          <AlertDialogDescription>{tr("ui.draftGuard.explication")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={stay}>{tr("ui.draftGuard.continuer")}</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>{tr("ui.draftGuard.abandonner")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guardClose, guardDialog };
}
