import type { CrossingScene } from "@/lib/ferry/crossingProgress";

function Car({ className }: { className: string }) {
  return (
    <g className={`bw-mf-traveller ${className}`}>
      <rect x="2" y="0" width="2.4" height="1.5" rx="0.3" fill="#e2403a" />
      <rect x="4.4" y="0.2" width="2.6" height="1.3" rx="0.3" fill="#2c7fb8" />
      <path d="M0 4.2Q0 3 1.5 3L2.7 1.5H7.3L8.8 3Q10 3.3 10 4.2V5H0Z" fill="#efe6cf" stroke="#16324a" strokeOpacity=".45" strokeWidth=".25" />
      <path d="M3.2 1.9H4.900V3H2.400ZM5.300 1.900H7L8 3H5.300Z" fill="#2c7fb8" />
      <circle cx="2.500" cy="5" r=".95" fill="#16324a" />
      <circle cx="7.600" cy="5" r=".95" fill="#16324a" />
    </g>
  );
}

function Walker({ className }: { className: string }) {
  return (
    <g className={`bw-mf-traveller ${className}`}>
      <rect x="1" y="1.300" width="3" height="3" rx=".6" fill="#f3efe6" stroke="#1d6fb8" strokeWidth=".35" />
      <path d="M1.500 2.600H3.500" stroke="#e2403a" strokeWidth=".3" />
      <path d="M1.800 1.300a.7 .7 0 0 1 1.400 0" stroke="#1d6fb8" strokeWidth=".3" fill="none" />
      <path d="M1.800 4.300V5M3.200 4.300V5" stroke="#16324a" strokeWidth=".45" />
    </g>
  );
}

/**
 * Ferry de profil, sans pastille, qui montre lui-même ce qu'il fait : écume en mer, rampe et voyageurs
 * à quai, ancre au mouillage. Sans `scene`, il navigue. Styles dans home.css.
 */
export function MiniFerry({ size = 60, scene }: { size?: number; scene?: CrossingScene | null | undefined }) {
  const movingIn = scene === "boarding";
  const movingOut = scene === "disembarking";
  const atQuay = movingIn || movingOut || scene === "closed" || scene === "docked" || scene === "stopped";
  return (
    <svg
      viewBox="0 0 64 36"
      width={size}
      height={(size * 36) / 64}
      className="bw-mini-ferry"
      data-scene={scene ?? undefined}
      aria-hidden
    >
      {atQuay ? <rect className="bw-mf-quay" x="-40" y="29.500" width="55" height="3.500" rx=".8" /> : null}
      <g className="bw-mini-ferry-wake">
        <path d="M2 29 Q6 27 10 29" />
        <path d="M0 32 Q5 30 11 32" />
      </g>
      <g className="bw-mini-ferry-hull">
        <circle className="bw-smoke bw-smoke-1" cx="41" cy="6" r="2.4" />
        <circle className="bw-smoke bw-smoke-2" cx="41" cy="6" r="2.4" />
        <circle className="bw-smoke bw-smoke-3" cx="41" cy="6" r="2.4" />
        {/* Cheminée */}
        <rect x="38" y="7" width="7" height="8" rx="1.2" className="bw-mf-funnel" />
        <rect x="38" y="9.5" width="7" height="1.6" className="bw-mf-white" />
        {/* Superstructure */}
        <rect x="18" y="14" width="30" height="7" rx="2" className="bw-mf-white bw-mf-stroke" />
        <rect x="24" y="10" width="14" height="5" rx="1.5" className="bw-mf-white bw-mf-stroke" />
        {[21, 26, 31, 36, 41].map((x) => (
          <rect key={x} x={x} y="16" width="3" height="2.4" rx="0.6" className="bw-mf-window" />
        ))}
        <rect x="27" y="11.3" width="8" height="2" rx="0.6" className="bw-mf-window" />
        {/* Coque */}
        <path d="M10 21 H58 L52 30 H15 Z" className="bw-mf-hull" />
        <path d="M11.5 23.5 H56.5" className="bw-mf-stripe" />
      </g>
      <path className="bw-mf-water" d="M8 30.5 Q14 28.8 20 30.5 T32 30.5 T44 30.5 T56 30.5" />
      {movingIn || movingOut ? <path className="bw-mf-ramp" d="M0 29.800L14 24" /> : null}
      {scene === "closed" ? <path className="bw-mf-ramp" d="M13 29V19" /> : null}
      {movingIn ? (
        <>
          <Car className="bw-mf-in" />
          <Car className="bw-mf-in bw-mf-later" />
          <Walker className="bw-mf-in bw-mf-latest" />
        </>
      ) : null}
      {movingOut ? (
        <>
          <Car className="bw-mf-out" />
          <Car className="bw-mf-out bw-mf-later" />
          <Walker className="bw-mf-out bw-mf-latest" />
        </>
      ) : null}
      {scene === "anchored" ? (
        <path className="bw-mf-anchor" d="M50 30V37M47.500 34Q48 37 50 37Q52 37 52.500 34" />
      ) : null}
      {scene === "stopped" ? (
        <g>
          <path d="M31 -2 37 8H25Z" fill="#c2312a" stroke="#fff" strokeWidth=".9" strokeLinejoin="round" />
          <path d="M31 1.200V4.300M31 6V6.100" stroke="#fff" strokeWidth="1.200" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}
