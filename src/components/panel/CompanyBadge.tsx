import { useState } from "react";
import { safeExternalUrl } from "./shared";

function hueOf(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** Couleur d'identité stable d'une compagnie (même nom → même couleur partout). */
export function companyColor(name: string | undefined | null) {
  const hue = hueOf((name ?? "?").toLowerCase());
  return { solid: `hsl(${hue} 62% 38%)`, soft: `hsl(${hue} 70% 96%)`, hue };
}

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Logo de la compagnie ; à défaut (ou si l'image ne charge pas), pastille de couleur avec initiales. */
export function CompanyBadge({
  name,
  logoUrl,
  size = 40,
}: {
  name: string | undefined | null;
  logoUrl?: string | null | undefined;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = safeExternalUrl(logoUrl);
  const color = companyColor(name);
  if (src && !failed) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white shadow-sm ring-1 ring-black/5"
        style={{ width: Math.round(size * 1.5), height: size }}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-contain p-1"
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white"
      style={{ width: size, height: size, background: color.solid }}
      aria-hidden
    >
      {initials(name ?? "?")}
    </span>
  );
}
