import type { CSSProperties, ReactNode } from "react";
import {
  BadgeCheck,
  CalendarDays,
  FileText,
  Luggage,
  MapPin,
  Stamp,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type SceneKey = "bonjour" | "depart" | "papiers" | "route";

const perso = (name: string) => `/cabas/persos/${name}.webp`;

/** Une position dans la scène, en pourcentage, et l'ordre d'entrée. */
const at = (x: number, y: number, order: number, extra?: CSSProperties) =>
  ({ left: `${x}%`, top: `${y}%`, "--o": order, ...extra }) as CSSProperties;

function Bubble({
  icon: Icon,
  label,
  style,
  tone,
}: {
  icon: LucideIcon;
  label?: string;
  style: CSSProperties;
  tone?: "gold" | "blue" | "rose";
}) {
  return (
    <span className="bw-sc__bub" data-tone={tone} style={style}>
      <Icon size={17} strokeWidth={2.2} />
      {label ? <b>{label}</b> : null}
    </span>
  );
}

function Char({ src, style, size }: { src: string; style: CSSProperties; size: number }) {
  return (
    <img
      className="bw-sc__char"
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ ...style, width: `${size}%` }}
    />
  );
}

/**
 * Les scènes du démarrage : les personnages de BledWay (la 504, la famille de cabas) dans un
 * décor pastel dessiné, avec des bulles qui disent le sujet. Tout entre de côté quand la diapo
 * arrive, puis flotte doucement.
 */
export function Scene({ name }: { name: SceneKey }) {
  let body: ReactNode = null;
  if (name === "bonjour")
    body = (
      <>
        <span className="bw-sc__sun" aria-hidden />
        <span className="bw-sc__hill" data-side="left" aria-hidden />
        <span className="bw-sc__hill" data-side="right" aria-hidden />
        <span className="bw-sc__road" aria-hidden />
        <img
          className="bw-sc__car"
          src={perso("voiture_504")}
          alt=""
          width={512}
          height={512}
          draggable={false}
        />
        <span className="bw-sc__say" style={at(6, 10, 4)}>
          Salut&nbsp;! Moi, c'est la 504.
        </span>
      </>
    );
  else if (name === "depart")
    body = (
      <>
        <span className="bw-sc__floor" aria-hidden />
        <Char src={perso("papa")} size={30} style={at(8, 34, 1)} />
        <Char src={perso("maman")} size={33} style={at(34, 28, 2)} />
        <Char src={perso("lina")} size={26} style={at(64, 42, 3)} />
        <Bubble icon={CalendarDays} label="12 juil." style={at(6, 8, 4)} />
        <Bubble icon={Luggage} style={at(78, 12, 5)} tone="gold" />
      </>
    );
  else if (name === "papiers")
    body = (
      <>
        <span className="bw-sc__floor" aria-hidden />
        <span className="bw-sc__doc" data-kind="passport" style={at(10, 22, 1)} aria-hidden>
          <i />
          <small>Passeport</small>
        </span>
        <span className="bw-sc__doc" data-kind="visa" style={at(66, 18, 2)} aria-hidden>
          <Stamp size={18} />
          <small>Visa</small>
        </span>
        <Char src={perso("jedda")} size={36} style={at(32, 30, 3)} />
        <Bubble icon={BadgeCheck} style={at(76, 60, 4)} tone="blue" />
        <Bubble icon={FileText} label="31 mai" style={at(4, 66, 5)} tone="rose" />
      </>
    );
  else if (name === "route")
    body = (
      <>
        <span className="bw-sc__sea" aria-hidden />
        <span className="bw-sc__land" data-side="left" aria-hidden />
        <span className="bw-sc__land" data-side="right" aria-hidden />
        <svg className="bw-sc__path" viewBox="0 0 300 200" aria-hidden>
          <path d="M18 132 C 70 120, 90 150, 120 140 S 200 120, 280 132" />
        </svg>
        <img
          className="bw-sc__mini"
          src={perso("voiture_504")}
          alt=""
          width={512}
          height={512}
          draggable={false}
        />
        <span className="bw-sc__ship" aria-hidden>
          ⛴️
        </span>
        <span className="bw-sc__pin" aria-hidden>
          <MapPin size={20} />
        </span>
        <Bubble icon={Wallet} label="Budget" style={at(6, 8, 3)} tone="gold" />
        <Bubble icon={Ticket} label="Billet" style={at(64, 8, 4)} />
      </>
    );
  return (
    <div className="bw-sc" data-scene={name} aria-hidden>
      {body}
    </div>
  );
}
