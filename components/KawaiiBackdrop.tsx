// Decorative pastel anime sky: drifting clouds, falling sakura petals and an original
// chibi neko mascot. Purely visual, sits behind the app and ignores the pointer.

const PETALS = [
  { left: 4, delay: 0, duration: 14, size: 14 },
  { left: 12, delay: 6, duration: 18, size: 10 },
  { left: 21, delay: 2, duration: 16, size: 12 },
  { left: 30, delay: 9, duration: 20, size: 9 },
  { left: 38, delay: 4, duration: 15, size: 13 },
  { left: 47, delay: 11, duration: 19, size: 11 },
  { left: 55, delay: 1, duration: 17, size: 14 },
  { left: 63, delay: 7, duration: 21, size: 9 },
  { left: 71, delay: 3, duration: 16, size: 12 },
  { left: 79, delay: 10, duration: 18, size: 10 },
  { left: 87, delay: 5, duration: 15, size: 13 },
  { left: 95, delay: 8, duration: 20, size: 11 },
];

const CLOUDS = [
  { top: 8, scale: 1, duration: 90, delay: 0, opacity: 0.9 },
  { top: 22, scale: 0.7, duration: 120, delay: -40, opacity: 0.75 },
  { top: 55, scale: 1.2, duration: 140, delay: -90, opacity: 0.6 },
  { top: 75, scale: 0.8, duration: 110, delay: -20, opacity: 0.7 },
];

function Cloud() {
  return (
    <svg viewBox="0 0 200 80" className="h-full w-full" aria-hidden="true">
      <g fill="#ffffff">
        <ellipse cx="60" cy="52" rx="48" ry="24" />
        <ellipse cx="100" cy="38" rx="40" ry="32" />
        <ellipse cx="140" cy="50" rx="44" ry="26" />
        <ellipse cx="100" cy="60" rx="80" ry="18" />
      </g>
    </svg>
  );
}

function Neko() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      {/* tail */}
      <path d="M150 150 q40 -10 30 -50 q-6 -18 -18 -10 q10 20 -20 40" fill="#ffd9e8" stroke="#e879a6" strokeWidth="4" strokeLinejoin="round" />
      {/* body */}
      <ellipse cx="100" cy="155" rx="55" ry="38" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" />
      {/* ears */}
      <path d="M50 75 L58 25 L92 55 Z" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" strokeLinejoin="round" />
      <path d="M150 75 L142 25 L108 55 Z" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 60 L63 38 L80 53 Z" fill="#ffb3d1" />
      <path d="M140 60 L137 38 L120 53 Z" fill="#ffb3d1" />
      {/* head */}
      <ellipse cx="100" cy="92" rx="60" ry="50" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" />
      {/* eyes */}
      <g className="neko-eyes">
        <ellipse cx="76" cy="92" rx="9" ry="12" fill="#4a2c5a" />
        <ellipse cx="124" cy="92" rx="9" ry="12" fill="#4a2c5a" />
        <circle cx="79" cy="87" r="3.5" fill="#fff" />
        <circle cx="127" cy="87" r="3.5" fill="#fff" />
      </g>
      {/* blush */}
      <ellipse cx="62" cy="110" rx="10" ry="6" fill="#ff9ec4" opacity="0.7" />
      <ellipse cx="138" cy="110" rx="10" ry="6" fill="#ff9ec4" opacity="0.7" />
      {/* mouth */}
      <path d="M92 108 q8 8 8 0 q0 8 8 0" fill="none" stroke="#4a2c5a" strokeWidth="3" strokeLinecap="round" />
      {/* paws holding a coin */}
      <circle cx="100" cy="150" r="20" fill="#fde68a" stroke="#f59e0b" strokeWidth="4" />
      <text x="100" y="158" textAnchor="middle" fontSize="22" fontWeight="700" fill="#b45309">₿</text>
      <ellipse cx="78" cy="152" rx="11" ry="9" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" />
      <ellipse cx="122" cy="152" rx="11" ry="9" fill="#fff5f9" stroke="#e879a6" strokeWidth="4" />
      {/* little sparkles */}
      <path d="M30 30 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#fbbf24" className="sparkle" />
      <path d="M175 20 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" fill="#c084fc" className="sparkle sparkle-late" />
    </svg>
  );
}

export default function KawaiiBackdrop() {
  return (
    <div className="kawaii-backdrop" aria-hidden="true">
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="kawaii-cloud"
          style={{
            top: `${c.top}%`,
            opacity: c.opacity,
            transform: `scale(${c.scale})`,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <Cloud />
        </div>
      ))}
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="sakura"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s, ${p.duration / 4}s`,
            animationDelay: `${p.delay}s, ${p.delay}s`,
          }}
        />
      ))}
      <div className="kawaii-neko">
        <Neko />
      </div>
    </div>
  );
}
