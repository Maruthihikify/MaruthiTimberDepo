import { useEffect, useState, type CSSProperties } from 'react'
import { Calculator as CalcIcon, Info, Minus, Plus } from 'lucide-react'
import { cftToCbm, hoppusCft, sawnCft, trueLogCft } from '../../lib/timber'
import { SectionHeading, useInView } from '../ui'
import type { PublicSpecies } from '../data'
import { scanFor } from './Species'
import { logFace } from '../hero/stills'

const tex = (f: string) => `${import.meta.env.BASE_URL}landing/textures/${f}`
const fmt = (n: number, d = 3) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: d }).format(n)

// one realistic log face, generated once in the browser and shared by both tabs
let faceUrl: Promise<string> | null = null
function useLogFace(run: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!run) return
    let alive = true
    faceUrl ??= logFace(384, 9, 48).then((c) => c.toDataURL('image/png'))
    faceUrl.then((u) => alive && setUrl(u)).catch(() => {})
    return () => { alive = false }
  }, [run])
  return url
}

function Stepper({ label, value, onChange, step, min, max, unit }: {
  label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number; unit: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000))
  return (
    <label className="field">
      <span className="label">{label}</span>
      <span className="flex items-stretch overflow-hidden rounded-xl bg-white ring-1 ring-line-strong/70 focus-within:ring-2 focus-within:ring-teak-300">
        <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(clamp(value - step))} className="grid w-10 shrink-0 place-items-center text-teak-700 hover:bg-teak-50"><Minus className="size-4" /></button>
        <input
          type="number"
          inputMode="decimal"
          className="num w-full min-w-0 bg-transparent py-2.5 text-center text-base font-bold text-ink outline-none"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : clamp(Number(e.target.value)))}
        />
        <span className="grid shrink-0 place-items-center pr-2 text-xs font-bold text-ink-mute">{unit}</span>
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))} className="grid w-10 shrink-0 place-items-center text-teak-700 hover:bg-teak-50"><Plus className="size-4" /></button>
      </span>
    </label>
  )
}

