// Avatars de voyageurs génériques façon Waze : aucun visage réel, aucune donnée personnelle.
const PALETTE = ["#f6c99a", "#a8d8c8", "#b9c8f2", "#f2b8c6", "#d8c6f2", "#f4dc8e"];

function hash(text: string) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1)
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  return value;
}

/** Petit visage souriant, dessiné en SVG (pas d'image chargée). */
export function TravelerFace({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="bw-traveler-face">
      <circle cx="10" cy="10" r="9.25" fill={color} stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="7.2" cy="8.6" r="1.1" fill="#24313f" />
      <circle cx="12.8" cy="8.6" r="1.1" fill="#24313f" />
      <path
        d="M6.8 12.1c1.7 1.9 4.7 1.9 6.4 0"
        fill="none"
        stroke="#24313f"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pile de 1 à 3 avatars selon le nombre de voyageurs qui signalent ou confirment. */
export function SignalAvatars({
  count,
  seed,
  size = 18,
}: {
  count: number;
  seed: string;
  size?: number;
}) {
  const shown = Math.max(1, Math.min(3, count));
  const start = hash(seed);
  return (
    <span className="bw-signal-avatars" aria-hidden>
      {Array.from({ length: shown }, (_, index) => (
        <TravelerFace
          key={index}
          size={size}
          color={PALETTE[(start + index * 2) % PALETTE.length] ?? "#f6c99a"}
        />
      ))}
    </span>
  );
}
