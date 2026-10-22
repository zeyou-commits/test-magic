/** Illustration vectorielle légère, cohérente avec les marqueurs de la carte. */
export function CrossingScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 380" className={className} aria-hidden="true">
      <rect width="560" height="380" fill="#e5efed" />
      <circle cx="410" cy="89" r="38" fill="#edd49a" />
      <path d="m0 181 52-41 62 24 49-45 88 62 60-22 68 31 73-40 108 20v210H0Z" fill="#bacdc6" />
      <path d="m0 213 94-36 75 26 71-30 116 43 76-34 128 16v182H0Z" fill="#f3eddf" />
      <path d="M0 232q130-25 277 0t283 0v148H0Z" fill="#b8d6d5" />
      <path
        d="M0 284q119-24 235 0t325 0M0 333q119-24 235 0t325 0"
        fill="none"
        stroke="#e7f2ee"
        strokeWidth="2"
      />
      <path
        d="M55 299q178-66 449 12"
        fill="none"
        stroke="#fffdf8"
        strokeWidth="2"
        strokeDasharray="5 7"
      />
      <g className="bw-auth-ferry">
        <ellipse cx="292" cy="288" rx="114" ry="8" fill="#8eb7b8" opacity=".55" />
        <path d="m171 244 222 1-32 35H205Z" fill="#183b50" />
        <path d="m181 246 206 1-8 9H191Z" fill="#fffdf8" />
        <path d="M206 244v-35h133l29 35Z" fill="#fffdf8" stroke="#183b50" strokeWidth="2" />
        <path d="M224 208v-19h81v20" fill="#f7f4eb" stroke="#183b50" strokeWidth="2" />
        <path d="M239 188v-15h27v15" fill="#0a7d4b" />
        <path d="M251 173v-28m0 0h25l-6 8h-19" fill="#d95636" stroke="#183b50" strokeWidth="2" />
        <path d="M218 221h120m-112-22h68" stroke="#38788b" strokeWidth="8" strokeDasharray="12 5" />
        <path d="m205 266 144 1" stroke="#d95636" strokeWidth="4" />
        <path d="m163 282-35 3m29 8-46 3" stroke="#fffdf8" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g fill="#0a7d4b" stroke="#fffdf8" strokeWidth="4">
        <circle cx="55" cy="299" r="7" />
        <circle cx="504" cy="311" r="7" />
      </g>
    </svg>
  );
}
