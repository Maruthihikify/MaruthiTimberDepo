/** Spinning log end-grain — the loading mark used across the site and the app. */
export function RingSpinner({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`animate-[spin_1.6s_linear_infinite] ${className}`} aria-hidden>
      <defs>
        <radialGradient id="rs-g" cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="#F6D3A1" />
          <stop offset="0.6" stopColor="#E0A35C" />
          <stop offset="1" stopColor="#B8742F" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#7A4A26" />
      <circle cx="24" cy="24" r="19" fill="url(#rs-g)" />
      {[15, 11, 7, 3.5].map((r) => (
        <circle key={r} cx="24" cy="24" r={r} fill="none" stroke="#A9662A" strokeOpacity="0.7" strokeWidth="1.3" />
      ))}
      <path d="M24 24 L41 15" stroke="#6E3F1E" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-soft">
        <RingSpinner size={48} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  )
}