export default function Calculator({ species, showPrices }: { species: PublicSpecies[]; showPrices: boolean }) {
  const [tab, setTab] = useState<'sawn' | 'log'>('sawn')
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px 300px 0px')
  const face = useLogFace(seen)
  const [sp, setSp] = useState(species[0]?.name ?? 'Ghana Teak')

  const [t, setT] = useState(5)
  const [w, setW] = useState(3)
  const [l, setL] = useState(7)
  const [pcs, setPcs] = useState(4)
  const [g, setG] = useState(54)
  const [len, setLen] = useState(12)
  const [bark, setBark] = useState(1)
  const [metric, setMetric] = useState(false)

  const sawn = sawnCft(t, w, l, pcs)
  const girthIn = metric ? g / 2.54 : g
  const lenFt = metric ? len * 3.28084 : len
  const barkIn = metric ? bark / 2.54 : bark
  const hop = hoppusCft(girthIn, lenFt, barkIn)
  const tru = trueLogCft(girthIn - barkIn, lenFt)
  const selected = species.find((s) => s.name === sp)
  const rate = showPrices ? selected?.rate_from ?? null : null
  const scan = scanFor(sp) ?? { src: tex('card_teak.webp'), tint: '#ebc597' }

  return (
    <section id="calculator" className="relative scroll-mt-20 overflow-hidden bg-[linear-gradient(180deg,#fbf6ee_0%,#f4efe3_100%)] py-20 sm:py-28">
      <div className="pointer-events-none absolute -right-40 top-10 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(142,195,238,0.35),transparent_65%)]" />
      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Measure like the trade" title={<>Know your CFT<br className="hidden sm:block" /> before you come.</>}>
          The same arithmetic our bill uses — sawn timber by thickness × width × length, round logs by the Hoppus rule. Try your sizes.
        </SectionHeading>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* visual */}
          <div className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_30%_10%,#fff3dc_0%,#f6dfb9_45%,#e9c18c_100%)] ring-1 ring-line sm:min-h-[400px]">
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgba(169,94,31,0.12))]" />
            <div className="absolute inset-0 grid place-items-center">
              {tab === 'sawn' ? (
                <PlankStack t={t} w={w} l={l} pcs={pcs} scan={scan} face={face} />
              ) : (
                <LogView girthIn={girthIn} lenFt={lenFt} face={face} />
              )}
            </div>
            <div className="absolute left-4 top-4 flex gap-1 rounded-2xl bg-paper/85 p-1 ring-1 ring-line backdrop-blur">
              {(['sawn', 'log'] as const).map((k) => (
                <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${tab === k ? 'bg-teak-600 text-white shadow' : 'text-teak-800 hover:bg-teak-50'}`}>
                  {k === 'sawn' ? 'Sawn timber' : 'Round log'}
                </button>
              ))}
            </div>
          </div>

          {/* inputs + result */}
          <div className="card p-5 sm:p-7">
            {tab === 'sawn' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stepper label="Thickness" value={t} onChange={setT} step={0.5} min={0.5} max={24} unit="in" />
                  <Stepper label="Width" value={w} onChange={setW} step={0.5} min={0.5} max={24} unit="in" />
                  <Stepper label="Length" value={l} onChange={setL} step={0.5} min={1} max={24} unit="ft" />
                  <Stepper label="Pieces" value={pcs} onChange={(v) => setPcs(Math.round(v))} step={1} min={1} max={999} unit="pcs" />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {[[5, 3, 'Door frame'], [4, 2, 'Rafter'], [6, 1, 'Plank'], [3, 2, 'Reaper'], [4, 4, 'Post']].map(([a, b, n]) => (
                    <button key={String(n)} onClick={() => { setT(a as number); setW(b as number) }} className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-teak-800 ring-1 ring-line hover:ring-teak-300">
                      {a}″×{b}″ {n}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="label">Units</span>
                  <div className="flex gap-1 rounded-xl bg-cream p-1 text-xs font-bold">
                    <button onClick={() => { if (metric) { setMetric(false); setG(Math.round(g / 2.54)); setLen(Math.round(len * 3.28084 * 2) / 2); setBark(Math.round((bark / 2.54) * 2) / 2) } }} className={`rounded-lg px-2.5 py-1 ${!metric ? 'bg-paper shadow text-ink' : 'text-ink-soft'}`}>in / ft</button>
                    <button onClick={() => { if (!metric) { setMetric(true); setG(Math.round(g * 2.54)); setLen(Math.round((len / 3.28084) * 10) / 10); setBark(Math.round(bark * 2.54)) } }} className={`rounded-lg px-2.5 py-1 ${metric ? 'bg-paper shadow text-ink' : 'text-ink-soft'}`}>cm / m</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stepper label="Mid girth" value={g} onChange={setG} step={1} min={10} max={metric ? 600 : 240} unit={metric ? 'cm' : 'in'} />
                  <Stepper label="Length" value={len} onChange={setLen} step={metric ? 0.1 : 0.5} min={1} max={metric ? 12 : 40} unit={metric ? 'm' : 'ft'} />
                  <Stepper label="Bark allowance" value={bark} onChange={setBark} step={metric ? 1 : 0.5} min={0} max={metric ? 15 : 6} unit={metric ? 'cm' : 'in'} />
                </div>
              </>
            )}

            <label className="field mt-4">
              <span className="label">Species</span>
              <select className="input" value={sp} onChange={(e) => setSp(e.target.value)}>
                {species.map((s) => <option key={s.id}>{s.name}</option>)}
              </select>
            </label>

            <div className="mt-5 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#45261a,#85481b)] p-5 text-white">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sun-300"><CalcIcon className="size-4" /> {tab === 'sawn' ? 'Volume' : 'Hoppus volume'}</p>
              <p className="num mt-2 font-display text-5xl font-semibold leading-none">{fmt(tab === 'sawn' ? sawn : hop)} <span className="text-2xl text-teak-200">CFT</span></p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {tab === 'sawn' ? (
                  <>
                    <p><span className="block text-xs text-teak-200">Per piece</span><span className="num font-bold">{fmt(sawnCft(t, w, l, 1))} CFT</span></p>
                    <p><span className="block text-xs text-teak-200">Cubic metres</span><span className="num font-bold">{fmt(cftToCbm(sawn))} m³</span></p>
                  </>
                ) : (
                  <>
                    <p><span className="block text-xs text-teak-200">True volume</span><span className="num font-bold">{fmt(tru)} CFT</span></p>
                    <p><span className="block text-xs text-teak-200">Cubic metres (Hoppus)</span><span className="num font-bold">{fmt(cftToCbm(hop))} m³</span></p>
                  </>
                )}
              </div>
              {rate ? (
                <p className="mt-4 border-t border-white/15 pt-3 text-sm text-teak-100">
                  Approx. ₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format((tab === 'sawn' ? sawn : hop) * rate)} at ₹{new Intl.NumberFormat('en-IN').format(rate)}/CFT + GST
                </p>
              ) : null}
            </div>
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-mute">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {tab === 'sawn'
                ? 'CFT = thickness (in) × width (in) × length (ft) × pieces ÷ 144.'
                : 'Hoppus CFT = ((girth − bark allowance) ÷ 4)² × length ÷ 144, girth measured at the middle. It counts the usable square of the log, so it reads about 21% below the true round volume.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/** CSS-3D boards in true proportion, stacked up to five, with scanned grain and real end rings. */
function PlankStack({ t, w, l, pcs, scan, face }: { t: number; w: number; l: number; pcs: number; scan: { src: string; tint?: string; filter?: string }; face: string | null }) {
  // fit the longest dimension into ~300px, keep true proportions (1 ft = 12 in)
  const s = Math.min(300 / (l * 12), 22, 160 / Math.max(w, t * 2))
  const L = l * 12 * s, W = w * s, T = t * s
  const n = Math.min(pcs, 5)
  const grain: CSSProperties = {
    backgroundImage: `url(${scan.src})`, backgroundColor: scan.tint, backgroundBlendMode: scan.tint ? 'multiply' : undefined,
    backgroundSize: `${Math.max(L * 0.9, 120)}px auto`, filter: scan.filter,
  }
  const endStyle: CSSProperties = face
    ? { backgroundImage: `url(${face})`, backgroundSize: `${Math.max(W, T) * 4}px`, backgroundPosition: '62% 38%' }
    : { backgroundColor: '#c99559' }
  const faceBox = (fw: number, fh: number, tr: string, st: CSSProperties, shade = 0) => (
    <div
      className="absolute left-1/2 top-1/2 transition-all duration-500 ease-out"
      style={{ width: fw, height: fh, marginLeft: -fw / 2, marginTop: -fh / 2, transform: tr, ...st, boxShadow: shade ? `inset 0 0 0 999px rgba(60,30,10,${shade})` : undefined }}
    />
  )
  return (
    <div className="relative h-full w-full [perspective:1100px]">
      <div className="absolute left-1/2 top-[56%] h-0 w-0 [transform-style:preserve-3d] [transform:rotateX(-24deg)_rotateY(-34deg)] motion-safe:animate-[plank-sway_9s_ease-in-out_infinite]">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="absolute [transform-style:preserve-3d] transition-transform duration-500" style={{ transform: `translateY(${-i * (T + 3)}px)` }}>
            {faceBox(L, W, `rotateX(90deg) translateZ(${T / 2}px)`, grain)}
            {faceBox(L, W, `rotateX(-90deg) translateZ(${T / 2}px)`, grain, 0.35)}
            {faceBox(L, T, `translateZ(${W / 2}px)`, grain, 0.12)}
            {faceBox(L, T, `rotateY(180deg) translateZ(${W / 2}px)`, grain, 0.3)}
            {faceBox(W, T, `rotateY(90deg) translateZ(${L / 2}px)`, endStyle, 0.05)}
            {faceBox(W, T, `rotateY(-90deg) translateZ(${L / 2}px)`, endStyle, 0.25)}
          </div>
        ))}
      </div>
      <div className="absolute bottom-[14%] left-1/2 h-6 w-[60%] -translate-x-1/2 rounded-[50%] bg-teak-900/20 blur-xl" />
      {pcs > 5 && <span className="absolute bottom-5 right-5 rounded-full bg-paper/90 px-3 py-1 text-sm font-bold text-teak-800 ring-1 ring-line">× {pcs} pcs</span>}
      <style>{`@keyframes plank-sway { 0%,100% { transform: rotateX(-24deg) rotateY(-34deg) } 50% { transform: rotateX(-20deg) rotateY(-14deg) } }`}</style>
    </div>
  )
}

function LogView({ girthIn, lenFt, face }: { girthIn: number; lenFt: number; face: string | null }) {
  const dia = girthIn / Math.PI // inches
  const D = Math.min(230, Math.max(70, dia * 7))
  const Lpx = Math.min(520, Math.max(120, lenFt * 18))
  const quarter = (girthIn / 4) / dia // side of the Hoppus square relative to the diameter
  return (
    <div className="flex w-full flex-col items-center gap-6 px-6">
      <div className="relative transition-all duration-500" style={{ width: D, height: D }}>
        <div className="absolute inset-0 rounded-full shadow-[0_24px_50px_-18px_rgba(69,38,26,0.6)]" style={face ? { backgroundImage: `url(${face})`, backgroundSize: 'cover' } : { background: 'radial-gradient(circle,#c58a4b,#8a5a2e)' }} />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-white/85 shadow-[0_0_0_9999px_rgba(255,255,255,0.08)] transition-all duration-500"
          style={{ width: D * quarter, height: D * quarter }}
          title="Hoppus counts this square"
        />
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-teak-800">⌀ {fmt(dia, 1)}″ · girth {fmt(girthIn, 1)}″</span>
      </div>
      <div className="relative mt-4 h-10 max-w-full transition-all duration-500" style={{ width: Lpx }}>
        <div className="absolute inset-0 overflow-hidden rounded-full shadow-[0_14px_30px_-14px_rgba(69,38,26,0.6)]">
          {/* bark furrows run along the log, so the scan is turned on its side */}
          <div
            className="absolute left-1/2 top-1/2 h-[600px] w-10 -translate-x-1/2 -translate-y-1/2 rotate-90"
            style={{ backgroundImage: `url(${tex('bark_diff.webp')})`, backgroundSize: '120px auto' }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_40%,rgba(40,20,8,0.35))]" />
        </div>
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-teak-800">{fmt(lenFt, 1)} ft</span>
      </div>
    </div>
  )
}
