import { useId, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { dateShort, rupees, rupeesShort } from '../lib/format'

/** Two-series area chart with draw-in animation and a hover crosshair. */
export function TrendChart({ data, height = 220 }: { data: { d: string; sales: number; collections: number }[]; height?: number }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = height
  const pad = { l: 8, r: 8, t: 16, b: 26 }
  const max = Math.max(1, ...data.map((d) => Math.max(d.sales, d.collections))) * 1.12
  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const path = (key: 'sales' | 'collections') => {
    if (!data.length) return ''
    // smooth cubic curve through the points
    let p = `M ${x(0)} ${y(data[0][key])}`
    for (let i = 1; i < data.length; i++) {
      const x0 = x(i - 1), y0 = y(data[i - 1][key]), x1 = x(i), y1 = y(data[i][key])
      const cx = (x0 + x1) / 2
      p += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
    }
    return p
  }
  const sales = path('sales')
  const coll = path('collections')
  const area = sales ? `${sales} L ${x(data.length - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z` : ''
  const h = hover !== null ? data[hover] : null
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" preserveAspectRatio="none"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#DC9140" stopOpacity="0.42" />
            <stop offset="1" stopColor="#DC9140" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#E8AD62" />
            <stop offset="1" stopColor="#A95E1F" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="#ECDFCC" strokeDasharray="3 6" />
        ))}
        <motion.path d={area} fill={`url(#a${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }} />
        <motion.path d={coll} fill="none" stroke="#45A86D" strokeWidth={2.2} strokeDasharray="5 5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
        <motion.path d={sales} fill="none" stroke={`url(#s${id})`} strokeWidth={3.2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
        {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) && (
          <text key={d.d} x={x(i)} y={H - 6} fontSize="11" fill="#9A8573" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{dateShort(d.d)}</text>
        ))}
        {hover !== null && h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#C9762A" strokeOpacity="0.35" />
            <circle cx={x(hover)} cy={y(h.sales)} r={5} fill="#fff" stroke="#C9762A" strokeWidth={2.5} />
            <circle cx={x(hover)} cy={y(h.collections)} r={4} fill="#fff" stroke="#45A86D" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-xl border border-line bg-paper/95 px-3 py-2 text-xs shadow-lift backdrop-blur"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 70px), calc(100% - 150px))` }}>
          <div className="font-bold text-ink">{dateShort(h.d)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-teak-700"><span className="size-2 rounded-full bg-teak-500" />Sales {rupees(h.sales)}</div>
          <div className="flex items-center gap-1.5 text-leaf-600"><span className="size-2 rounded-full bg-leaf-400" />Collected {rupees(h.collections)}</div>
        </div>
      )}
    </div>
  )
}

/** Horizontal bars, each with its own colour (species colours) */
export function BarRows({ rows, unit = '', format }: { rows: { label: string; value: number; color?: string; sub?: string; swatch?: string }[]; unit?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
              {r.swatch ? <span className="size-3.5 shrink-0 rounded-[4px] bg-cover shadow-sm ring-1 ring-black/5" style={{ backgroundImage: `url(${r.swatch})`, backgroundColor: r.color }} /> : <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color ?? '#C9762A' }} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="num shrink-0 text-xs font-bold text-ink-soft">{format ? format(r.value) : `${r.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}${unit}`}{r.sub && <span className="ml-1 font-medium text-ink-mute">{r.sub}</span>}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-cream">
            <motion.div
              className="h-full rounded-full"
              style={{ background: r.swatch ? `url(${r.swatch}) center/cover, ${r.color}` : `linear-gradient(90deg, ${r.color ?? '#E8AD62'}cc, ${r.color ?? '#C9762A'})` }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 1, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Semicircle gauge — sawmill yield */
export function Gauge({ value, max = 100, label, good = 62, size = 200 }: { value: number; max?: number; label?: string; good?: number; size?: number }) {
  const r = 80
  const c = Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  const color = value >= good + 8 ? '#2A8C54' : value >= good ? '#45A86D' : value >= good - 10 ? '#E39A17' : '#E0532E'
  return (
    <svg viewBox="0 0 200 118" width={size} className="mx-auto block h-auto max-w-full">
      <defs>
        <linearGradient id="gg" x1="0" x2="1">
          <stop offset="0" stopColor="#F0744D" />
          <stop offset="0.5" stopColor="#F5B83D" />
          <stop offset="1" stopColor="#45A86D" />
        </linearGradient>
      </defs>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#F3E7D5" strokeWidth="16" strokeLinecap="round" />
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gg)" strokeOpacity="0.25" strokeWidth="16" strokeLinecap="round" />
      <motion.path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }} />
      <text x="100" y="88" textAnchor="middle" fontSize="30" fontWeight="700" fill="#2B1C11" fontFamily="Fraunces Variable, serif">{value ? value.toFixed(1) : '—'}%</text>
      {label && <text x="100" y="110" textAnchor="middle" fontSize="11" fill="#6D5746" fontWeight="600">{label}</text>}
    </svg>
  )
}

/** Donut with legend */
export function Donut({ parts, size = 150, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1
  const r = 52
  const C = 2 * Math.PI * r
  const arcs = useMemo(() => {
    let acc = 0
    return parts.map((p) => {
      const len = (Math.max(0, p.value) / total) * C
      const a = { ...p, dash: `${len} ${C - len}`, off: -acc }
      acc += len
      return a
    })
  }, [parts, total, C])
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#F3E7D5" strokeWidth="14" />
          {arcs.map((a, i) => (
            <motion.circle key={a.label} cx="60" cy="60" r={r} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={a.dash}
              initial={{ strokeDashoffset: a.off + C * 0.25, opacity: 0 }} animate={{ strokeDashoffset: a.off, opacity: 1 }} transition={{ duration: 0.9, delay: i * 0.07 }} />
          ))}
        </svg>
        {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate text-ink-soft">{p.label}</span></span>
            <span className="num font-semibold">{rupeesShort(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
