/** Ferry de profil qui tangue sur l'eau, avec fumée de cheminée et écume animées (styles dans home.css). */
export function MiniFerry({ size = 60 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 36"
      width={size}
      height={(size * 36) / 64}
      className="bw-mini-ferry"
      aria-hidden
    >
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
    </svg>
  );
}
