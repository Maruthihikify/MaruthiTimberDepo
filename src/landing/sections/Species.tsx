import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { MapPin, Scale, ShieldCheck } from 'lucide-react'
import { AVAILABILITY, CATEGORY_LABEL, type PublicSpecies } from '../data'
import { SectionHeading, useInView, useWoodUrl } from '../ui'
import { toneFor } from '../../lib/wood'

const tex = (f: string) => `${import.meta.env.BASE_URL}landing/textures/${f}`

/** Real CC0 veneer scans per species (lightly tinted where that stays true to the wood), else null → procedural. */
export function scanFor(name: string): { src: string; tint?: string; filter?: string } | null {
  const n = name.toLowerCase()
  if (n.includes('burma')) return { src: tex('card_teak.webp'), tint: '#d6a067' }
  if (n.includes('teak')) return { src: tex('card_teak.webp'), tint: n.includes('nilambur') ? '#f2c98f' : '#ebc597' }
  if (n.includes('honne') || n.includes('padauk')) return { src: tex('card_sapele.webp'), tint: '#f1c3a8' }
  if (/\bsal\b/.test(n)) return { src: tex('card_sapele.webp'), tint: '#b88a6d' }
  if (n.includes('rose')) return { src: tex('card_rosewood.webp'), tint: '#9a6a60' }
  if (n.includes('silver')) return { src: tex('card_silveroak.webp'), tint: '#efdccb' }
  if (n.includes('pine') || n.includes('deodar')) return { src: tex('card_pine.webp'), filter: 'brightness(1.32) saturate(0.72) sepia(0.12)' }
  if (n.includes('jack') || n.includes('halasu')) return { src: tex('card_teak.webp'), tint: '#f2b75a' }
  if (n.includes('matti') || n.includes('laurel')) return { src: tex('card_teak.webp'), tint: '#b9a28d' }
  if (n.includes('mango')) return { src: tex('card_silveroak.webp'), tint: '#d8bd98' }
  if (n.includes('neem')) return { src: tex('card_sapele.webp'), tint: '#cfa98d' }
  return null
}

const FILTERS: { key: string; label: string; test: (s: PublicSpecies) => boolean }[] = [
  { key: 'all', label: 'All timber', test: () => true },
  { key: 'teak', label: 'Teak', test: (s) => /teak/i.test(s.name) },
  { key: 'hard', label: 'Indian hardwoods', test: (s) => s.category === 'hardwood' && !/teak/i.test(s.name) },
  { key: 'imp', label: 'Imported', test: (s) => s.category === 'imported' },
  { key: 'plant', label: 'Plantation & softwood', test: (s) => s.category === 'plantation' || s.category === 'softwood' },
]

export default function Species({ species, showPrices }: { species: PublicSpecies[]; showPrices: boolean }) {
  const [filter, setFilter] = useState('all')
  const list = useMemo(() => species.filter(FILTERS.find((f) => f.key === filter)!.test), [species, filter])

  return (
    <section id="species" className="relative scroll-mt-20 overflow-hidden bg-canvas py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_0%,rgba(255,214,160,0.45),transparent_60%),radial-gradient(700px_380px_at_0%_100%,rgba(169,220,185,0.3),transparent_60%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Our timber" title={<>Every species,<br className="hidden sm:block" /> its own grain.</>}>
            Real wood, shown as it really looks. Tap a board to see where it comes from, how heavy and durable it is, and what our customers build with it.
          </SectionHeading>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filter species">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filter === f.key ? 'bg-teak-700 text-white shadow-[0_8px_20px_-8px_rgba(133,72,27,0.7)]' : 'bg-paper text-teak-800 ring-1 ring-line hover:ring-teak-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((s, i) => (
            <SpeciesCard key={s.id} s={s} index={i} showPrices={showPrices} />
          ))}
        </div>
      </div>
    </section>
  )
}

