// Photographic still treatments used when a hero video clip is not available (or the visitor prefers
// reduced motion). Everything is built from real CC0 wood scans and the procedural cross-cut log face —
// no illustrations, no flat colours.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { brushedSteelCanvases, logFaceCanvases, type LogFaceOptions } from './procedural'

const tex = (f: string) => `${import.meta.env.BASE_URL}landing/textures/${f}`
export const TEAK_2K = tex('teak_2k.webp')

// ── shared, cached generators (log faces are rendered in a Web Worker) ──
let worker: Worker | null | undefined
let jobSeq = 0
const jobs = new Map<number, { opts: LogFaceOptions; done: (c: HTMLCanvasElement) => void }>()
function toCanvas(size: number, data: Uint8ClampedArray<ArrayBuffer>) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d')!.putImageData(new ImageData(data, size, size), 0, 0)
  return c
}
function mainThread(opts: LogFaceOptions, done: (c: HTMLCanvasElement) => void) {
  logFaceCanvases(opts).then((f) => done(f.color))
}
function faceWorker() {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; size: number; color: Uint8ClampedArray<ArrayBuffer> }>) => {
      const j = jobs.get(e.data.id)
      jobs.delete(e.data.id)
      j?.done(toCanvas(e.data.size, e.data.color))
    }
    worker.onerror = () => {
      worker = null
      jobs.forEach((j) => mainThread(j.opts, j.done))
      jobs.clear()
    }
  } catch {
    worker = null
  }
  return worker
}
const faceCache = new Map<string, Promise<HTMLCanvasElement>>()
export function logFace(size: number, seed: number, rings = 60): Promise<HTMLCanvasElement> {
  const key = `${size}:${seed}:${rings}`
  let p = faceCache.get(key)
  if (!p) {
    p = new Promise<HTMLCanvasElement>((done) => {
      const opts = { size, seed, rings }
      const w = faceWorker()
      if (!w) return mainThread(opts, done)
      const id = ++jobSeq
      jobs.set(id, { opts, done })
      w.postMessage({ id, opts })
    })
    faceCache.set(key, p)
  }
  return p
}
const urlCache = new WeakMap<HTMLCanvasElement, Promise<string>>()
function canvasUrl(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<string> {
  let p = urlCache.get(c)
  if (!p) {
    p = new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : c.toDataURL(type, q)), type, q))
    urlCache.set(c, p)
  }
  return p
}

function useLogFaceUrl(run: boolean, size: number, seed: number, rings?: number) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!run) return
    let alive = true
    logFace(size, seed, rings).then(canvasUrl).then((u) => alive && setUrl(u)).catch(() => {})
    return () => { alive = false }
  }, [run, size, seed, rings])
  return url
}

/** Watches the element size so canvas stills are drawn at the right resolution. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      setSize((s) => (Math.abs(s.w - r.width) > 2 || Math.abs(s.h - r.height) > 2 ? { w: r.width, h: r.height } : s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

const fadeIn = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0, transition: 'opacity 1.2s ease' })

// ── 1. Opening: a pile of teak log ends in low golden sun ──
export function OpeningStill({ ready, mobile }: { ready: boolean; mobile: boolean }) {
  // two generated faces, turned and mirrored, make a believable pile
  // two generated faces, turned and mirrored, make a believable pile
  const a = useLogFaceUrl(ready, mobile ? 512 : 896, 5, 64)
  const b = useLogFaceUrl(ready, mobile ? 384 : 640, 12, 46)
  // [url, left %, top %, size %, rotate°, depth 0 front … 2 back] — % of a square that covers the screen
  const logs: [string | null, number, number, number, number, number][] = [
    [b, 0, 4, 30, 40, 2], [a, 24, 0, 32, 160, 2], [b, 50, 3, 30, 250, 2], [a, 75, 6, 30, 90, 2],
    [a, -7, 28, 37, 300, 1], [b, 20, 25, 38, 80, 1], [a, 46, 27, 36, 200, 1], [b, 71, 28, 38, 20, 1],
    [a, 5, 53, 45, 20, 0], [b, 35, 50, 47, 130, 0], [a, 65, 55, 44, 280, 0],
  ]
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(140% 110% at 22% 18%, #ffe7b4 0%, #f6c37a 24%, #d48a44 52%, #8a4b22 82%, #5e3218 100%)' }}>
      {/* stack of log ends, back to front: deeper logs are softer and darker */}
      <div className="absolute left-1/2 top-1/2 aspect-square w-[max(100vw,100svh)] -translate-x-1/2 -translate-y-[46%]">
        {logs.map(([u, x, y, s, rot, depth], i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${x}%`, top: `${y}%`, width: `${s}%`, aspectRatio: '1',
              filter: depth === 2 ? 'blur(3px) brightness(0.62) saturate(0.95)' : depth === 1 ? 'blur(1.2px) brightness(0.8)' : 'drop-shadow(0 28px 34px rgba(69,38,26,0.55))',
              ...fadeIn(Boolean(u)),
            }}
          >
            {u && (
              <>
                <img src={u} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" style={{ transform: `rotate(${rot}deg)` }} />
                {/* sun from the upper left: highlight and falloff, masked to the log's own outline */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,226,170,0.32) 0%, rgba(255,226,170,0) 42%, rgba(52,28,14,0.42) 100%)',
                    WebkitMaskImage: `url(${u})`, maskImage: `url(${u})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
                    transform: `rotate(${rot}deg)`,
                  }}
                />
              </>
            )}
          </div>
        ))}
      </div>
      {/* warm haze drifting between the logs */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_28%_22%,rgba(255,236,196,0.55),transparent_70%)] mix-blend-screen" />
    </div>
  )
}

