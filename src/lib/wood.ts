// Procedural, photo-like wood surfaces drawn on a canvas — long grain (plank faces), end grain
// (log cross-sections) and bark. No image downloads: every species gets its own real-looking grain
// in a few milliseconds, and the same generator feeds the 3D scene, cards and the app sidebar.

export interface WoodTone {
  base: string // earlywood / main body colour
  grain: string // latewood / figure colour
  /** rings per 100px across the board */
  rings?: number
  /** how wavy the figure is (0 straight … 1 wild) */
  figure?: number
  /** dark pores flecks (teak, sal) 0…1 */
  pores?: number
  /** medullary ray flecks (silver oak) 0…1 */
  rays?: number
  knots?: number
  seed?: number
  /** overall sheen variation 0…1 */
  chatoyance?: number
}

type RGB = [number, number, number]

function hex(h: string): RGB {
  const s = h.replace('#', '')
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

// ── tiny seeded value-noise with fractal octaves ──
function makeNoise(seed: number) {
  const perm = new Uint8Array(512)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let s = seed * 9301 + 49297
  for (let i = 255; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const grad = new Float32Array(256)
  for (let i = 0; i < 256; i++) grad[i] = (perm[i] / 255) * 2 - 1
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  function n2(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const X = xi & 255, Y = yi & 255
    const a = grad[perm[X + perm[Y]]], b = grad[perm[X + 1 + perm[Y]]]
    const c = grad[perm[X + perm[Y + 1]]], d = grad[perm[X + 1 + perm[Y + 1]]]
    const u = fade(xf), v = fade(yf)
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
  }
  function fbm(x: number, y: number, oct = 4) {
    let f = 0, amp = 0.5, fr = 1
    for (let i = 0; i < oct; i++) { f += amp * n2(x * fr, y * fr); fr *= 2.03; amp *= 0.5 }
    return f
  }
  return { n2, fbm }
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Plank face: grain runs along x. Returns the canvas (use as texture or toDataURL). */
export function plankCanvas(tone: WoodTone, w = 1024, h = 256): HTMLCanvasElement {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const { n2, fbm } = makeNoise(tone.seed ?? 7)
  const base = hex(tone.base), grain = hex(tone.grain)
  const rings = (tone.rings ?? 6) / 100
  const figure = tone.figure ?? 0.45
  const pores = tone.pores ?? 0.3
  const rays = tone.rays ?? 0
  const chat = tone.chatoyance ?? 0.4
  const knots: { x: number; y: number; r: number }[] = []
  let ks = (tone.seed ?? 7) * 17
  for (let i = 0; i < (tone.knots ?? 0); i++) {
    ks = (ks * 9301 + 49297) % 233280
    const kx = (ks / 233280) * w
    ks = (ks * 9301 + 49297) % 233280
    const ky = (0.2 + 0.6 * (ks / 233280)) * h
    knots.push({ x: kx, y: ky, r: 6 + (ks % 9) })
  }
  const d = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // the board is cut tangentially through growth rings: rings appear as long flames
      const warp = fbm(x * 0.0035, y * 0.02, 4) * 60 * figure + fbm(x * 0.0009, y * 0.004, 2) * 140 * figure
      let r = (y + warp + Math.sin(x * 0.004 + y * 0.01) * 10 * figure) * rings
      for (const k of knots) {
        const dx = (x - k.x) / 2.2, dy = y - k.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        r += (k.r * 3.5) / (dist + k.r) * rings * 18
      }
      const t = r - Math.floor(r)
      // latewood band sharpens toward the ring edge; widths vary ring to ring
      const bandW = 0.22 + 0.12 * n2(Math.floor(r) * 1.7, 3.1)
      const late = smooth(1 - bandW, 1 - bandW * 0.35, t) * (1 - smooth(0.97, 1, t))
      // fine straight fibres along the length
      const fib = n2(x * 0.03, y * 1.6) * 0.5 + n2(x * 0.11, y * 3.4) * 0.25
      // dark open pores, stretched along grain
      const pore = pores > 0 ? smooth(0.72 - pores * 0.12, 0.9, n2(x * 0.18, y * 2.8) * 0.5 + 0.5) * pores : 0
      // silvery ray flecks (quarter sawn look)
      const ray = rays > 0 ? smooth(0.82, 0.95, n2(x * 0.05, y * 0.6) * 0.5 + 0.5) * rays : 0
      // broad light variation gives the "glow" of real wood
      const glow = fbm(x * 0.002, y * 0.008, 3) * chat
      let m = clamp(late * 0.78 + fib * 0.12 + pore * 0.55)
      for (const k of knots) {
        const dx = (x - k.x) / 1.4, dy = y - k.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < k.r) m = clamp(m + (1 - dist / k.r) * 0.9)
      }
      const lift = 1 + glow * 0.22 + ray * 0.25
      const i = (y * w + x) * 4
      d[i] = clamp((base[0] + (grain[0] - base[0]) * m) * lift, 0, 255)
      d[i + 1] = clamp((base[1] + (grain[1] - base[1]) * m) * lift, 0, 255)
      d[i + 2] = clamp((base[2] + (grain[2] - base[2]) * m) * lift, 0, 255)
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Log cross-section with growth rings, sapwood, bark rim, drying checks and pith. Square canvas. */
export function endGrainCanvas(tone: WoodTone & { sapwood?: string; bark?: string }, size = 512): HTMLCanvasElement {
  const c = canvas(size, size)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const { n2, fbm } = makeNoise((tone.seed ?? 3) + 101)
  const base = hex(tone.base), grain = hex(tone.grain)
  const sap = hex(tone.sapwood ?? '#E9C99A'), bark = hex(tone.bark ?? '#4E3524')
  const cx = size / 2 + size * 0.02, cy = size / 2 - size * 0.015
  const R = size / 2
  const ringCount = (tone.rings ?? 6) * 3.2
  const cracks = [0.3, 2.1, 4.0].map((a) => a + ((tone.seed ?? 3) % 5) * 0.2)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      const ang = Math.atan2(dy, dx)
      const wob = fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5, 3) * 0.06 + fbm(dx * 0.01, dy * 0.01, 2) * 0.02
      const rn = Math.sqrt(dx * dx + dy * dy) / R // 0 at pith, 1 at rim
      const rr = rn * (1 + wob)
      let col: RGB
      if (rr > 0.965) {
        const bn = n2(ang * 40, rr * 30) * 0.5 + 0.5
        const k = 0.75 + bn * 0.35
        col = [bark[0] * k, bark[1] * k, bark[2] * k]
      } else {
        const ring = rr * ringCount + n2(ang * 3, rr * 5) * 0.25
        const t = ring - Math.floor(ring)
        const late = smooth(0.7, 0.92, t) * (1 - smooth(0.96, 1, t))
        const sapW = smooth(0.8, 0.9, rr)
        const tone0: RGB = [base[0] + (sap[0] - base[0]) * sapW, base[1] + (sap[1] - base[1]) * sapW, base[2] + (sap[2] - base[2]) * sapW]
        const saw = n2(x * 0.9, y * 0.05) * 0.06 // faint saw marks
        const m = clamp(late * 0.7 + saw + (rr < 0.05 ? 0.6 : 0))
        col = [tone0[0] + (grain[0] - tone0[0]) * m, tone0[1] + (grain[1] - tone0[1]) * m, tone0[2] + (grain[2] - tone0[2]) * m]
        // drying checks from the rim inward
        for (const a of cracks) {
          let da = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
          da *= rn * R
          if (rr > 0.45 && da < 1.4 * (rr - 0.45) * 2) {
            const k = 0.45
            col = [col[0] * k, col[1] * k, col[2] * k]
          }
        }
        const shade = 0.9 + 0.12 * (1 - rr)
        col = [col[0] * shade, col[1] * shade, col[2] * shade]
      }
      const i = (y * size + x) * 4
      d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255)
      d[i + 3] = rn <= 1 ? 255 : 0
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Bark: deep vertical furrows. Returns colour map and a height map (for bump/normal). */
export function barkCanvases(seed = 11, w = 512, h = 1024, tint = '#5A3F2B') {
  const color = canvas(w, h)
  const height = canvas(w, h)
  const cctx = color.getContext('2d')!, hctx = height.getContext('2d')!
  const ci = cctx.createImageData(w, h), hi = hctx.createImageData(w, h)
  const { n2, fbm } = makeNoise(seed)
  const t = hex(tint)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w
      // furrows run along the log (y) and wrap seamlessly around (x)
      const wrapX = Math.cos(u * Math.PI * 2) * 3, wrapZ = Math.sin(u * Math.PI * 2) * 3
      const ridge = 1 - Math.abs(fbm(wrapX * 2.2 + y * 0.002, wrapZ * 2.2 + y * 0.004, 4)) * 2.4
      const plates = n2(wrapX * 6 + 11, y * 0.03) * 0.5 + 0.5
      const hgt = clamp(ridge * 0.75 + plates * 0.35)
      const moss = smooth(0.55, 0.8, fbm(wrapX + 20, y * 0.01, 3) + 0.5) * 0.35
      const k = 0.45 + hgt * 0.75
      const i = (y * w + x) * 4
      ci.data[i] = clamp(t[0] * k * (1 - moss * 0.3) + moss * 40, 0, 255)
      ci.data[i + 1] = clamp(t[1] * k + moss * 60, 0, 255)
      ci.data[i + 2] = clamp(t[2] * k * (1 - moss * 0.4), 0, 255)
      ci.data[i + 3] = 255
      const hv = hgt * 255
      hi.data[i] = hv; hi.data[i + 1] = hv; hi.data[i + 2] = hv; hi.data[i + 3] = 255
    }
  }
  cctx.putImageData(ci, 0, 0)
  hctx.putImageData(hi, 0, 0)
  return { color, height }
}

