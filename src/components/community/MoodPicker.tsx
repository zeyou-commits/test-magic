import { CabasImg } from "@/components/CabasImg";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  communityKey,
  moodsFor,
  moodsQuery,
  setMood,
  setMoodItem,
} from "@/lib/community/travellers";
import { useLibrary } from "@/lib/community/library";
import { LibraryPicker } from "./LibraryPicker";

/**
 * Choisir son humeur du moment (24 h). Les humeurs du moment du voyage sont proposées en premier :
 * « Reste calme » au port, « Mal de mer » à bord… puis toute la bibliothèque d'images, par catégories.
 */
export function MoodPicker({
  open,
  onOpenChange,
  moment,
  current,
  currentImage = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moment: string | null;
  current: string | null;
  /** Image de l'humeur actuelle : repère l'image choisie dans la bibliothèque. */
  currentImage?: string | null;
}) {
  const client = useQueryClient();
  const moods = useQuery(moodsQuery).data ?? [];
  const list = moodsFor(moods, moment);
  const suggested = moment ? list.filter((mood) => mood.moments.includes(moment)) : [];
  const others = list.filter((mood) => !suggested.includes(mood));
  const save = useMutation({
    mutationFn: (code: string | null) => setMood(code),
    onSuccess: (_, code) => {
      void client.invalidateQueries({ queryKey: communityKey });
      toast.success(code ? "Humeur partagée pour 24 h." : "Humeur retirée.");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const library = useLibrary();
  const saveItem = useMutation({
    mutationFn: (item: string) => setMoodItem(item),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: communityKey });
      toast.success("Humeur partagée pour 24 h.");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Humeur choisie depuis la bibliothèque (pas une humeur à phrase) : on la retrouve par son image.
  const fromLibrary =
    current && !moods.some((mood) => mood.code === current)
      ? (library.rows.find((row) => row.image === currentImage)?.id ?? null)
      : null;
  const grid = (items: typeof list) => (
    <div className="bw-mood-grid">
      {items.map((mood) => (
        <button
          key={mood.code}
          type="button"
          aria-pressed={current === mood.code}
          disabled={save.isPending || saveItem.isPending}
          onClick={() => save.mutate(mood.code)}
        >
          <CabasImg src={mood.image} alt="" width={44} height={44} loading="lazy" />
          <span>
            {mood.emoji ? `${mood.emoji} ` : ""}
            {mood.label}
          </span>
          {current === mood.code ? <Check size={14} aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bw-mood-dialog">
        <DialogTitle>Votre humeur du moment</DialogTitle>
        <DialogDescription>
          Une petite bulle sur votre cabas, visible des autres voyageurs pendant 24 h.
        </DialogDescription>
        <div className="bw-mood-scroll">
          {suggested.length ? (
            <>
              <p className="bw-mood-group">Pour ce moment du voyage</p>
              {grid(suggested)}
              <p className="bw-mood-group">Toutes les humeurs</p>
            </>
          ) : null}
          {grid(others)}
          {library.managed ? (
            <>
              <p className="bw-mood-group">Ou n’importe quelle image de la bibliothèque</p>
              <LibraryPicker
                selected={fromLibrary}
                onPick={(row) => saveItem.mutate(row.id)}
                ariaLabel="Humeur depuis la bibliothèque"
                disabled={saveItem.isPending || save.isPending}
                size={44}
              />
            </>
          ) : null}
        </div>
        {current ? (
          <button
            type="button"
            className="bw-mood-clear"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            <X size={14} aria-hidden /> Retirer mon humeur
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
