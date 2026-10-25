// Opening scroll story: five full-bleed chapters, each backed by a video clip (public/landing/video) that
// crossfades into the next as you scroll. Missing clips fall back to photographic stills built from real
// wood scans, so the page is always complete. Only the first clip loads with the page.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { CLIP_KEYS, RAIL_LABELS, resolveClip, type ClipSource } from './clips'
import { DoorStill, GrainStill, OpeningStill, SawStill, YardStill, type SprayPoint } from './stills'
import Particles, { type ParticleState } from './Particles'
import { prefersReducedMotion } from '../ui'

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

interface Caption {
  kicker: string
  title: ReactNode
  body: string
  cta?: boolean
}
const CAPTIONS: Caption[] = [
  {
    kicker: 'Seasoned timber · Sawmill · Doors & frames',
    title: <>Timber, true<br />to the grain.</>,
    body: 'Teak and Indian hardwoods, sawn to your size in our own mill and measured to the last cubic foot.',
    cta: true,
  },
  {
    kicker: '01 · The sawmill',
    title: <>Sawn true,<br />to the inch.</>,
    body: 'Every log arrives with its forest permit and hammer mark. Our headsaw cuts it to your list, and each board is measured in CFT in front of you.',
  },
  {
    kicker: '02 · The grain',
    title: <>Every board<br />has a story.</>,
    body: 'Golden Ghana and Burma teak, deep rosewood, honey-coloured jackfruit — chosen board by board, so the figure you see is the figure you get.',
  },
  {
    kicker: '03 · Seasoning',
    title: <>Seasoned<br />slow.</>,
    body: 'Stacked on stickers every two feet and air-dried in the shade, so it stays straight long after it leaves our yard.',
  },
  {
    kicker: '04 · The craft',
    title: <>Built to<br />outlive us.</>,
    body: 'Chowkat frames, panelled doors, windows and furniture timber that only grows richer with age.',
    cta: true,
  },
]