// ── species looks (shared by website, 3D scene and app) ──
export const SPECIES_TONES: Record<string, WoodTone> = {
  teak: { base: '#C08A4E', grain: '#6E4421', rings: 5, figure: 0.55, pores: 0.35, chatoyance: 0.55 },
  burma: { base: '#B98043', grain: '#5E3A1B', rings: 7, figure: 0.4, pores: 0.4, chatoyance: 0.6 },
  sal: { base: '#9C5F3A', grain: '#5C301B', rings: 9, figure: 0.3, pores: 0.45, chatoyance: 0.3 },
  honne: { base: '#B4552F', grain: '#6E2814', rings: 6, figure: 0.6, pores: 0.25, chatoyance: 0.5 },
  rosewood: { base: '#6A3426', grain: '#2E1410', rings: 8, figure: 0.65, pores: 0.3, chatoyance: 0.45 },
  matti: { base: '#8C6B4F', grain: '#4F3A29', rings: 5, figure: 0.45, pores: 0.35, chatoyance: 0.35 },
  jackfruit: { base: '#D59A3D', grain: '#9A5E1C', rings: 5, figure: 0.5, pores: 0.2, chatoyance: 0.6 },
  silveroak: { base: '#C9A27E', grain: '#8C6448', rings: 6, figure: 0.35, pores: 0.1, rays: 0.8, chatoyance: 0.4 },
  pine: { base: '#E6C48E', grain: '#B47A3C', rings: 4, figure: 0.4, pores: 0, knots: 2, chatoyance: 0.3 },
  mango: { base: '#C9A57A', grain: '#7F5E3C', rings: 6, figure: 0.7, pores: 0.15, chatoyance: 0.4 },
  neem: { base: '#B5774C', grain: '#734325', rings: 7, figure: 0.4, pores: 0.25, chatoyance: 0.35 },
  meranti: { base: '#B4614A', grain: '#7A3524', rings: 5, figure: 0.3, pores: 0.4, chatoyance: 0.4 },
  walnut: { base: '#7A4E2E', grain: '#3E2414', rings: 6, figure: 0.5, pores: 0.3, chatoyance: 0.5 },
}