function SpeciesCard({ s, index, showPrices }: { s: PublicSpecies; index: number; showPrices: boolean }) {
  const [ref, seen] = useInView<HTMLElement>('0px 0px 200px 0px')
  const scan = scanFor(s.name)
  const tone = useMemo(() => toneFor(s.name, s.color, s.grain, index + 3), [s.name, s.color, s.grain, index])
  const proc = useWoodUrl(tone, 480, 140, seen && !scan)
  const card = useRef<HTMLDivElement>(null)
  const av = AVAILABILITY[s.availability]

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !card.current) return
    const r = card.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    card.current.style.setProperty('--rx', `${(0.5 - y) * 8}deg`)
    card.current.style.setProperty('--ry', `${(x - 0.5) * 10}deg`)
    card.current.style.setProperty('--mx', `${x * 100}%`)
  }
  const onLeave = () => {
    card.current?.style.setProperty('--rx', '0deg')
    card.current?.style.setProperty('--ry', '0deg')
    card.current?.style.setProperty('--mx', '-40%')
  }

  const faceStyle: CSSProperties = scan
    ? { backgroundImage: `url(${scan.src})`, backgroundColor: scan.tint, backgroundBlendMode: scan.tint ? 'multiply' : undefined, backgroundSize: '190% auto', backgroundPosition: `${(index * 23) % 100}% ${(index * 37) % 100}%`, filter: scan.filter }
    : { backgroundImage: proc ? `url(${proc})` : undefined, backgroundColor: s.color, backgroundSize: 'cover' }

  return (
    <article
      ref={ref}
      className={`w-[78vw] max-w-[340px] shrink-0 snap-center transition-all duration-700 sm:w-auto sm:max-w-none ${seen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
      style={{ transitionDelay: `${(index % 4) * 70}ms` }}
    >
      <div
        ref={card}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group relative h-full rounded-[22px] bg-paper p-3 shadow-card ring-1 ring-line transition-[transform,box-shadow] duration-300 [--mx:-40%] [--rx:0deg] [--ry:0deg] [transform:perspective(900px)_rotateX(var(--rx))_rotateY(var(--ry))] hover:shadow-lift"
      >
        {/* the board: face, front edge and a soft shadow — real scanned grain */}
        <div className="relative">
          <div className="relative h-[132px] overflow-hidden rounded-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" style={faceStyle}>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,transparent_35%,rgba(60,30,10,0.18)_100%)]" />
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:linear-gradient(105deg,transparent_calc(var(--mx)-18%),rgba(255,248,230,0.55)_var(--mx),transparent_calc(var(--mx)+18%))]" />
            <span className={`chip absolute left-2.5 top-2.5 ${av.cls} backdrop-blur`}>
              <span className={`size-1.5 rounded-full ${av.dot} ${s.availability === 'in_stock' ? 'animate-pulse' : ''}`} /> {av.label}
            </span>
          </div>
          <div className="mx-1.5 h-2.5 rounded-b-[10px] brightness-[0.72]" style={{ ...faceStyle, backgroundSize: '400% auto' }} />
          <div className="mx-6 h-2 rounded-full bg-teak-900/15 blur-[3px]" />
        </div>

        <div className="px-1.5 pb-1.5 pt-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-[22px] font-semibold leading-tight text-ink">{s.name}</h3>
              <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                {s.local_name && s.local_name !== s.name ? <>Locally <span className="font-semibold text-teak-700">{s.local_name}</span> · </> : null}
                <span className="italic">{s.botanical_name}</span>
              </p>
            </div>
            <span className="chip shrink-0 bg-cream text-teak-700 ring-1 ring-line">{CATEGORY_LABEL[s.category]}</span>
          </div>
          {s.origin && <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-soft"><MapPin className="size-3.5 text-leaf-500" /> {s.origin}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-line/70">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-mute"><Scale className="size-3" /> Density</p>
              <p className="num mt-0.5 text-sm font-bold text-ink">{s.density ? `~${s.density} kg/m³` : '—'}</p>
            </div>
            <div className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-line/70">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-mute"><ShieldCheck className="size-3" /> Durability</p>
              <p className="mt-0.5 line-clamp-1 text-sm font-bold text-ink" title={s.durability ?? ''}>{s.durability ?? '—'}</p>
            </div>
          </div>
          {s.uses && <p className="mt-3 text-[13px] leading-snug text-ink-soft"><span className="font-semibold text-ink">Best for: </span>{s.uses}</p>}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            {showPrices && s.rate_from ? (
              <p className="text-sm text-ink-soft">from <span className="num font-bold text-ink">₹{new Intl.NumberFormat('en-IN').format(s.rate_from)}</span> /CFT</p>
            ) : (
              <p className="text-[13px] text-ink-mute">{s.sawn_cft + s.log_cft > 0 ? `${new Intl.NumberFormat('en-IN').format(Math.round(s.sawn_cft + s.log_cft))} CFT in yard` : 'Ask for today’s rate'}</p>
            )}
            <a href="#enquiry" className="text-sm font-bold text-teak-700 hover:text-teak-900" onClick={() => window.dispatchEvent(new CustomEvent('mtd:enquire', { detail: s.name }))}>
              Enquire →
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
