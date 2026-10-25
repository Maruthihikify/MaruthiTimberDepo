import { Droplets, FileCheck2, Ruler, Stamp } from 'lucide-react'
import { SectionHeading, useInView } from '../ui'

const STEPS = [
  {
    icon: Stamp,
    title: 'Legal, traceable timber',
    body: 'Every log comes with its forest transit permit and hammer mark. Ask to see the paperwork — it is on file for each lot.',
  },
  {
    icon: Ruler,
    title: 'Measured in front of you',
    body: 'Tape at the yard, CFT worked out on the bill line by line. Logs by the Hoppus rule, sawn sizes by T × W × L ÷ 144.',
  },
  {
    icon: Droplets,
    title: 'Moisture-checked & seasoned',
    body: 'Timber is checked with a moisture meter before it leaves. Seasoned stock is stacked on stickers in shaded sheds.',
  },
  {
    icon: FileCheck2,
    title: 'Honest GST bills',
    body: 'HSN-wise tax invoice for every sale, e-way bill for deliveries and a clear statement of your account any time.',
  },
]

export default function Trust() {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef8f1_0%,#f6f3e6_100%)] py-20 sm:py-28">
      <div className="pointer-events-none absolute -left-24 top-0 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(116,195,146,0.35),transparent_65%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Why builders trust us" title={<>No guesswork.<br className="hidden sm:block" /> No surprises.</>} />
        <div ref={ref} className="relative mt-12">
          <div className="absolute left-0 right-0 top-[34px] hidden h-[3px] overflow-hidden rounded-full bg-leaf-100 lg:block">
            <div className={`h-full origin-left bg-gradient-to-r from-leaf-400 via-sun-400 to-teak-500 transition-transform duration-[1600ms] ease-out ${seen ? 'scale-x-100' : 'scale-x-0'}`} />
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className={`relative transition-all duration-700 ${seen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
                style={{ transitionDelay: `${250 + i * 160}ms` }}
              >
                <div className="relative z-[1] flex items-center gap-3">
                  <span className="grid size-[70px] place-items-center rounded-[22px] bg-paper text-leaf-600 shadow-card ring-1 ring-leaf-100">
                    <s.icon className="size-7" />
                  </span>
                  <span className="font-display text-5xl font-semibold text-leaf-200">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold leading-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