// ── 2. Sawmill: a 36″ inserted-tooth blade biting into a teak board ──
function bladeCanvas(size: number) {
  const steel = brushedSteelCanvases(size, 'MARUTHI TIMBER DEPOT  ·  36″  ·  44 T  ·  INSERTED TOOTH  ·  ')
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const R = size / 2 - 2
  const cx = size / 2, cy = size / 2
  const teeth = 44
  const step = (Math.PI * 2) / teeth
  const rg = R * 0.9
  const outline = () => {
    g.beginPath()
    for (let i = 0; i < teeth; i++) {
      const a = i * step
      const p = (r: number, ang: number) => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r] as const
      const [x0, y0] = p(rg, a)
      if (i === 0) g.moveTo(x0, y0)
      const [qx, qy] = p(R * 0.975, a + step * 0.35)
      const [tx, ty] = p(R, a + step * 0.7)
      g.quadraticCurveTo(qx, qy, tx, ty)
      const [fx, fy] = p(R * 0.935, a + step * 0.76)
      g.lineTo(fx, fy)
      const [gx, gy] = p(rg * 0.955, a + step * 0.95)
      const [nx, ny] = p(rg, a + step)
      g.quadraticCurveTo(gx, gy, nx, ny)
    }
    g.closePath()
  }
  g.save()
  outline()
  g.clip()
  g.drawImage(steel.color, 0, 0, size, size)
  // anisotropic sheen of ground steel: bright sectors facing the light
  const cg = (g as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient?.(-0.6, cx, cy)
  if (cg) {
    cg.addColorStop(0, 'rgba(255,255,255,0.32)'); cg.addColorStop(0.08, 'rgba(255,255,255,0)'); cg.addColorStop(0.42, 'rgba(255,255,255,0)')
    cg.addColorStop(0.5, 'rgba(255,248,232,0.26)'); cg.addColorStop(0.58, 'rgba(255,255,255,0)'); cg.addColorStop(0.92, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0.32)')
    g.fillStyle = cg
    g.fillRect(0, 0, size, size)
  }
  const rim = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R)
  rim.addColorStop(0, 'rgba(0,0,0,0)')
  rim.addColorStop(1, 'rgba(70,58,46,0.35)')
  g.fillStyle = rim
  g.fillRect(0, 0, size, size)
  g.restore()
  // stellite tips, alternately set
  for (let i = 0; i < teeth; i++) {
    const a = i * step + step * 0.7
    g.save()
    g.translate(cx + Math.cos(a) * (R - size * 0.008), cy + Math.sin(a) * (R - size * 0.008))
    g.rotate(a + Math.PI / 2)
    const w = size * 0.022, h = size * 0.012
    const tg = g.createLinearGradient(-w / 2, 0, w / 2, 0)
    tg.addColorStop(0, '#9c8a62'); tg.addColorStop(0.5, i % 2 ? '#efe0b8' : '#d8c494'); tg.addColorStop(1, '#8a774f')
    g.fillStyle = tg
    g.fillRect(-w / 2, -h / 2, w, h)
    g.restore()
  }
  // cut-outs: arbor, drive holes, expansion slots
  g.globalCompositeOperation = 'destination-out'
  g.beginPath(); g.arc(cx, cy, R * 0.06, 0, Math.PI * 2); g.fill()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.21, cy + Math.sin(a) * R * 0.21, R * 0.025, 0, Math.PI * 2); g.fill()
  }
  g.lineCap = 'round'
  g.lineWidth = R * 0.012
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72)
    g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86)
    g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
  // clamping collar with bolts
  const col = g.createRadialGradient(cx - R * 0.05, cy - R * 0.05, R * 0.02, cx, cy, R * 0.2)
  col.addColorStop(0, '#d9dee4'); col.addColorStop(0.7, '#9aa3ad'); col.addColorStop(1, '#6f7882')
  g.fillStyle = col
  g.beginPath(); g.arc(cx, cy, R * 0.19, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#5f6872'
  g.beginPath(); g.arc(cx, cy, R * 0.065, 0, Math.PI * 2); g.fill()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const bx = cx + Math.cos(a) * R * 0.13, by = cy + Math.sin(a) * R * 0.13
    const bg = g.createRadialGradient(bx - 2, by - 2, 1, bx, by, R * 0.022)
    bg.addColorStop(0, '#eef1f4'); bg.addColorStop(1, '#78818b')
    g.fillStyle = bg
    g.beginPath(); g.arc(bx, by, R * 0.02, 0, Math.PI * 2); g.fill()
  }
  return c
}

