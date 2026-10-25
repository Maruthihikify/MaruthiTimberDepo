import { Activity, Boxes, Layers, Trees } from 'lucide-react'
import { AVAILABILITY, type PublicSpecies } from '../data'
import { CountUp, SectionHeading, useInView } from '../ui'
import { scanFor } from './Species'

const tex = (f: string) => `${import.meta.env.BASE_URL}landing/textures/${f}`

interface Props {
  totals: { sawn_cft: number; log_cft: number; logs: number; sizes: number; species: number }
  species: PublicSpecies[]
  live: boolean
}

export default function LiveYard({ totals, species, live }: Props) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const rows = [...species].sort((a, b) => b.sawn_cft + b.log_cft - (a.sawn_cft + a.log_cft)).slice(0, 8)
  const max = Math.max(1, ...rows.map((r) => r.sawn_cft + r.log_cft))
  const stats = [
    { icon: Layers, label: 'CFT of sawn timber ready', value: totals.sawn_cft },
    { icon: Trees, label: 'CFT of logs seasoning', value: totals.log_cft },
    { icon: Boxes, label: 'Sizes on the racks', value: totals.sizes },
    { icon: Activity, label: 'Species in the yard', value: totals.species || species.length },
  ]

  return (
    <section id="live" className="relative scroll-mt-20 overflow-hidden py-20 text-white sm:py-28">
      {/* sunlit teak: real scanned grain under a warm amber wash */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#d48a3a_0%,#b4652a_45%,#8c4a22_100%)]" />
      <div className="absolute inset-0 opacity-[0.22] mix-blend-multiply" style={{ backgroundImage: `url(${tex('teak_diff.webp')})`, backgroundSize: '900px auto' }} />
      <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_15%_10%,rgba(255,226,160,0.55),transparent_60%),radial-gradient(700px_420px_at_100%_100%,rgba(69,168,109,0.28),transparent_65%)]" />

      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading tone="light" eyebrow="Live from our yard" title={<>What’s on the racks<br className="hidden sm:block" /> right now.</>}>
            Straight from our stock register — the same numbers our billing counter sees.
          </SectionHeading>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider ring-1 ring-white/30 backdrop-blur">
            <span className={`size-2 rounded-full ${live ? 'animate-pulse bg-leaf-300' : 'bg-sun-300'}`} />
            {live ? 'Updated live' : 'Connecting to the yard register'}
          </span>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`rounded-3xl bg-white/12 p-4 ring-1 ring-white/25 backdrop-blur-md transition-all duration-700 sm:p-6 ${seen ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <s.icon className="size-5 text-sun-300" />
              <p className="num mt-3 font-display text-[clamp(2rem,6vw,3.4rem)] font-semibold leading-none">
                <CountUp value={Math.round(s.value)} run={seen} />
              </p>
              <p className="mt-2 text-[13px] font-semibold text-white/80 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-paper/95 p-4 text-ink shadow-[0_30px_70px_-30px_rgba(69,38,26,0.7)] ring-1 ring-white/50 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-display text-xl font-semibold">Availability by species</p>
            <p className="text-xs font-semibold text-ink-mute">CFT · sawn + logs</p>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 md:gap-x-8">
            {rows.map((r, i) => {
              const scan = scanFor(r.name)
              const v = r.sawn_cft + r.log_cft
              const w = v > 0 ? Math.max(4, (v / max) * 100) : 0
              const av = AVAILABILITY[r.availability]
              return (
                <li key={r.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num text-ink-soft">{v > 0 ? `${new Intl.NumberFormat('en-IN').format(Math.round(v))}` : '—'}</span>
                      <span className={`chip ${av.cls}`}>{av.label}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-3.5 overflow-hidden rounded-full bg-cream ring-1 ring-line/70">
                    <div
                      className="h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[width] duration-[1400ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                      style={{
                        width: seen ? `${w}%` : '0%',
                        transitionDelay: `${200 + i * 80}ms`,
                        backgroundImage: scan ? `url(${scan.src})` : undefined,
                        backgroundColor: scan?.tint ?? r.color,
                        backgroundBlendMode: scan?.tint ? 'multiply' : undefined,
                        backgroundSize: '300px auto',
                        filter: scan?.filter,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
