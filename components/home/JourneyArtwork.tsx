/** Illustrations éditoriales originales. Elles ne représentent pas un navire réel. */
export function JourneyArtwork({
  variant = "coast",
  className = "",
}: {
  variant?: "coast" | "ferry" | "luggage";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 600 380"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="600" height="380" fill="#F1EADD" />
      <circle cx="455" cy="88" r="42" fill="#E5BC72" />
      <path d="M0 225C100 190 185 248 290 215S475 191 600 220V380H0Z" fill="#B9D3D3" />
      <path d="M0 295C120 266 190 317 320 282S480 280 600 260V380H0Z" fill="#89B2BA" />
      <g stroke="#F8F5EE" strokeWidth="2" strokeLinecap="round" opacity=".7">
        <path d="M28 320h75m22 22h110m205-26h90M350 352h52M30 367h54" />
      </g>
      {variant === "coast" ? (
        <>
          <path d="M0 236 70 178 127 194 199 119 275 174 345 195 367 263H0Z" fill="#D9C9AD" />
          <g stroke="#16324A" strokeWidth="2" strokeLinejoin="round">
            <path
              d="M65 227v-75h50v75m0 0V133h49v94m0 0v-53h46v53m0 0v-91h55v91m0 0v-57h42v57"
              fill="#FFFCF5"
            />
            <path d="M219 136v-24c0-26 38-26 38 0v24Z" fill="#D9B16D" />
            <path
              d="M91 173v13m44-34v13m0 20v13m45-6v13m50-38v15m17-15v15m37 3v14"
              stroke="#618D97"
              strokeWidth="7"
            />
            <path d="M30 239h310" />
          </g>
          <g transform="translate(370 236)">
            <path d="M0 0h141l-22 29H28Z" fill="#16324A" />
            <path d="M23-7v-25h88v25" fill="#FFFDF7" />
            <path d="M48-32v-16h42v16" fill="#FFFDF7" />
            <path d="M34-19h65" stroke="#618D97" strokeWidth="7" strokeDasharray="8 6" />
            <path d="M11 5h117" stroke="#0E7A43" strokeWidth="5" />
          </g>
        </>
      ) : variant === "ferry" ? (
        <g stroke="#16324A" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M100 231h405l-40 57H160Z" fill="#16324A" />
          <path d="M153 225v-67h280l35 67" fill="#FFFDF7" />
          <path d="M200 158v-35h162v35" fill="#FFFDF7" />
          <path d="M256 123V88h42v35" fill="#0E7A43" />
          <path d="M308 123v-18h32v18" fill="#D9B16D" />
          <path
            d="M180 180h232m-225 22h238"
            stroke="#618D97"
            strokeWidth="9"
            strokeDasharray="15 10"
          />
          <path d="M126 245h356" stroke="#0E7A43" strokeWidth="8" />
          <path d="M170 303c36 10 70-10 107 0s70-10 107 0 70-10 107 0" stroke="#F6F2EA" />
        </g>
      ) : (
        <g stroke="#16324A" strokeWidth="3" strokeLinejoin="round">
          <rect x="173" y="151" width="173" height="151" rx="18" fill="#DBAF65" />
          <path d="M228 151v-19c0-15 60-15 60 0v19M205 153v148m110-148v148" />
          <rect x="299" y="198" width="112" height="111" rx="13" fill="#F9F5EA" />
          <path d="M330 198v-20h48v20" />
          <path
            d="M302 222h106m-106 29h106m-106 29h106m-80-81v107m28-107v107m28-107v107"
            stroke="#6C9EAA"
            strokeWidth="9"
            opacity=".7"
          />
          <rect
            x="145"
            y="242"
            width="74"
            height="92"
            rx="6"
            fill="#0E7A43"
            transform="rotate(-12 145 242)"
          />
          <circle cx="188" cy="278" r="14" stroke="#F6F2EA" />
          <path d="m172 308 27-6" stroke="#F6F2EA" />
        </g>
      )}
      <path
        d="M386 127q10-10 20 0m0 0q10-10 20 0M477 160q7-7 14 0m0 0q7-7 14 0"
        stroke="#16324A"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