let bladePromise: Promise<string> | null = null
export interface SprayPoint { x: number; y: number }

export function SawStill({ ready, mobile, onSpray }: { ready: boolean; mobile: boolean; onSpray: (p: SprayPoint | null) => void }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [blade, setBlade] = useState<string | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    bladePromise ??= new Promise<string>((res) => setTimeout(() => res(canvasUrl(bladeCanvas(mobile ? 768 : 1280))), 0)).then((p) => p)
    bladePromise.then((u) => alive && setBlade(u))
    return () => { alive = false }
  }, [ready, mobile])

  // layout in px: the blade dips 38% of its radius below the board's top edge
  const land = w > h
  const R = Math.min(w, h) * (land ? 0.5 : 0.56)
  const boardTop = h * (land ? 0.66 : 0.6)
  const cx = w * (land ? 0.68 : 0.62)
  const dip = 0.42 // how far the blade sits below the board's top edge, as a fraction of its radius
  const cy = boardTop - R * (1 - dip)
  const contactX = cx - R * Math.sqrt(1 - (1 - dip) * (1 - dip))
  useEffect(() => {
    if (w > 0 && blade) onSpray({ x: contactX / w, y: boardTop / h })
    return () => onSpray(null)
  }, [w, h, blade, contactX, boardTop, onSpray])

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(180deg,#6a3d22 0%,#8c5428 40%,#57321c 100%)' }}>
      {/* light beam through the shed */}
      <div className="absolute -left-[20%] -top-[30%] h-[160%] w-[55%] rotate-[24deg] bg-[linear-gradient(90deg,transparent,rgba(255,226,170,0.32),transparent)] blur-2xl" />
      {blade && w > 0 && (
        <div className="absolute" style={{ left: cx - R, top: cy - R, width: R * 2, height: R * 2, ...fadeIn(true) }}>
          <div className="absolute inset-0 motion-safe:animate-[blade-spin_1.1s_linear_infinite]">
            <img src={blade} alt="" draggable={false} className="absolute inset-0 h-full w-full drop-shadow-[0_30px_40px_rgba(52,28,14,0.55)]" />
            <img src={blade} alt="" draggable={false} className="absolute inset-0 h-full w-full rotate-[-5deg] opacity-30 blur-[0.6px] motion-reduce:hidden" />
            <img src={blade} alt="" draggable={false} className="absolute inset-0 h-full w-full rotate-[-10deg] opacity-15 blur-[1px] motion-reduce:hidden" />
          </div>
          {/* speed haze over the teeth */}
          <div className="absolute inset-0 rounded-full motion-reduce:hidden" style={{ background: 'radial-gradient(circle, transparent 84%, rgba(235,232,224,0.28) 92%, transparent 100%)' }} />
        </div>
      )}
      {/* the teak board: lit top edge, scanned face, kerf where the blade has passed */}
      <div className="absolute inset-x-0 bottom-0" style={{ top: boardTop }}>
        <div className="absolute inset-x-0 top-0 h-[2.4%] min-h-[10px] bg-[linear-gradient(180deg,#f7d9a6,#d9a464)]" />
        <div className="absolute inset-x-0 bottom-0 top-[2.4%]" style={{ backgroundImage: `url(${TEAK_2K})`, backgroundSize: `${Math.max(w, 900) * 1.2}px auto`, backgroundPosition: '30% 40%', boxShadow: 'inset 0 18px 30px -12px rgba(52,28,14,0.55)' }} />
        <div className="absolute top-0 h-[2.4%] min-h-[10px] bg-[linear-gradient(180deg,#3e2414,#7a4a26)]" style={{ left: contactX + R * 0.1, right: 0, opacity: 0.8 }} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(52,28,14,0.35),transparent_30%,transparent_70%,rgba(52,28,14,0.45))]" />
      </div>
      <style>{'@keyframes blade-spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

// ── 3. Grain: macro of a fresh teak surface with a travelling light sweep ──
export function GrainStill() {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const size = Math.max(w, h) * 1.25
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-[#b47a40]">
      <div className="absolute inset-[-12%] [perspective:1400px]">
        <div
          className="absolute inset-0 origin-bottom [transform:rotateX(38deg)_scale(1.35)]"
          style={{ backgroundImage: `url(${TEAK_2K})`, backgroundSize: `${size || 1800}px auto`, backgroundPosition: '50% 60%', filter: 'saturate(1.12) contrast(1.06)' }}
        />
      </div>
      {/* shallow depth of field: far edge falls soft */}
      <div className="absolute inset-x-0 top-0 h-[38%] backdrop-blur-[3px] [mask-image:linear-gradient(180deg,black,transparent)]" />
      {/* raking light sweeping across the grain */}
      <div className="absolute inset-0 mix-blend-soft-light motion-safe:animate-[grain-sweep_7s_ease-in-out_infinite] bg-[linear-gradient(100deg,transparent_30%,rgba(255,244,220,0.85)_48%,transparent_66%)] bg-[length:250%_100%]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_35%,transparent_45%,rgba(70,36,16,0.5)_100%)]" />
      <style>{'@keyframes grain-sweep { 0% { background-position: 120% 0 } 100% { background-position: -40% 0 } }'}</style>
    </div>
  )
}

// ── 4. Seasoning: end view of a stickered stack, each board end showing its own rings ──
export function YardStill({ ready, mobile }: { ready: boolean; mobile: boolean }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [url, setUrl] = useState<string | null>(null)
  // redraw only for real layout changes, not for every mobile address-bar wobble
  const qw = Math.ceil(w / 160) * 160, qh = Math.ceil(h / 160) * 160
  useEffect(() => {
    if (!ready || qw === 0) return
    let alive = true
    const scale = Math.min(1, (mobile ? 900 : 1700) / Math.max(qw, qh))
    const cw = Math.round(qw * scale), ch = Math.round(qh * scale)
    Promise.all([logFace(mobile ? 640 : 1024, 5, 64), logFace(mobile ? 448 : 640, 12, 46)]).then(async ([f1, f2]) => {
      const c = document.createElement('canvas')
      c.width = cw
      c.height = ch
      const g = c.getContext('2d')!
      const bg = g.createLinearGradient(0, 0, 0, ch)
      bg.addColorStop(0, '#5a3420'); bg.addColorStop(1, '#3f2414')
      g.fillStyle = bg
      g.fillRect(0, 0, cw, ch)
      let s = 1234
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      const pxPerIn = Math.max(cw, ch) / 64 // ~64″ of stack across the frame
      const stick = 1 * pxPerIn
      const lots = ['GT-104', 'GT-117', 'BT-22', 'N-9', 'GT-131', 'SL-7']
      const g2 = g as CanvasRenderingContext2D & { filter: string }
      for (let y = ch * 0.03 - rnd() * 20; y < ch; ) {
        const thIn = [1, 1.5, 2, 2, 2, 3][Math.floor(rnd() * 6)]
        const thick = thIn * pxPerIn
        let x = -rnd() * 8 * pxPerIn
        while (x < cw) {
          const wIn = [4, 6, 8, 9, 10, 12][Math.floor(rnd() * 6)]
          const bw = wIn * pxPerIn
          const src = rnd() < 0.5 ? f1 : f2
          const srcPerIn = src.width / 21 // each log face covers a 21″ log
          const half = src.width / 2
          // boards come from anywhere between pith and sapwood; a few carry the pale sapwood edge
          const ang = rnd() * Math.PI * 2, rad = 2.5 + rnd() * 6.5
          const sw = wIn * srcPerIn, sh = thIn * srcPerIn
          const sxs = half + Math.cos(ang) * rad * srcPerIn - sw / 2, sys = half + Math.sin(ang) * rad * srcPerIn - sh / 2
          const inset = rnd() < 0.25 ? 0.6 : 0 // some boards sit back in the stack
          g.save()
          g.beginPath()
          g.rect(x + 1, y, bw - 2, thick)
          g.clip()
          g2.filter = 'contrast(1.35) saturate(1.08)'
          g.drawImage(src, Math.max(0, sxs), Math.max(0, sys), Math.min(sw, src.width), Math.min(sh, src.width), x + 1, y, bw - 2, thick)
          g2.filter = 'none'
          // end-sealing wax on a few boards, as depots do to stop end checks
          if (rnd() < 0.14) {
            g.fillStyle = rnd() < 0.5 ? 'rgba(178,52,38,0.55)' : 'rgba(238,230,210,0.55)'
            g.fillRect(x, y, bw, thick)
          }
          // each end catches the light differently; recessed ones fall into shade
          g.fillStyle = `rgba(${rnd() < 0.5 ? '255,228,180' : '60,30,12'},${0.04 + rnd() * 0.14 + inset * 0.4})`
          g.fillRect(x, y, bw, thick)
          const edge = g.createLinearGradient(0, y, 0, y + thick)
          edge.addColorStop(0, 'rgba(255,236,200,0.22)')
          edge.addColorStop(0.15, 'rgba(255,236,200,0)')
          edge.addColorStop(0.8, 'rgba(40,20,8,0)')
          edge.addColorStop(1, 'rgba(40,20,8,0.35)')
          g.fillStyle = edge
          g.fillRect(x, y, bw, thick)
          if (rnd() < 0.07 && thick > pxPerIn * 1.4) {
            g.fillStyle = 'rgba(250,246,236,0.8)'
            g.font = `700 ${Math.round(thick * 0.36)}px Manrope, system-ui, sans-serif`
            g.fillText(lots[Math.floor(rnd() * lots.length)], x + bw * 0.18, y + thick * 0.64)
          }
          g.restore()
          x += bw + pxPerIn * (0.12 + rnd() * 0.25)
        }
        // stickers (1″ square ends) under the layer, every ~2 ft, in the shadow gap
        const sy = y + thick
        for (let sx = rnd() * 30; sx < cw; sx += 24 * pxPerIn / 2.4 + rnd() * pxPerIn) {
          const sg = g.createLinearGradient(0, sy, 0, sy + stick)
          sg.addColorStop(0, '#a77a4c'); sg.addColorStop(1, '#6f4b2c')
          g.fillStyle = sg
          g.fillRect(sx, sy + stick * 0.06, stick, stick * 0.88)
        }
        y += thick + stick
      }
      // light from the upper left, shade toward the back of the shed
      const lg = g.createRadialGradient(cw * 0.25, ch * 0.15, 0, cw * 0.3, ch * 0.3, Math.max(cw, ch) * 0.9)
      lg.addColorStop(0, 'rgba(255,224,170,0.28)')
      lg.addColorStop(0.5, 'rgba(255,224,170,0)')
      lg.addColorStop(1, 'rgba(52,28,14,0.5)')
      g.fillStyle = lg
      g.fillRect(0, 0, cw, ch)
      const u = await canvasUrl(c, 'image/jpeg', 0.88)
      if (alive) setUrl(u)
    })
    return () => { alive = false }
  }, [ready, mobile, qw, qh])
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-[#4a2a17]">
      {url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={fadeIn(true)} />}
    </div>
  )
}

// ── 5. The craft: a 7 × 3 ft panelled teak door, freshly varnished ──
export function DoorStill() {
  const grainV: CSSProperties = { backgroundImage: `url(${TEAK_2K})`, backgroundSize: '900px auto', backgroundColor: '#e6aa62', backgroundBlendMode: 'multiply' }
  // vertical grain: the scan is turned on its side inside each vertical member
  const Vertical = ({ className, style }: { className: string; style?: CSSProperties }) => (
    <div className={`absolute overflow-hidden ${className}`} style={style}>
      <div className="absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] -translate-x-1/2 -translate-y-1/2 rotate-90" style={{ ...grainV, backgroundSize: '700px auto' }} />
    </div>
  )
  const bevel = 'inset 3px 3px 6px rgba(255,226,180,0.35), inset -4px -4px 8px rgba(60,30,12,0.45)'
  const raised = 'inset 0 0 0 3px rgba(90,46,18,0.55), inset 0 0 0 9px rgba(160,96,44,0.35), inset 16px 16px 22px rgba(255,232,196,0.32), inset -18px -18px 26px rgba(52,28,14,0.5)'
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(110% 90% at 30% 20%, #f6e3c4 0%, #e6c79c 45%, #b98654 100%)' }}>
      <div className="absolute inset-x-0 bottom-0 h-[13%] bg-[linear-gradient(180deg,#a87446,#7a4a26)]" />
      <div className="absolute left-1/2 top-[7%] h-[80%] -translate-x-1/2 md:left-[66%]" style={{ aspectRatio: '46 / 89', filter: 'drop-shadow(0 30px 40px rgba(52,28,14,0.35))' }}>
        {/* chowkat: 5″ × 3″ frame around a 36″ × 84″ door */}
        <Vertical className="left-0 top-0 h-full w-[10.9%] rounded-sm" style={{ boxShadow: bevel }} />
        <Vertical className="right-0 top-0 h-full w-[10.9%] rounded-sm" style={{ boxShadow: bevel }} />
        <div className="absolute inset-x-0 top-0 h-[5.6%] rounded-sm" style={{ ...grainV, boxShadow: bevel }} />
        <div className="absolute bottom-0 left-[11.4%] right-[11.4%] top-[6%] bg-[#4a2a16] shadow-[inset_0_0_24px_rgba(52,28,14,0.6)]">
          <div className="absolute inset-[0.6%_1%_0_1%]">
          {/* stiles 4½″, top rail 4½″, lock rail 7″, bottom rail 9″, two raised panels */}
          <Vertical className="left-0 top-0 h-full w-[12.5%]" style={{ boxShadow: bevel }} />
          <Vertical className="right-0 top-0 h-full w-[12.5%]" style={{ boxShadow: bevel }} />
          <div className="absolute left-[12.5%] right-[12.5%] top-0 h-[5.36%]" style={{ ...grainV, boxShadow: bevel }} />
          <div className="absolute left-[12.5%] right-[12.5%] top-[50.7%] h-[8.3%]" style={{ ...grainV, boxShadow: bevel }} />
          <div className="absolute bottom-0 left-[12.5%] right-[12.5%] h-[10.7%]" style={{ ...grainV, boxShadow: bevel }} />
          <Vertical className="left-[12.5%] right-[12.5%] top-[5.36%] h-[45.34%]" style={{ boxShadow: raised }} />
          <Vertical className="bottom-[10.7%] left-[12.5%] right-[12.5%] h-[30.3%]" style={{ boxShadow: raised }} />
          {/* brass pull */}
          <div className="absolute right-[5%] top-[46%] h-[11%] w-[3.2%] rounded-full bg-[linear-gradient(90deg,#8a6420,#f3d58a_45%,#b8862e_70%,#7a5418)] shadow-[2px_6px_10px_rgba(52,28,14,0.5)]" />
          </div>
        </div>
        {/* fresh varnish: a sheen sweeping down the door */}
        <div className="pointer-events-none absolute inset-0 mix-blend-screen motion-safe:animate-[varnish_6s_ease-in-out_infinite] bg-[linear-gradient(115deg,transparent_38%,rgba(255,240,214,0.45)_48%,transparent_58%)] bg-[length:260%_100%]" />
        <div className="absolute -bottom-[2%] left-[-6%] right-[-6%] h-[4%] rounded-[50%] bg-[rgba(52,28,14,0.45)] blur-xl" />
      </div>
      <style>{'@keyframes varnish { 0% { background-position: 130% 0 } 100% { background-position: -40% 0 } }'}</style>
    </div>
  )
}