export default function VideoHero() {
  const wrap = useRef<HTMLElement>(null)
  const layers = useRef<(HTMLDivElement | null)[]>([])
  const kbs = useRef<(HTMLDivElement | null)[]>([])
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const caps = useRef<(HTMLDivElement | null)[]>([])
  const railFill = useRef<HTMLDivElement>(null)
  const railDots = useRef<(HTMLLIElement | null)[]>([])
  const cue = useRef<HTMLDivElement>(null)
  const spray = useRef<SprayPoint | null>(null)
  const particles = useRef<ParticleState>({ spray: null, motes: 1, active: true })
  const visibleRef = useRef<boolean[]>([true, false, false, false, false])

  const [env] = useState(() => ({
    reduced: prefersReducedMotion(),
    mobile: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches,
    portrait: typeof window !== 'undefined' && window.matchMedia('(max-aspect-ratio: 4/5)').matches,
  }))
  const [sources, setSources] = useState<(ClipSource | undefined)[]>([undefined, undefined, undefined, undefined, undefined])
  const [near, setNear] = useState(1)
  const [playing, setPlaying] = useState<boolean[]>([false, false, false, false, false])
  const [failed, setFailed] = useState<boolean[]>([false, false, false, false, false])
  const nearRef = useRef(1)

  const sawActive = useRef(false)
  const onSpray = useCallback((p: SprayPoint | null) => {
    spray.current = p
    if (sawActive.current) particles.current.spray = p
  }, [])

  // find which clips exist (tiny HEAD requests)
  useEffect(() => {
    let alive = true
    CLIP_KEYS.forEach((k, i) => {
      resolveClip(k, env.portrait).then((src) => {
        if (alive) setSources((s) => s.map((x, j) => (j === i ? src : x)))
      })
    })
    return () => { alive = false }
  }, [env.portrait])

  // scroll → crossfades, Ken Burns, captions, video play/pause, lazy loading
  useEffect(() => {
    let raf = 0
    const progress = () => {
      const el = wrap.current
      if (!el) return 0
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      return total > 0 ? clamp01(-r.top / total) : 0
    }
    const apply = () => {
      raf = 0
      const p = progress()
      const x = p * CLIP_KEYS.length
      const fadeAt = (i: number) => (i === 0 ? 1 : smooth(i - 0.2, i + 0.12, x))
      CLIP_KEYS.forEach((_, i) => {
        const o = fadeAt(i)
        const covered = i < CLIP_KEYS.length - 1 && fadeAt(i + 1) >= 0.999
        const visible = o > 0.001 && !covered
        visibleRef.current[i] = visible
        const layer = layers.current[i]
        if (layer) {
          layer.style.opacity = String(o)
          layer.style.visibility = visible ? 'visible' : 'hidden'
        }
        const kb = kbs.current[i]
        if (kb && !env.reduced) {
          const local = clamp01((x - i + 0.2) / 1.35)
          kb.style.transform = `scale(${(1.14 - 0.14 * local).toFixed(4)}) translate3d(${((0.5 - local) * 1.6).toFixed(3)}%, ${((0.5 - local) * 1.1).toFixed(3)}%, 0)`
        }
        const v = videos.current[i]
        if (v) {
          if (visible && v.paused) v.play().catch(() => {})
          else if (!visible && !v.paused) v.pause()
        }
        const cap = caps.current[i]
        if (cap) {
          const co = i === 0 ? 1 - smooth(0.55, 0.85, x) : i === CLIP_KEYS.length - 1 ? smooth(i + 0.05, i + 0.22, x) : smooth(i + 0.05, i + 0.22, x) * (1 - smooth(i + 0.76, i + 0.93, x))
          cap.style.opacity = String(co)
          cap.style.transform = env.reduced ? 'none' : `translate3d(0, ${((1 - co) * 22).toFixed(1)}px, 0)`
          cap.style.visibility = co < 0.01 ? 'hidden' : 'visible'
          cap.style.pointerEvents = co > 0.6 ? 'auto' : 'none'
        }
      })
      // start loading the next chapter a little before it arrives
      const want = Math.min(CLIP_KEYS.length - 1, Math.floor(x + 0.7) + 1)
      if (want > nearRef.current) { nearRef.current = want; setNear(want) }
      sawActive.current = visibleRef.current[1] && smooth(0.8, 1.05, x) > 0.5
      particles.current.spray = sawActive.current ? spray.current : null
      if (railFill.current) railFill.current.style.transform = `scaleY(${p})`
      const active = Math.min(CLIP_KEYS.length - 1, Math.floor(x + 0.1))
      railDots.current.forEach((d, i) => d?.setAttribute('data-on', i <= active ? '1' : '0'))
      if (cue.current) cue.current.style.opacity = String(Math.max(0, 1 - x * 4))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply) }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // pause everything when the hero is off-screen or the tab is hidden
    let onScreen = true
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      particles.current.active = onScreen && !document.hidden
      if (!onScreen) videos.current.forEach((v) => v?.pause())
      else onScroll()
    })
    if (wrap.current) io.observe(wrap.current)
    const onVis = () => { particles.current.active = onScreen && !document.hidden; if (!document.hidden) onScroll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
    }
  }, [env.reduced])

  const stillFor = (i: number, ready: boolean) => {
    switch (CLIP_KEYS[i]) {
      case 'hero': return <OpeningStill ready={ready} mobile={env.mobile} />
      case 'saw': return <SawStill ready={ready} mobile={env.mobile} onSpray={onSpray} />
      case 'grain': return <GrainStill />
      case 'yard': return <YardStill ready={ready} mobile={env.mobile} />
      default: return <DoorStill />
    }
  }

  return (
    <section ref={wrap} id="story" aria-label="From the forest to your door" className="relative h-[470vh] bg-[#6e3a1c] md:h-[520vh]">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        {CLIP_KEYS.map((key, i) => {
          const src = sources[i]
          const useVideo = Boolean(src?.video) && !failed[i] && !env.reduced
          const showStill = src !== undefined && (!useVideo || !playing[i])
          return (
            <div
              key={key}
              ref={(el) => { layers.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? 'visible' : 'hidden' }}
            >
              <div ref={(el) => { kbs.current[i] = el }} className="absolute inset-0 will-change-transform" style={{ transform: env.reduced ? undefined : 'scale(1.14)' }}>
                {i === 0 && <div className="absolute inset-0" style={{ background: 'radial-gradient(140% 110% at 22% 18%, #ffe7b4 0%, #f6c37a 24%, #d48a44 52%, #8a4b22 82%, #5e3218 100%)' }} />}
                {showStill && near >= i && stillFor(i, !useVideo || failed[i])}
                {useVideo && src?.poster && (
                  <img src={src.poster} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing[i] ? 'opacity-0' : 'opacity-100'}`} />
                )}
                {useVideo && near >= i && (
                  <video
                    ref={(el) => {
                      videos.current[i] = el
                      if (el) { el.muted = true; el.defaultMuted = true; el.setAttribute('muted', '') }
                    }}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing[i] ? 'opacity-100' : 'opacity-0'}`}
                    src={src!.video!}
                    muted
                    playsInline
                    loop
                    autoPlay={i === 0}
                    preload="auto"
                    disablePictureInPicture
                    aria-hidden
                    onPlaying={() => setPlaying((s) => s.map((x, j) => (j === i ? true : x)))}
                    onError={() => setFailed((s) => s.map((x, j) => (j === i ? true : x)))}
                  />
                )}
              </div>
            </div>
          )
        })}

        <Particles state={particles} mobile={env.mobile} />

        {/* light leaks and film grain for a photographic feel */}
        <div className="pointer-events-none absolute inset-0 mix-blend-screen opacity-60 motion-safe:animate-[leak_14s_ease-in-out_infinite_alternate] bg-[radial-gradient(40%_35%_at_15%_20%,rgba(255,196,120,0.45),transparent_70%),radial-gradient(35%_30%_at_90%_80%,rgba(255,150,90,0.3),transparent_70%)]" />
        <Grain />

        {/* warm scrims for legibility — brown, never black */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28%] bg-[linear-gradient(180deg,rgba(43,24,12,0.55),transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_100%_at_0%_100%,rgba(43,24,12,0.82)_0%,rgba(43,24,12,0.42)_45%,transparent_72%)]" />

        {CAPTIONS.map((c, i) => (
          <div
            key={i}
            ref={(el) => { caps.current[i] = el }}
            className={
              i === 0
                ? 'absolute inset-x-0 bottom-[12svh] px-5 will-change-transform sm:bottom-[14svh] md:left-[6vw] md:right-auto md:max-w-[min(820px,62vw)] md:px-0'
                : 'absolute inset-x-0 bottom-[9svh] px-5 will-change-transform sm:bottom-[11svh] md:left-[6vw] md:right-auto md:max-w-[min(640px,52vw)] md:px-0'
            }
            style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? 'visible' : 'hidden' }}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-sun-300 [text-shadow:0_1px_3px_rgba(43,24,12,0.9),0_1px_16px_rgba(43,24,12,0.7)]">{c.kicker}</p>
            <h2
              className={`mt-3 font-display font-semibold leading-[0.93] tracking-[-0.02em] text-[#fff7ea] [text-shadow:0_4px_40px_rgba(43,24,12,0.55)] ${
                i === 0 ? 'text-[clamp(3rem,10vw,8.2rem)]' : 'text-[clamp(2.6rem,7.4vw,6rem)]'
              }`}
            >
              {c.title}
            </h2>
            <p className="mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-[#fbe9cf] [text-shadow:0_1px_18px_rgba(43,24,12,0.7)] sm:text-lg">{c.body}</p>
            {c.cta && (
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#enquiry" className="btn-primary px-6 py-3 text-[15px]">{i === 0 ? 'Get a quote' : 'Plan your doors & frames'} <ArrowRight className="size-4" /></a>
                <a href={i === 0 ? '#species' : '#calculator'} className="btn inline-flex bg-white/12 px-6 py-3 text-[15px] text-white ring-1 ring-white/35 backdrop-blur-md hover:bg-white/20">
                  {i === 0 ? 'Explore our timber' : 'CFT calculator'}
                </a>
              </div>
            )}
          </div>
        ))}

        <div ref={cue} className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 text-[#fbe9cf] sm:bottom-7 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-col">
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.3em] sm:block">Scroll the story</span>
          <span className="grid size-10 place-items-center rounded-full bg-white/12 ring-1 ring-white/30 backdrop-blur"><ArrowDown className="size-4 motion-safe:animate-bounce" /></span>
        </div>

        <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 lg:block">
          <div className="flex gap-4">
            <div className="relative h-60 w-[3px] overflow-hidden rounded-full bg-white/20">
              <div ref={railFill} className="absolute inset-0 origin-top bg-gradient-to-b from-sun-300 to-teak-400" style={{ transform: 'scaleY(0)' }} />
            </div>
            <ol className="flex h-60 flex-col justify-between">
              {RAIL_LABELS.map((r, i) => (
                <li
                  key={r}
                  ref={(el) => { railDots.current[i] = el }}
                  data-on={i === 0 ? '1' : '0'}
                  className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45 transition-colors duration-500 [text-shadow:0_1px_10px_rgba(43,24,12,0.6)] data-[on='1']:text-[#fff7ea]"
                >
                  {String(i + 1).padStart(2, '0')} {r}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <style>{'@keyframes leak { 0% { transform: translate3d(-3%, -2%, 0) scale(1) } 100% { transform: translate3d(4%, 3%, 0) scale(1.08) } }'}</style>
    </section>
  )
}

/** Very light photographic grain (generated once, 6 KB). */
let grainUrl: string | null = null
function Grain() {
  const [url, setUrl] = useState<string | null>(grainUrl)
  useEffect(() => {
    if (grainUrl) return
    const c = document.createElement('canvas')
    c.width = c.height = 140
    const g = c.getContext('2d')!
    const img = g.createImageData(140, 140)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 22
    }
    g.putImageData(img, 0, 0)
    grainUrl = c.toDataURL('image/png')
    setUrl(grainUrl)
  }, [])
  if (!url) return null
  return <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ backgroundImage: `url(${url})` }} />
}
