import type { ReactNode } from 'react'
import { SectionHeading, useInView } from '../ui'

interface Service {
  title: string
  body: string
  accent: string
  icon: ReactNode
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const SERVICES: Service[] = [
  {
    title: 'Sawmill — cut to your size',
    body: 'Bring your list: frames, rafters, planks or beams. Our headsaw and re-saw cut to the inch while you wait.',
    accent: 'from-sky-100 to-sky-50 text-sky-600',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12">
        <g className="origin-center [animation:svc-spin_3.5s_linear_infinite] [transform-box:fill-box]">
          <circle cx="24" cy="24" r="15" {...stroke} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <path key={i} d={`M${24 + Math.cos(a) * 15} ${24 + Math.sin(a) * 15} L${24 + Math.cos(a + 0.22) * 19} ${24 + Math.sin(a + 0.22) * 19} L${24 + Math.cos(a + 0.4) * 15} ${24 + Math.sin(a + 0.4) * 15}`} {...stroke} strokeWidth={1.6} />
          })}
          <circle cx="24" cy="24" r="3.5" {...stroke} />
        </g>
      </svg>
    ),
  },
  {
    title: 'Planing & finishing',
    body: 'Thicknessing and surface planing for a smooth, true face — ready for polish, paint or lamination.',
    accent: 'from-sun-100 to-[#fff8e6] text-sun-500',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12">
        <path d="M6 32 h28 l6 -8 h-26 z" {...stroke} />
        <path d="M14 24 v-6 h10 v6" {...stroke} />
        <path d="M30 34 c4 0 6 -3 6 -6 c0 -3 -3 -4 -5 -2" {...stroke} strokeWidth={1.8} className="[animation:svc-curl_2.4s_ease-in-out_infinite] origin-[30px_34px]" />
        <path d="M6 38 h36" {...stroke} strokeDasharray="4 4" className="[animation:svc-dash_1.4s_linear_infinite]" />
      </svg>
    ),
  },
  {
    title: 'Seasoning — air & kiln',
    body: 'Stacked on stickers in shaded sheds, and kiln-dried on request, so your timber does not warp or crack.',
    accent: 'from-ember-100 to-ember-50 text-ember-500',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12">
        <circle cx="34" cy="13" r="5" {...stroke} className="[animation:svc-pulse_2.6s_ease-in-out_infinite] origin-[34px_13px]" />
        <path d="M6 40 h36 M8 34 h32 M10 28 h28" {...stroke} />
        <path d="M14 22 q2 -3 0 -6 q-2 -3 0 -6 M22 22 q2 -3 0 -6 q-2 -3 0 -6" {...stroke} strokeWidth={1.6} className="[animation:svc-rise_2.2s_ease-in-out_infinite]" />
      </svg>
    ),
  },
  {
    title: 'Anti-termite treatment',
    body: 'Pressure and brush treatment for frames, rafters and plywood, for timber that stays sound for decades.',
    accent: 'from-leaf-100 to-leaf-50 text-leaf-600',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12">
        <path d="M24 5 l15 6 v11 c0 10 -7 17 -15 21 c-8 -4 -15 -11 -15 -21 v-11 z" {...stroke} />
        <path d="M24 15 c4 5 6 8 6 11 a6 6 0 0 1 -12 0 c0 -3 2 -6 6 -11 z" {...stroke} className="[animation:svc-drip_2.4s_ease-in-out_infinite]" />
      </svg>
    ),
  },
  {
    title: 'Door & window frames',
    body: 'Chowkat frames in 5″×3″ and 4″×2½″, panelled and flush doors, window frames and shutters — made to measure.',
    accent: 'from-plum-100 to-[#fbf3fb] text-plum-500',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12">
        <path d="M10 44 V6 h28 v38" {...stroke} strokeDasharray="110" className="[animation:svc-draw_3s_ease-in-out_infinite]" />
        <rect x="15" y="11" width="18" height="15" rx="1" {...stroke} strokeWidth={1.6} />
        <rect x="15" y="29" width="18" height="11" rx="1" {...stroke} strokeWidth={1.6} />
        <circle cx="30" cy="27" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Doorstep delivery',
    body: 'Our own vehicles deliver to site, with the bill, permit papers and an e-way bill where needed.',
    accent: 'from-teak-100 to-teak-50 text-teak-600',
    icon: (
      <svg viewBox="0 0 48 48" className="size-12 overflow-visible">
        <g className="[animation:svc-drive_2.8s_ease-in-out_infinite]">
          <path d="M3 32 V16 h24 v16 M27 22 h9 l6 6 v4 h-15" {...stroke} />
          <path d="M6 16 v-4 h18 v4 M8 12 v-3 h14 v3" {...stroke} strokeWidth={1.6} />
          <circle cx="12" cy="35" r="3.5" {...stroke} />
          <circle cx="35" cy="35" r="3.5" {...stroke} />
        </g>
        <path d="M2 41 h44" {...stroke} strokeWidth={1.4} strokeDasharray="3 5" className="[animation:svc-dash_0.9s_linear_infinite]" />
      </svg>
    ),
  },
]

export default function Services() {
  return (
    <section id="services" className="relative scroll-mt-20 bg-canvas py-20 sm:py-28">
      <style>{`
        @keyframes svc-spin { to { transform: rotate(360deg) } }
        @keyframes svc-curl { 0%,100% { transform: scale(.85) rotate(-8deg); opacity:.6 } 50% { transform: scale(1.05) rotate(6deg); opacity:1 } }
        @keyframes svc-dash { to { stroke-dashoffset: -16 } }
        @keyframes svc-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.18) } }
        @keyframes svc-rise { 0% { transform: translateY(3px); opacity:.2 } 50% { opacity:1 } 100% { transform: translateY(-4px); opacity:.2 } }
        @keyframes svc-drip { 0%,100% { transform: translateY(0) } 50% { transform: translateY(2px) } }
        @keyframes svc-draw { 0% { stroke-dashoffset: 110 } 45%,100% { stroke-dashoffset: 0 } }
        @keyframes svc-drive { 0%,100% { transform: translateX(-2px) } 50% { transform: translateX(3px) } }
      `}</style>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="What we do" title={<>From log to ready-to-fit,<br className="hidden sm:block" /> under one roof.</>} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => <ServiceCard key={s.title} s={s} i={i} />)}
        </div>
      </div>
    </section>
  )
}

function ServiceCard({ s, i }: { s: Service; i: number }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`group card card-hover relative overflow-hidden p-6 transition-all duration-700 ${seen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
      style={{ transitionDelay: `${(i % 3) * 90}ms` }}
    >
      <div className={`grid size-[72px] place-items-center rounded-2xl bg-gradient-to-br ${s.accent} ring-1 ring-white/70 transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-3`}>
        {s.icon}
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold leading-tight text-ink">{s.title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
      <div className={`pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-gradient-to-br opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-90 ${s.accent}`} />
    </div>
  )
}
