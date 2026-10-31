import { useEffect, useSyncExternalStore } from "react";
import { MessageCircle, X } from "lucide-react";
import { moodIcon, type Mood } from "@/lib/community/travellers";

/**
 * Bulle de BD de mon humeur, accrochée à mon avatar (en-tête sur ordinateur, onglet « Moi » sur
 * téléphone). Elle s'ouvre quand l'humeur change et une fois par jour, puis se réduit au bout de
 * 6 s en un badge picto sur l'avatar ; un toucher sur le badge la rouvre.
 * L'état est partagé : les deux emplacements (ordinateur et téléphone) restent d'accord.
 */
const STORAGE_KEY = "bw-mood-bubble";
const AUTO_CLOSE_MS = 6000;

let open = false;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function setOpen(next: boolean) {
  window.clearTimeout(timer);
  open = next;
  if (next) timer = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  emit();
}

const today = () => new Date().toLocaleDateString("en-CA");

/** Ouverture automatique : nouvelle humeur, ou première visite du jour avec cette humeur. */
function announce(code: string) {
  let seen: { code?: string; day?: string } = {};
  try {
    seen = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    /* stockage indisponible : on ouvre quand même */
  }
  if (seen.code === code && seen.day === today()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, day: today() }));
  } catch {
    /* stockage facultatif */
  }
  setOpen(true);
}

export function MoodBubble({ mood, placement }: { mood: Mood | null; placement: "below" | "above" }) {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => false);
  const code = mood?.code ?? null;
  useEffect(() => {
    if (code) announce(code);
    else if (open) setOpen(false);
  }, [code]);
  if (!mood) return null;
  const icon = moodIcon(mood.code);
  return (
    <span className="bw-mood-bubble" data-placement={placement} data-open={isOpen || undefined}>
      <button
        type="button"
        className="bw-mood-bubble__badge"
        aria-label={`Mon humeur : ${mood.label}`}
        aria-expanded={isOpen}
        title={mood.label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!isOpen);
        }}
      >
        {icon ? <img src={icon} alt="" width={20} height={20} /> : <MessageCircle size={13} aria-hidden />}
      </button>
      {isOpen ? (
        <span className="bw-mood-bubble__panel" role="status">
          {icon ? <img src={icon} alt="" width={26} height={26} /> : null}
          <span>{mood.label}</span>
          <button
            type="button"
            className="bw-mood-bubble__close"
            aria-label="Réduire la bulle d'humeur"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            <X size={13} aria-hidden />
          </button>
        </span>
      ) : null}
    </span>
  );
}
