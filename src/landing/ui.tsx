import { useEffect, useRef, useState, type ReactNode } from 'react'
import { plankUrl, endGrainCanvas, type WoodTone } from '../lib/wood'

/** Brand mark: Hanuman's gada (mace) on a teak log end, in a saffron medallion — the same file as the favicon. */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <img src="/favicon.svg" width={size} height={size} alt="" className={className} draggable={false} />
}

/** true once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, margin])
  return [ref, seen] as const
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts up from 0 when `run` turns true. */
export function CountUp({ value, run, decimals = 0, duration = 1600 }: { value: number; run: boolean; decimals?: number; duration?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!run) return
    if (prefersReducedMotion()) { setV(value); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      const e = 1 - Math.pow(1 - k, 4)
      setV(value * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, value, duration])
  return <>{new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v)}</>
}

export function SectionHeading({ eyebrow, title, children, align = 'left', tone = 'ink' }: {
  eyebrow: string; title: ReactNode; children?: ReactNode; align?: 'left' | 'center'; tone?: 'ink' | 'light'
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const light = tone === 'light'
  return (
    <div ref={ref} className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-2xl transition-all duration-700 ${seen ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
      <p className={`inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] ${light ? 'text-sun-300' : 'text-teak-600'}`}>
        <span className={`h-px w-6 ${light ? 'bg-sun-300' : 'bg-teak-400'}`} />
        {eyebrow}
      </p>
      <h2 className={`mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.02] tracking-tight ${light ? 'text-white' : 'text-ink'}`}>{title}</h2>
      {children && <p className={`mt-4 text-[15px] leading-relaxed sm:text-base ${light ? 'text-white/85' : 'text-ink-soft'}`}>{children}</p>}
    </div>
  )
}

// ── lazily generated wood textures (one per frame, only when visible) ──
type Job = () => void
const queue: Job[] = []
let pumping = false
function pump() {
  if (pumping) return
  pumping = true
  const step = () => {
    const job = queue.shift()
    if (!job) { pumping = false; return }
    job()
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (idle) idle(step, { timeout: 120 })
    else setTimeout(step, 16)
  }
  setTimeout(step, 0)
}
function schedule(job: Job) {
  queue.push(job)
  pump()
}

/** data-URL of a plank texture, generated after the element is near the viewport. */
export function useWoodUrl(tone: WoodTone, w: number, h: number, visible: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  const key = JSON.stringify([tone, w, h])
  useEffect(() => {
    if (!visible) return
    let alive = true
    schedule(() => { if (alive) setUrl(plankUrl(tone, w, h)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible])
  return url
}

const endCache = new Map<string, string>()
export function useEndGrainUrl(tone: WoodTone, size: number, visible: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  const key = JSON.stringify([tone, size])
  useEffect(() => {
    if (!visible) return
    let alive = true
    const hit = endCache.get(key)
    if (hit) { setUrl(hit); return }
    schedule(() => {
      const u = endGrainCanvas(tone, size).toDataURL('image/png')
      endCache.set(key, u)
      if (alive) setUrl(u)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible])
  return url
}