/** Picks a look for a species by name, or builds one from its stored colours. */
export function toneFor(name: string, color?: string | null, grain?: string | null, seed = 1): WoodTone {
  const n = name.toLowerCase()
  const key =
    n.includes('burma') ? 'burma' : n.includes('teak') ? 'teak' : n.includes('sal') ? 'sal' : n.includes('honne') || n.includes('padauk') ? 'honne'
    : n.includes('rose') ? 'rosewood' : n.includes('matti') || n.includes('terminalia') ? 'matti' : n.includes('jack') || n.includes('halasu') ? 'jackfruit'
    : n.includes('silver') ? 'silveroak' : n.includes('pine') || n.includes('deodar') ? 'pine' : n.includes('mango') ? 'mango'
    : n.includes('neem') ? 'neem' : n.includes('meranti') || n.includes('mahogany') ? 'meranti' : n.includes('walnut') ? 'walnut' : ''
  const t = key ? SPECIES_TONES[key] : { base: color ?? '#B8742F', grain: grain ?? '#6B3F1D', rings: 6, figure: 0.5, pores: 0.25 }
  return { ...t, seed }
}

const urlCache = new Map<string, string>()

/** Cached data-URL of a plank texture (JPEG keeps it small). */
export function plankUrl(tone: WoodTone, w = 640, h = 160): string {
  const k = JSON.stringify([tone, w, h])
  let u = urlCache.get(k)
  if (!u) {
    u = plankCanvas(tone, w, h).toDataURL('image/jpeg', 0.86)
    urlCache.set(k, u)
  }
  return u
}

/** Cached data-URL of a log end face (PNG keeps the round edge transparent). */
export function endGrainUrl(tone: WoodTone, px = 96): string {
  const k = JSON.stringify(['end', tone, px])
  let u = urlCache.get(k)
  if (!u) {
    u = endGrainCanvas(tone, px).toDataURL('image/png')
    urlCache.set(k, u)
  }
  return u
}

/** Same as plankUrl but also kept across page loads in sessionStorage (used for the app sidebar).
 *  vertical: grain runs top-to-bottom, like a door stile. */
export function plankUrlPersisted(id: string, tone: WoodTone, w: number, h: number, vertical = false): string {
  const key = `mtd-wood-${id}-${w}x${h}${vertical ? 'v' : ''}`
  try {
    const s = sessionStorage.getItem(key)
    if (s) return s
  } catch { /* storage blocked */ }
  let u: string
  if (vertical) {
    const src = plankCanvas(tone, h, w)
    const c = canvas(w, h)
    const ctx = c.getContext('2d')!
    ctx.translate(w, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(src, 0, 0)
    u = c.toDataURL('image/jpeg', 0.84)
  } else {
    u = plankUrl(tone, w, h)
  }
  try { sessionStorage.setItem(key, u) } catch { /* quota */ }
  return u
}
